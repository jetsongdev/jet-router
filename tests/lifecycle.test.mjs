import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerRouter } from '../hooks/register.js';

const choice = { choice: 'low', contextSufficient: true, risky: false };
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };

function world(provider = async () => choice, now = async () => 10, options = {}, run = async () => { throw new Error('unexpected process'); }) {
  const handlers = new Map(), logs = [], notices = [], sent = [], calls = [];
  let expire;
  const $ = {
    plugin: { root: '/plugin with spaces' }, process: { run },
    command: { register: async () => {} },
    ui: { status() {}, log(text) { logs.push(text); } },
    clock: { now, sleep: (ms, { signal }) => new Promise((resolve, reject) => {
      expire = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }) },
  };
  registerRouter((name, ...args) => handlers.set(name, args.at(-1)), async state => { calls.push(state); return provider(state); }, options);
  const event = (name, e, next = async e => e) => handlers.get(name)($, e, next);
  const command = args => event('command.run', { args });
  // The session-start notice is kept apart so summary counts stay per turn.
  const start = async () => { const result = await event('session.start', {}); notices.push(...logs.splice(0)); return result; };
  const submit = (turnId = 't1', text = 'CANARY_SECRET', extra = {}) => event('prompt.submit',
    { text, origin: { kind: 'composer' }, wait: false, ...extra },
    async e => { await event('turn.start', { turnId, text: e.text }); return { text: e.text }; });
  const step = async (extra = {}) => {
    const e = { turnId: 't1', index: 0, effort: 'high', model: 'unchanged', messageCount: 1, ...extra };
    const stream = event('turn.step', e, async function* (value) { sent.push(value); yield 'chunk'; return 'result'; });
    assert.deepEqual(await stream.next(), { value: 'chunk', done: false });
    assert.deepEqual(await stream.next(), { value: 'result', done: true });
    assert.ok(sent.includes(e)); // Concurrent steps may finish in a different order.
  };
  return { event, command, start, submit, step, logs, notices, calls, sent, expire: () => expire() };
}

