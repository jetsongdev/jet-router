import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../router.mjs';
const config = { mode: 'enforce', consent: true, apiKey: 'fixture-only' };
const input = () => ({ params: { threadId: 'thread1', input: [{ type: 'text', text: 'literal edit' }] },
  model: 'gpt-6-astra', effort: 'medium', supported: ['low', 'medium', 'high'], requestId: 1, signal: new AbortController().signal });
const decision = { provider: 'jev', choice: 'low', contextScore: .9, riskScore: .1, confidence: .9 };
test('uses common Jev contract and runtime effort, checks response', async () => {
  let captured;
  const route = createRouter(config, async request => { captured = request; return { decision }; });
  assert.equal(await route(input()), 'low');
  assert.equal(captured.effort.source, 'host'); assert.equal(captured.target.model, 'gpt-6-astra');
});
test('no consent/key, protected max, unknown model/support and nontext do not call provider', async () => {
  let calls = 0; const classify = async () => { calls++; return { decision }; };
  for (const c of [{ ...config, consent: false }, { ...config, apiKey: '' }, { ...config, mode: 'off' }]) assert.equal(await createRouter(c, classify)(input()), null);
  for (const change of [{ model: 'unknown' }, { effort: 'max' }, { supported: null }, { params: { threadId: 't', input: [{ type: 'image' }] } }]) assert.equal(await createRouter(config, classify)({ ...input(), ...change }), null);
  assert.equal(calls, 0);
});
test('bad response, high risk downshift, missing context and provider error keep baseline', async () => {
  for (const value of [{ ...decision, choice: 'ultra' }, { ...decision, riskScore: .9 }, { ...decision, contextScore: .1 }]) assert.equal(await createRouter(config, async () => ({ decision: value }))(input()), null);
  assert.equal(await createRouter(config, async () => { throw Error('secret'); })(input()), null);
});
test('deadline terminates wait even if provider ignores abort', async () => {
  assert.equal(await createRouter({ ...config, timeoutMs: 5 }, () => new Promise(() => {}))(input()), null);
});
