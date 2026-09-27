import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerRouter } from '../hooks/register.js';

const choice = { choice: 'low', contextSufficient: true, risky: false };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function world(provider = async () => choice, now = async () => 10) {
  const handlers = new Map(), logs = [], sent = [], calls = [];
  let expire;
  const $ = {
    command: { register: async () => {} },
    ui: { status() {}, log(text) { logs.push(text); } },
    clock: { now, sleep: (ms, { signal }) => new Promise((resolve, reject) => {
      expire = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }) },
  };
  registerRouter((name, ...args) => handlers.set(name, args.at(-1)), async state => { calls.push(state); return provider(state); });
  const event = (name, e, next = async e => e) => handlers.get(name)($, e, next);
  const command = args => event('command.run', { args });
  const start = () => event('session.start', {});
  const submit = (turnId = 't1', text = 'CANARY_SECRET', extra = {}) => event('prompt.submit',
    { text, origin: { kind: 'composer' }, wait: false, ...extra },
    async e => { await event('turn.start', { turnId, text: e.text }); return { text: e.text }; });
  const step = async (extra = {}) => {
    const e = { turnId: 't1', index: 0, effort: 'high', model: 'unchanged', messageCount: 1, ...extra };
    const stream = event('turn.step', e, async function* (value) { sent.push(value); yield 'chunk'; return 'result'; });
    assert.deepEqual(await stream.next(), { value: 'chunk', done: false });
    assert.deepEqual(await stream.next(), { value: 'result', done: true });
    assert.equal(sent.at(-1), e);
  };
  return { event, command, start, submit, step, logs, calls, sent, expire: () => expire() };
}

test('off does not classify; shadow is explicit and delegates identical requests', async () => {
  const w = world(); await w.start(); await w.submit(); await w.step();
  assert.equal(w.calls.length, 0);
  await w.command('shadow'); await w.submit(); await w.step(); await w.step({ index: 1 });
  assert.equal(w.calls.length, 1); assert.equal(w.logs.length, 0);
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 1);
  assert.match(w.logs[0], /추천 low/);
  assert.match(w.logs[0], /high 유지/);
  assert.ok(!w.logs[0].includes('CANARY_SECRET'));
});

test('protected, ambiguous and unsupported requests never reach provider', async () => {
  for (const [prompt, step] of [
    [{}, { effort: 'max' }], [{}, { effort: undefined }], [{}, { effort: 10000 }],
    [{}, { agentId: 'child' }], [{ wait: true }, {}], [{ turnId: 'old' }, {}],
    [{ attachments: [{ type: 'image' }] }, {}], [{ context: ['hidden'] }, {}],
    [{ origin: { kind: 'plugin', name: 'other' } }, {}], [{ text: 'x'.repeat(6001) }, {}],
  ]) {
    const w = world(); await w.start(); await w.command('shadow');
    await w.submit('t1', prompt.text ?? 'CANARY_SECRET', prompt); await w.step(step);
    assert.equal(w.calls.length, 0);
  }
});

test('lock and session restart stop classification; enforce is unavailable', async () => {
  const w = world(); await w.start(); await w.command('shadow'); await w.command('lock');
  await w.submit(); await w.step(); assert.equal(w.calls.length, 0);
  await w.command('unlock'); await w.submit(); await w.step(); assert.equal(w.calls.length, 1);
  await w.start(); await w.submit(); await w.step(); assert.equal(w.calls.length, 1);
  assert.match((await w.command('enforce')).text, /아직 사용할 수 없습니다/);
});

test('off, lock, interruption and session changes invalidate in-flight decisions', async () => {
  for (const action of ['off', 'lock', 'complete', 'session', 'midturn']) {
    const pending = deferred(), began = deferred();
    const w = world(() => { began.resolve(); return pending.promise; });
    await w.start(); await w.command('shadow'); await w.submit();
    const stepping = w.step(); await began.promise;
    if (action === 'complete') await w.event('turn.complete', { turnId: 't1' });
    else if (action === 'session') await w.start();
    else if (action === 'midturn') await w.event('prompt.submit', { turnId: 't1', text: 'new', wait: false, origin: { kind: 'composer' } });
    else await w.command(action);
    await stepping; pending.resolve(choice); await Promise.resolve();
    assert.equal(w.logs.length, 0);
  }
});

test('timeout and errors preserve the original and never leak exception text', async () => {
  const began = deferred(), pending = deferred();
  const w = world(() => { began.resolve(); return pending.promise; });
  await w.start(); await w.command('shadow'); await w.submit();
  const stepping = w.step(); await began.promise; w.expire(); await stepping;
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.match(w.logs[0], /시간 초과/); pending.resolve(choice);
  const broken = world(() => { throw new Error('SECRET_API_KEY'); });
  await broken.start(); await broken.command('shadow'); await broken.submit(); await broken.step();
  await broken.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.match(broken.logs[0], /분류 실패/); assert.ok(!broken.logs[0].includes('SECRET_API_KEY'));
});