test('off does not classify; shadow is explicit and delegates identical requests', async () => {
  const w = world(); await w.start(); await w.submit(); await w.step();
  assert.equal(w.calls.length, 0);
  await w.command('shadow'); await w.submit(); await w.step(); await w.step({ index: 1 });
  assert.equal(w.calls.length, 1); assert.equal(w.logs.length, 0);
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 1);
  assert.match(w.logs[0], /fake\.shadow\(\): high → low\(고정값\)/);
  assert.ok(!w.logs[0].includes('마지막 요청'));
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

test('lock and session restart stop classification; enforce is a mode', async () => {
  const w = world(); await w.start(); await w.command('shadow'); await w.command('lock');
  await w.submit(); await w.step(); assert.equal(w.calls.length, 0);
  await w.command('unlock'); await w.submit(); await w.step(); assert.equal(w.calls.length, 1);
  await w.start(); await w.submit(); await w.step(); assert.equal(w.calls.length, 1);
  assert.match((await w.command('enforce')).text, /적용\(enforce\)/);
  assert.match((await w.command('enforce')).text, /켜짐 — 해당 턴과 그 턴의 subagent만/);
});

// Steps capture the object handed downstream so enforce rewrites are visible.
async function forward(w, extra = {}) {
  const e = { turnId: 't1', index: 0, effort: 'high', model: 'unchanged', messageCount: 1, ...extra };
  let seen;
  const stream = w.event('turn.step', e, async function* (value) { seen = value; yield 'chunk'; return 'result'; });
  for (let item = await stream.next(); !item.done; item = await stream.next()) void item;
  return { e, seen };
}

test('enforce applies downshifts and upshifts to every step of that turn only', async () => {
  for (const [original, chosen] of [['high', 'low'], ['medium', 'xhigh']]) {
    let calls = 0; // The next turn's own decision is keep, so nothing may carry over.
    const w = world(async () => ({ ...choice, choice: calls++ ? 'keep' : chosen })); await w.start(); await w.command('enforce');
    await w.submit();
    const first = await forward(w, { effort: original });
    const loop = await forward(w, { effort: original, index: 1 });
    assert.equal(first.seen.effort, chosen); assert.equal(loop.seen.effort, chosen);
    assert.equal(first.seen.messageCount, 1); assert.equal(first.e.effort, original);
    await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
    assert.deepEqual(w.logs, [`fake.enforce(): ${original} → ${chosen} 적용(고정값) · 0ms`]);
    await w.submit('t2', 'next');
    const after = await forward(w, { turnId: 't2', effort: original });
    assert.equal(after.seen, after.e); assert.equal(w.calls.length, 2);
  }
});

test('enforce yields to a mid-turn effort change for the rest of the turn', async () => {
  const w = world(); await w.start(); await w.command('enforce'); await w.submit();
  assert.equal((await forward(w)).seen.effort, 'low');
  const changed = await forward(w, { index: 1, effort: 'xhigh' });
  const back = await forward(w, { index: 2, effort: 'high' });
  assert.equal(changed.seen, changed.e); assert.equal(back.seen, back.e);
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.deepEqual(w.logs, ['fake.enforce(): high → low 적용(고정값) · 0ms · 사용자 변경으로 적용 중단']);
});

test('enforce leaves keep, same effort, max, subagents, lock and skipped turns unchanged', async () => {
  for (const [provider, extra, before] of [
    [async () => ({ ...choice, choice: 'keep' }), {}, null],
    [async () => ({ ...choice, choice: 'high' }), {}, null],
    [async () => ({ ...choice, contextSufficient: false }), {}, null],
    [undefined, { effort: 'max' }, null],
    [undefined, { agentId: 'child' }, null],
    [undefined, {}, 'lock'],
    [async () => { throw new Error('boom'); }, {}, null],
  ]) {
    const w = world(provider); await w.start(); await w.command('enforce');
    if (before) await w.command(before);
    await w.submit();
    const { e, seen } = await forward(w, extra);
    assert.equal(seen, e);
  }
  const w = world(); await w.start(); await w.command('enforce');
  await w.submit('t1', 'CANARY_SECRET', { attachments: [{ type: 'image' }] });
  const { e, seen } = await forward(w);
  assert.equal(seen, e); assert.equal(w.calls.length, 0);
});

test('subagents inherit the applied effort of the main turn running at their first step', async () => {
  for (const chosen of ['low', 'xhigh']) {
    const w = world(async () => ({ ...choice, choice: chosen })); await w.start(); await w.command('enforce'); await w.submit();
    assert.equal((await forward(w)).seen.effort, chosen);
    const sub = extra => forward(w, { turnId: 's1', agentId: 'a1', ...extra });
    assert.equal((await sub()).seen.effort, chosen);
    // Background subagents keep the binding after the main turn completes.
    await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
    assert.equal((await sub({ index: 1 })).seen.effort, chosen);
    // A subagent started with no main turn running (such as /subtask) is untouched.
    const orphan = await forward(w, { turnId: 's2', agentId: 'a2' });
    assert.equal(orphan.seen, orphan.e);
    assert.equal(w.logs.length, 1); // Subagents never add summaries.
  }
});

test('subagent inheritance yields to user changes, holdout, shadow, off and completion', async () => {
  const bound = async (options = {}) => {
    const w = world(undefined, undefined, options); await w.start(); await w.command('enforce'); await w.submit();
    await forward(w);
    return w;
  };
  const sub = (w, extra) => forward(w, { turnId: 's1', agentId: 'a1', ...extra });
  let w = await bound();
  assert.equal((await sub(w)).seen.effort, 'low');
  let changed = await sub(w, { index: 1, effort: 'xhigh' });
  assert.equal(changed.seen, changed.e);
  changed = await sub(w, { index: 2 }); // Once the user changed it, the subagent stays theirs.
  assert.equal(changed.seen, changed.e);
  w = await bound();
  changed = await sub(w, { model: 'changed-model' });
  assert.equal(changed.seen, changed.e);
  // A main turn that yielded, or is a holdout, has nothing to pass on.
  w = await bound();
  await forward(w, { index: 1, effort: 'xhigh' });
  changed = await sub(w, { effort: 'xhigh' });
  assert.equal(changed.seen, changed.e);
  w = await bound({ holdoutRate: '0.5', random: () => 0 });
  changed = await sub(w);
  assert.equal(changed.seen, changed.e);
  // Shadow never rewrites; off clears bindings; a completed subagent turn is forgotten.
  w = world(); await w.start(); await w.command('shadow'); await w.submit(); await forward(w);
  changed = await sub(w);
  assert.equal(changed.seen, changed.e);
  w = await bound();
  assert.equal((await sub(w)).seen.effort, 'low');
  await w.command('off'); await w.command('enforce');
  changed = await sub(w, { index: 1 });
  assert.equal(changed.seen, changed.e);
  w = await bound();
  assert.equal((await sub(w)).seen.effort, 'low');
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  await w.event('turn.complete', { turnId: 's1', agentId: 'a1', reason: 'answer' });
  changed = await sub(w, { index: 1 });
  assert.equal(changed.seen, changed.e);
});

test('subagent usage is logged as its own kind with the inherited decision or control arm', async () => {
  for (const [options, applied, holdout] of [[{}, 'low', false], [{ holdoutRate: '0.5', random: () => 0 }, null, true]]) {
    const runs = [];
    const run = async (argv, init) => { runs.push(JSON.parse(init.stdin)); return { exitCode: 0, stdout: '', stderr: '' }; };
    const w = world(undefined, undefined, { usageLog: true, ...options }, run);
    await w.event('session.start', { cwd: '/work/icp' }); await w.command('enforce'); await w.submit(); await forward(w);
    await forward(w, { turnId: 's1', agentId: 'a1' });
    await w.event('turn.complete', { turnId: 't1', reason: 'answer', usage: { output_tokens: 40 } });
    await forward(w, { turnId: 's1', agentId: 'a1', index: 1 });
    await w.event('turn.complete', { turnId: 's1', agentId: 'a1', reason: 'answer', durationMs: 700, usage: { output_tokens: 90 } });
    assert.deepEqual(runs.map(r => [r.kind, r.original, r.recommendation, r.applied, r.holdout, r.usage.output]),
      [['main', 'high', 'low', applied, holdout, 40], ['subagent', 'high', 'low', applied, holdout, 90]]);
    assert.equal(runs[1].classifyMs, null);
  }
  // A subagent with no main turn (such as /subtask) is not logged; a user change marks it yielded.
  const runs = [];
  const run = async (argv, init) => { runs.push(JSON.parse(init.stdin)); return { exitCode: 0, stdout: '', stderr: '' }; };
  const w = world(undefined, undefined, { usageLog: true }, run);
  await w.start(); await w.command('enforce');
  await forward(w, { turnId: 's0', agentId: 'a0' });
  await w.event('turn.complete', { turnId: 's0', agentId: 'a0', reason: 'answer' });
  assert.equal(runs.length, 0);
  await w.submit(); await forward(w);
  await forward(w, { turnId: 's1', agentId: 'a1' }); await forward(w, { turnId: 's1', agentId: 'a1', index: 1, effort: 'xhigh' });
  await w.event('turn.complete', { turnId: 's1', agentId: 'a1', reason: 'answer' });
  assert.deepEqual([runs[0].kind, runs[0].applied, runs[0].yielded, runs[0].forwarded], ['subagent', 'low', true, 'xhigh']);
});

test('switching off mid-turn stops applying the enforced effort', async () => {
  const w = world(); await w.start(); await w.command('enforce'); await w.submit();
  assert.equal((await forward(w)).seen.effort, 'low');
  await w.command('off');
  const later = await forward(w, { index: 1 });
  assert.equal(later.seen, later.e);
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

test('turns nobody typed stay silent while queued user input still reports the skip', async () => {
  for (const kind of ['peer', 'task-notification']) {
    const w = world(); await w.start(); await w.command('shadow');
    await w.submit('t1', 'report', { origin: { kind } }); await w.step();
    await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
    assert.equal(w.calls.length, 0); assert.equal(w.logs.length, 0);
  }
  const w = world(); await w.start(); await w.command('shadow');
  await w.event('turn.start', { turnId: 't1', text: 'notification' }); await w.step();
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 0);
  await w.event('prompt.submit', { text: 'queued', wait: false, origin: { kind: 'composer' } });
  await w.event('turn.start', { turnId: 't2', text: 'queued' }); await w.step({ turnId: 't2' });
  await w.event('turn.complete', { turnId: 't2', reason: 'answer' });
  assert.equal(w.calls.length, 0);
  assert.deepEqual(w.logs, ['fake 생략: 대기 중 입력 · shadow']);
});

test('skipped turns name the specific reason instead of a generic correlation miss', async () => {
  const cases = [
    [{ attachments: [{ type: 'image' }] }, 'CANARY_SECRET', '첨부 포함'],
    [{ context: ['hidden'] }, 'CANARY_SECRET', '숨은 문맥 포함'],
    [{ wait: true }, 'CANARY_SECRET', '입력 겹침'],
    [{}, 'x'.repeat(6001), '6,000자 초과'],
    [{}, '   ', '빈 입력'],
  ];
  for (const [extra, text, label] of cases) {
    const w = world(); await w.start(); await w.command('shadow');
    await w.submit('t1', text, extra); await w.step();
    await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
    assert.deepEqual(w.logs, [`fake 생략: ${label} · shadow`]);
  }
  for (const [text, label] of [['/probe', '스킬·명령 입력'], ['before', '입력 변경됨']]) {
    const w = world(); await w.start(); await w.command('shadow');
    await w.event('prompt.submit', { text, wait: false, origin: { kind: 'composer' } },
      () => w.event('turn.start', { turnId: 't1', text: '<command-name>expanded</command-name>' }));
    await w.step(); await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
    assert.equal(w.calls.length, 0);
    assert.deepEqual(w.logs, [`fake 생략: ${label} · shadow`]);
  }
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

const jevOptions = { provider: 'jev', cloudConsent: true, jevApiKey: 'KEY_CANARY' };
const jevResult = { exitCode: 0, stdout: JSON.stringify({ ok: true, decision: {
  provider: 'jev', providerModel: 'jev-test', choice: 'low', confidence: 0.9, contextScore: 0.95, riskScore: 0.01,
} }), stderr: '' };

test('Jev requires consent and key; fake, off, lock and protected input never spawn', async () => {
  for (const [options, mode, step] of [
    [{ ...jevOptions, cloudConsent: false }, 'shadow', {}],
    [{ ...jevOptions, cloudConsent: 'true' }, 'shadow', {}],
    [{ ...jevOptions, jevApiKey: '' }, 'shadow', {}],
    [{ ...jevOptions, provider: 'fake' }, 'shadow', {}],
    [jevOptions, 'off', {}], [jevOptions, 'lock', {}],
    [jevOptions, 'shadow', { effort: 'max' }], [jevOptions, 'shadow', { agentId: 'child' }],
  ]) {
    let calls = 0;
    const w = world(undefined, undefined, options, async () => { calls++; return jevResult; });
    await w.start(); await w.command(mode); await w.submit(); await w.step(step);
    assert.equal(calls, 0);
  }
});

test('Jev passes sensitive data only via stdin and labels the unchanged result unevaluated', async () => {
  const calls = [];
  const w = world(undefined, undefined, jevOptions, async (...args) => { calls.push(args); return jevResult; });
  await w.start(); await w.command('shadow'); await w.submit(); await w.step(); await w.step({ index: 1 });
  assert.equal(calls.length, 1);
  const [argv, init] = calls[0];
  assert.deepEqual(argv, ['node', '/plugin with spaces/scripts/jev-request.mjs']);
  assert.ok(!JSON.stringify(argv).includes('CANARY'));
  assert.equal(JSON.parse(init.stdin).apiKey, 'KEY_CANARY');
  const routing = JSON.parse(init.stdin).routingInput;
  assert.equal(routing.effort.value, 'high');
  assert.equal(routing.effort.source, 'host');
  assert.equal(routing.target.model, 'unchanged');
  assert.equal(routing.target.supportedEfforts, null);
  assert.equal(routing.context.missingRequired, null);
  assert.equal(routing.event.correlated, true);
  assert.equal(init.timeoutMs, 4000); assert.equal(init.env.NODE_DEBUG, '');
  assert.equal(init.env.NODE_OPTIONS, ''); assert.equal(init.env.NODE_TLS_REJECT_UNAUTHORIZED, '1');
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.match(w.logs[0], /^Jev\.shadow\(\): high → low/);
  assert.ok(!w.logs[0].includes('CANARY'));
  assert.equal(w.calls.length, 0); // Never falls back to fake.
});

test('a context-variant model name like claude-opus-5-5[1m] classifies and logs as the base model', async () => {
  const runs = [];
  const run = async (argv, init) => {
    runs.push({ argv, stdin: init.stdin });
    return argv[1].endsWith('/scripts/jev-request.mjs') ? jevResult : { exitCode: 0, stdout: '', stderr: '' };
  };
  const w = world(undefined, undefined, { ...jevOptions, usageLog: true }, run);
  await w.start(); await w.command('enforce'); await w.submit();
  const { seen } = await forward(w, { model: 'claude-opus-5-5[1m]' });
  await w.event('turn.complete', { turnId: 't1', reason: 'answer', usage: { output_tokens: 10 } });
  const [jev, usage] = runs;
  assert.equal(JSON.parse(jev.stdin).routingInput.target.model, 'claude-opus-5-5');
  assert.match(w.logs[0], /^Jev\.enforce\(\): high → low 적용/);
  assert.equal(JSON.parse(usage.stdin).model, 'claude-opus-5-5');
  assert.deepEqual([seen.model, seen.effort], ['claude-opus-5-5[1m]', 'low']); // The host request keeps its own model.
});

test('enforce leaves Jev candidates below the apply probability unchanged', async () => {
  for (const [selectedProbability, effort, label] of [[0.48, 'high', /high → low 확률 미달 미적용/], [0.7, 'low', /high → low 적용/], [undefined, 'low', /high → low 적용/]]) {
    const decision = { ...JSON.parse(jevResult.stdout).decision, ...(selectedProbability === undefined ? {} : { selectedProbability }) };
    const w = world(undefined, undefined, jevOptions, async () => ({ ...jevResult, stdout: JSON.stringify({ ok: true, decision }) }));
    await w.start(); await w.command('enforce'); await w.submit();
    assert.equal((await forward(w)).seen.effort, effort);
    await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
    assert.match(w.logs[0], label);
  }
});

test('Jev failure has no fallback and timeout keeps only one outstanding helper', async () => {
  const pending = deferred(), began = deferred(); let processes = 0;
  const w = world(undefined, undefined, jevOptions, () => { processes++; began.resolve(); return pending.promise; });
  await w.start(); await w.command('shadow'); await w.submit();
  const stepping = w.step(); await began.promise; w.expire(); await stepping;
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.match(w.logs[0], /시간 초과/);
  await w.submit('t2', 'next'); await w.step({ turnId: 't2' });
  await w.event('turn.complete', { turnId: 't2', reason: 'answer' });
  assert.match(w.logs[1], /Jev 생략: 이전 분류 진행 중 · shadow/); assert.equal(processes, 1);
  pending.resolve(jevResult); await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.logs.length, 2);
  await w.submit('t3', 'next'); await w.step({ turnId: 't3' }); assert.equal(processes, 2);
  assert.equal(w.calls.length, 0);
});

test('Jev off during a request drops the late reply without logging sensitive failures', async () => {
  const pending = deferred(), began = deferred();
  const w = world(undefined, undefined, jevOptions, () => { began.resolve(); return pending.promise; });
  await w.start(); await w.command('shadow'); await w.submit();
  const stepping = w.step(); await began.promise; await w.command('off'); await stepping;
  pending.reject(new Error('KEY_CANARY')); await new Promise(resolve => setImmediate(resolve));
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 0); assert.equal(w.calls.length, 0);
});

test('model changes discard a completed recommendation and the next turn can classify', async () => {
  const w = world();
  await w.start(); await w.command('shadow'); await w.submit(); await w.step();
  await w.step({ index: 1, model: 'changed-model' });
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.length, 0);
  assert.equal(w.calls.length, 1);
  await w.submit('t2', 'new request');
  await w.step({ turnId: 't2', model: 'changed-model' });
  await w.event('turn.complete', { turnId: 't2', reason: 'answer' });
  assert.equal(w.calls.length, 2);
  assert.equal(w.logs.length, 1);
});

test('model change during Jev classification cancels the stale result without changing requests', async () => {
  const pending = deferred(), began = deferred();
  let processes = 0;
  const w = world(undefined, undefined, jevOptions, () => {
    processes++; began.resolve(); return pending.promise;
  });
  await w.start(); await w.command('shadow'); await w.submit();
  const first = w.step(); await began.promise;
  await w.step({ index: 1, model: 'changed-model' });
  await first;
  pending.resolve(jevResult);
  await new Promise(resolve => setImmediate(resolve));
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(processes, 1);
  assert.equal(w.logs.length, 0);
  assert.deepEqual(w.sent.map(e => e.model).sort(), ['changed-model', 'unchanged']);
});

test('session start announces the mode and an explicit shadow or enforce default applies to both classifiers', async () => {
  const plain = world(); await plain.start();
  assert.deepEqual(plain.notices, ['세션 시작 · 꺼짐(off) · fake(외부 전송 없음) · 켜기: /jet-router shadow(관찰) · enforce(적용)']);
  await plain.submit(); await plain.step();
  assert.equal(plain.calls.length, 0);

  const fake = world(undefined, undefined, { defaultMode: 'shadow' }); await fake.start();
  assert.deepEqual(fake.notices, ['세션 시작 · 관찰(shadow) · fake(외부 전송 없음) · 적용: /jet-router enforce']);
  await fake.submit(); await fake.step();
  await fake.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(fake.calls.length, 1); assert.equal(fake.logs.length, 1);

  const jev = world(undefined, undefined, { provider: 'jev', cloudConsent: true, jevApiKey: 'KEY_CANARY', defaultMode: 'shadow' });
  await jev.start();
  assert.deepEqual(jev.notices, ['세션 시작 · 관찰(shadow) · Jev · 적용: /jet-router enforce']);
  assert.match(jev.command('status').text, /관찰\(shadow\)/);
  // A shadow start never applies effort; an enforce start applies from the first turn.
  const enforced = world(undefined, undefined, { provider: 'jev', cloudConsent: true, jevApiKey: 'KEY_CANARY', defaultMode: 'enforce' });
  await enforced.start();
  assert.deepEqual(enforced.notices, ['세션 시작 · 적용(enforce) · Jev · 관찰만: /jet-router shadow · 끄기: /jet-router off']);
  const fakeEnforce = world(undefined, undefined, { defaultMode: 'enforce' }); await fakeEnforce.start(); await fakeEnforce.submit();
  assert.equal((await forward(fakeEnforce)).seen.effort, 'low');
  const jevOff = world(undefined, undefined, { provider: 'jev', cloudConsent: true, jevApiKey: 'KEY_CANARY' });
  await jevOff.start();
  assert.deepEqual(jevOff.notices, ['세션 시작 · 꺼짐(off) · Jev · 켜기: /jet-router shadow(관찰) · enforce(적용)']);
  for (const value of ['ENFORCE', 'on', 'max']) {
    const x = world(undefined, undefined, { defaultMode: value }); await x.start();
    assert.match(x.command('status').text, /꺼짐\(off\)/);
  }
});

test('usage logging sends decisions and token counts, never prompt text, only when enabled', async () => {
  const runs = [];
  const run = async (argv, init) => { runs.push({ argv, stdin: init.stdin }); return { exitCode: 0, stdout: '', stderr: '' }; };
  const w = world(undefined, undefined, { usageLog: true }, run);
  await w.event('session.start', { cwd: '/work/icp' }); await w.command('enforce');
  await w.submit(); await forward(w);
  await w.event('turn.complete', { turnId: 't1', reason: 'answer', durationMs: 900,
    usage: { input_tokens: 2, output_tokens: 40, cache_read_input_tokens: 5, cache_creation_input_tokens: 1 } });
  assert.equal(runs.length, 1);
  assert.ok(runs[0].argv[1].endsWith('/scripts/usage.mjs')); assert.equal(runs[0].argv[2], 'record');
  assert.ok(!runs[0].stdin.includes('CANARY_SECRET'));
  const line = JSON.parse(runs[0].stdin);
  assert.deepEqual([line.project, line.mode, line.original, line.applied, line.usage.output, line.durationMs],
    ['/work/icp', 'enforce', 'high', 'low', 40, 900]);
  await w.submit('t2', 'report', { origin: { kind: 'task-notification' } }); await forward(w, { turnId: 't2' });
  await w.event('turn.complete', { turnId: 't2', reason: 'answer' });
  assert.equal(runs.length, 1);
  const off = world(undefined, undefined, {}, run);
  await off.start(); await off.command('enforce'); await off.submit(); await forward(off);
  await off.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(runs.length, 1);
});

test('holdout leaves a random share of applicable enforce turns unchanged and marks them', async () => {
  const runs = [];
  const run = async (argv, init) => { runs.push(JSON.parse(init.stdin)); return { exitCode: 0, stdout: '', stderr: '' }; };
  let draws = 0;
  const w = world(undefined, undefined, { usageLog: true, holdoutRate: '0.1', random: () => (draws++ === 0 ? 0.05 : 0.5) }, run);
  await w.start(); await w.command('enforce');
  await w.submit();
  const held = await forward(w);
  assert.equal(held.seen, held.e);
  await w.event('turn.complete', { turnId: 't1', reason: 'answer' });
  assert.equal(w.logs.at(-1), 'fake.enforce(): high → low 대조군 미적용(고정값) · 0ms');
  await w.submit('t2', 'next');
  assert.equal((await forward(w, { turnId: 't2' })).seen.effort, 'low');
  await w.event('turn.complete', { turnId: 't2', reason: 'answer' });
  assert.deepEqual(runs.map(r => [r.holdout, r.applied]), [[true, null], [false, 'low']]);
  assert.equal(draws, 2);
  // Only applicable turns draw; invalid or zero shares never hold out.
  const keep = world(async () => ({ ...choice, choice: 'keep' }), undefined, { holdoutRate: '0.1', random: () => { throw new Error('drawn'); } });
  await keep.start(); await keep.command('enforce'); await keep.submit(); await forward(keep);
  for (const rate of ['0', '0.9', 'abc', undefined]) {
    const x = world(undefined, undefined, { holdoutRate: rate, random: () => 0 });
    await x.start(); await x.command('enforce'); await x.submit();
    assert.equal((await forward(x)).seen.effort, 'low');
  }
});

test('report runs the loaded plugin version of the usage script with fixed arguments only', async () => {
  const runs = [];
  let reply = { exitCode: 0, stdout: 'TABLE\n', stderr: '' };
  const run = async (argv, init) => { runs.push({ argv, cwd: init.cwd }); return reply; };
  const w = world(undefined, undefined, {}, run); await w.start();
  assert.equal((await w.command('report')).text, 'TABLE');
  assert.equal((await w.command('report project')).text, 'TABLE');
  assert.equal((await w.command('report week html')).text, 'TABLE');
  assert.deepEqual(runs.map(r => r.argv.slice(1)), [
    ['/plugin with spaces/scripts/usage.mjs', 'report', '--by', 'day'],
    ['/plugin with spaces/scripts/usage.mjs', 'report', '--by', 'project'],
    ['/plugin with spaces/scripts/usage.mjs', 'report', '--html', '~/.claude/jet-router/usage-report.html'],
  ]);
  assert.equal(runs[0].cwd, '/plugin with spaces');
  for (const bad of ['report ; rm -rf /', 'report day week', 'report --dir /tmp']) {
    assert.match((await w.command(bad)).text, /절감 리포트: \/jet-router report/);
  }
  assert.equal(runs.length, 3);
  reply = { exitCode: 1, stdout: '', stderr: 'boom' };
  assert.match((await w.command('report')).text, /리포트 생성 실패/);
  assert.match(w.command('status').text, /모드/);
});
