import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadow, readConfig, classifyJev } from '../shadow.mjs';

const input = { prompt: 'private-prompt-canary', session_id: 'session-1', turn_id: 'turn-1' };
const config = { mode: 'shadow', provider: 'jev', consent: true, referenceEffort: 'medium', apiKey: 'key-canary' };
const decision = { provider: 'jev', choice: 'low', confidence: .9, contextScore: .8, riskScore: .1 };
const forbidden = () => assert.fail('provider must not run');

test('default off and fake require no credentials or provider call', async () => {
  assert.deepEqual(await createShadow(readConfig({}), forbidden)(input), { continue: true });
  const out = await createShadow(readConfig({ JET_ROUTER_MODE: 'shadow' }), forbidden)(input);
  assert.match(out.systemMessage, /fake.*keep.*· shadow$/);
});

for (const [name, patch, expected] of [
  ['enforce', { mode: 'enforce' }, /off\/shadow/],
  ['unknown provider', { provider: 'other' }, /provider/],
  ['no consent', { consent: false }, /미동의/],
  ['no key', { apiKey: undefined }, /API 키/],
  ['invalid key', { apiKey: 'key\n' }, /API 키/],
  ['unknown baseline', { referenceEffort: undefined }, /참고 effort 설정/],
  ['unsupported baseline', { referenceEffort: 'ultra' }, /참고 effort 설정/],
  ['max baseline', { referenceEffort: 'max' }, /max 보호/],
]) test(`${name}: no external call`, async () => {
  assert.match((await createShadow({ ...config, ...patch }, forbidden)(input)).systemMessage, expected);
});

test('only explicit true grants cloud consent', () => {
  for (const value of ['1', 'TRUE', 'false', undefined]) assert.equal(readConfig({ JET_ROUTER_CLOUD_CONSENT: value }).consent, false);
});

test('invalid, empty, long inputs and malformed ids are skipped without provider', async () => {
  for (const patch of [{ prompt: '' }, { prompt: ' '.repeat(10) }, { prompt: 'x'.repeat(6001) },
    { prompt: null }, { session_id: '' }, { turn_id: '${turn_id}' }]) {
    assert.match((await createShadow(config, forbidden)({ ...input, ...patch })).systemMessage, /입력 또는/);
  }
});

for (const referenceEffort of ['medium', 'high', 'xhigh']) test(`reference ${referenceEffort} is sent to provider and displayed before recommendation`, async () => {
  const shadow = createShadow({ ...config, referenceEffort }, async (state, key) => {
    assert.equal(state.prompt, input.prompt);
    assert.deepEqual(state.effort, { value: referenceEffort, source: 'user-reference' });
    assert.deepEqual(state.target, { model: null, source: 'unknown', supportedEfforts: null });
    assert.equal(state.context.missingRequired, null);
    assert.deepEqual(state.event, { sessionId: input.session_id, turnId: input.turn_id, correlated: true });
    assert.equal(key, config.apiKey);
    return { decision };
  });
  const out = await shadow(input);
  assert.equal(out.systemMessage, `[jet-router] Jev.shadow(): ${referenceEffort} → low`);
  assert.equal(JSON.stringify(out).includes('canary'), false);
  assert.deepEqual(Object.keys(out).sort(), ['continue', 'systemMessage']);
  assert.equal(out.continue, true);
});

test('duplicates, including concurrent ones, do not call or report again; sessions are distinct', async () => {
  let calls = 0, complete;
  const shadow = createShadow(config, () => { calls++; return new Promise(resolve => { complete = resolve; }); });
  const first = shadow(input);
  assert.deepEqual(await shadow(input), { continue: true });
  assert.match((await shadow({ ...input, turn_id: 'turn-2' })).systemMessage, /이전 분류/);
  complete({ decision });
  await first;
  assert.deepEqual(await shadow(input), { continue: true });
  const next = shadow({ ...input, session_id: 'session-2' });
  complete({ decision });
  await next;
  assert.equal(calls, 2);
});

test('provider exceptions, timeouts and arbitrary output fail open without leaking', async () => {
  for (const provider of [async () => { throw new Error('key-canary'); },
    async () => ({ reason: 'timeout' }), async () => ({ reason: 'key-canary' }),
    async () => ({ decision: { ...decision, choice: 'key-canary' } })]) {
    const shadow = createShadow(config, provider);
    const out = await shadow(input);
    assert.equal(out.continue, true);
    assert.match(out.systemMessage, /생략/);
    assert.equal(JSON.stringify(out).includes('canary'), false);
    assert.deepEqual(await shadow(input), { continue: true });
  }
});

test('real helper process fails safely before network with missing key', async () => {
  assert.deepEqual(await classifyJev({ userPrompt: 'synthetic', currentEffort: 'medium' }, undefined), { reason: 'missing-key' });
});