test('a dropped or queued prompt cannot classify an unrelated later turn', async () => {
  const w = world(); await w.start(); await w.command('shadow');
  await w.event('prompt.submit', { text: 'old', wait: false, origin: { kind: 'composer' } }, async () => ({ drop: 'blocked' }));
  await w.event('turn.start', { turnId: 't1', text: 'old' }); await w.step();
  assert.equal(w.calls.length, 0);
});

test('overlapping submissions and rewritten prompts are conservatively skipped', async () => {
  const w = world(); await w.start(); await w.command('shadow');
  const pending = deferred();
  const first = w.event('prompt.submit', { text: 'same', wait: false, origin: { kind: 'composer' } }, () => pending.promise);
  await w.submit('t1', 'same'); await w.step(); pending.resolve({ text: 'same' }); await first;
  assert.equal(w.calls.length, 0);
  await w.event('turn.complete', { turnId: 't1' });
  await w.event('prompt.submit', { text: 'before', wait: false, origin: { kind: 'composer' } },
    () => w.event('turn.start', { turnId: 't1', text: 'after' }));
  await w.step(); assert.equal(w.calls.length, 0);
});

test('a completed turn releases state and the next turn gets a fresh decision', async () => {
  const w = world(); await w.start(); await w.command('shadow');
  await w.submit(); await w.step(); await w.event('turn.complete', { turnId: 't1' });
  await w.submit('t2', 'next'); await w.step({ turnId: 't2' });
  assert.equal(w.calls.length, 2); assert.equal(w.calls[1].userPrompt, 'next');
});

test('off while the clock yields prevents even starting classification', async () => {
  const w = world(); await w.start(); await w.command('shadow'); await w.submit();
  const stepping = w.step();
  await w.command('off'); await stepping;
  assert.equal(w.calls.length, 0); assert.equal(w.logs.length, 0);
});


test('footer appears after completion delegation, once, and uses the last forwarded effort', async () => {
  const w = world(); await w.start(); await w.command('shadow'); await w.submit(); await w.step();
  await w.step({ index: 1, effort: 'medium' });
  await w.event('turn.complete', { turnId: 't1', agentId: 'child' });
  assert.equal(w.logs.length, 0);
  const result = await w.event('turn.complete', { turnId: 't1', reason: 'answer' }, async () => {
    assert.equal(w.logs.length, 0);
    return { untouched: true };
  });
  assert.deepEqual(result, { untouched: true });
  assert.equal(w.logs.length, 1);
  assert.match(w.logs[0], /마지막 요청 medium/);
  assert.ok(!w.logs[0].includes('\n'));
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 1);
});

test('off or session change during completion suppresses the stale footer', async () => {
  for (const action of ['off', 'session']) {
    const w = world(); await w.start(); await w.command('shadow'); await w.submit(); await w.step();
    await w.event('turn.complete', { turnId: 't1', reason: 'answer' }, async () => {
      if (action === 'off') await w.command('off'); else await w.start();
    });
    assert.equal(w.logs.length, 0);
  }
});

test('interrupted and failed completed turns are labeled without changing responses', async () => {
  for (const [reason, label] of [['aborted', '중단'], ['error', '오류'], ['refusal', '거절']]) {
    const w = world(); await w.start(); await w.command('shadow'); await w.submit(); await w.step();
    const response = { text: 'original response' };
    assert.equal(await w.event('turn.complete', { turnId: 't1', reason }, async () => response), response);
    assert.equal(w.logs.length, 1); assert.ok(w.logs[0].endsWith(label));
  }
});


test('status retains only the last completed summary and clears it on session start', async () => {
  const w = world(); await w.start(); await w.command('shadow'); await w.submit(); await w.step();
  assert.match((await w.command('status')).text, /최근 완료: 없음/);
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  await w.command('off');
  const text = (await w.command('status')).text;
  assert.match(text, /꺼짐\(off\)/);
  assert.ok(text.includes(w.logs[0]));
  assert.ok(!text.includes('CANARY_SECRET'));
  await w.start(); assert.match((await w.command('status')).text, /최근 완료: 없음/);
});


test('a third submission remains ambiguous while an earlier submit is unsettled', async () => {
  const w = world(); await w.start(); await w.command('shadow');
  const pending = deferred();
  const first = w.event('prompt.submit', { text: 'same', wait: false, origin: { kind: 'composer' } }, () => pending.promise);
  await w.event('prompt.submit', { text: 'same', wait: false, origin: { kind: 'composer' } });
  await w.submit('t1', 'same'); await w.step();
  pending.resolve({ text: 'same' }); await first;
  assert.equal(w.calls.length, 0);
});

test('mid-turn input during the final timing read cannot revive a stale recommendation', async () => {
  const timing = deferred(), atTiming = deferred();
  let reads = 0;
  const w = world(undefined, () => {
    if (++reads === 2) { atTiming.resolve(); return timing.promise; }
    return Promise.resolve(10);
  });
  await w.start(); await w.command('shadow'); await w.submit();
  const stepping = w.step(); await atTiming.promise;
  await w.event('prompt.submit', { turnId: 't1', text: 'changed', wait: false, origin: { kind: 'composer' } });
  timing.resolve(20); await stepping;
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 0);
});