test('failed provider response displays only allowlisted diagnostic codes', async () => {
  for (const diagnostic of ['probability-sum', 'SECRET_CANARY']) {
    const shadow = createShadow(config, async () => ({ reason: 'invalid-response', diagnostic }));
    const out = await shadow(input);
    assert.equal(out.systemMessage, `[jet-router] Jev 생략: invalid-response${diagnostic === 'probability-sum' ? '/probability-sum' : ''} · shadow`);
    assert.equal(out.continue, true);
  }
});


test('percentage uses selected candidate probability, not separate confidence', async () => {
  for (const [selectedProbability, percentage] of [[0.7, 70], [0.756, 76], [0, 0], [1, 100]]) {
    const shadow = createShadow(config, async () => ({ decision: { ...decision, selectedProbability } }));
    const out = await shadow(input);
    assert.equal(out.systemMessage, `[jet-router] Jev.shadow(): medium → low (${percentage}%)`);
  }
  for (const selectedProbability of [-0.1, 1.1, '70', null, NaN]) {
    const shadow = createShadow(config, async () => ({ decision: { ...decision, selectedProbability } }));
    assert.match((await shadow(input)).systemMessage, /invalid-response/);
  }
});


test('cancelled classification suppresses late results, holds single-flight and blocks pre-aborted calls', async () => {
  let finish, began;
  const started = new Promise(resolve => { began = resolve; });
  let calls = 0;
  const controller = new AbortController();
  const shadow = createShadow(config, (_input, _key, signal) => {
    calls++;
    assert.equal(signal.aborted, false);
    began();
    return new Promise(resolve => { finish = resolve; });
  });
  const first = shadow(input, controller.signal);
  await started;
  controller.abort();
  assert.match((await shadow({ ...input, turn_id: 't2' })).systemMessage, /이전 분류/);
  finish({ decision });
  assert.deepEqual(await first, { continue: true });
  assert.deepEqual(await shadow(input), { continue: true });
  assert.deepEqual(await shadow({ ...input, turn_id: 't3' }, controller.signal), { continue: true });
  assert.equal(calls, 1);
});

test('host without cancellation still gets bounded provider cleanup and next-turn recovery', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const shadow = createShadow(config, async (_input, _key, signal) => {
    if (++calls === 1) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return { decision };
  });
  const first = shadow(input);
  t.mock.timers.tick(4000);
  assert.match((await first).systemMessage, /timeout/);
  assert.match((await shadow({ ...input, turn_id: 'next' })).systemMessage, /medium → low/);
  assert.equal(calls, 2);
});

test('host model and exact catalog restrict request and response candidates', async () => {
  const modelCatalog = new Map([['gpt-example', ['medium', 'high']]]);
  const shadow = createShadow({ ...config, modelCatalog }, async state => {
    assert.deepEqual(state.target, { model: 'gpt-example', source: 'host', supportedEfforts: ['medium', 'high'] });
    return { decision }; // low must be rejected for this model
  });
  assert.match((await shadow({ ...input, model: 'gpt-example' })).systemMessage, /invalid-response/);
  const allowed = createShadow({ ...config, modelCatalog }, async () => ({ decision: { ...decision, choice: 'high' } }));
  assert.match((await allowed({ ...input, model: 'gpt-example' })).systemMessage, /medium → high/);
  const unsupported = createShadow({ ...config, referenceEffort: 'low', modelCatalog }, forbidden);
  assert.match((await unsupported({ ...input, model: 'gpt-example' })).systemMessage, /invalid-input/);
});

test('unknown model uses explicit unknown support, not another catalog entry', async () => {
  const shadow = createShadow({ ...config, modelCatalog: new Map([['other', ['high']]]) }, async state => {
    assert.deepEqual(state.target, { model: 'unknown-model', source: 'host', supportedEfforts: null });
    return { decision };
  });
  assert.match((await shadow({ ...input, model: 'unknown-model' })).systemMessage, /medium → low/);
});

test('new host model invalidates in-flight old-model result; next turn recalculates', async () => {
  let finish, calls = 0;
  const modelCatalog = new Map([['a', ['low', 'medium']], ['b', ['medium', 'high']]]);
  const shadow = createShadow({ ...config, modelCatalog }, async state => {
    if (++calls === 1) return new Promise(resolve => { finish = resolve; });
    assert.deepEqual(state.target.supportedEfforts, ['medium', 'high']);
    return { decision: { ...decision, choice: 'high' } };
  });
  const old = shadow({ ...input, model: 'a' });
  assert.match((await shadow({ ...input, turn_id: 't2', model: 'b' })).systemMessage, /이전 분류/);
  finish({ decision });
  assert.deepEqual(await old, { continue: true });
  assert.match((await shadow({ ...input, turn_id: 't3', model: 'b' })).systemMessage, /medium → high/);
});
