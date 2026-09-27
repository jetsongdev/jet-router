import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRoutingRequest } from '../src/harness.js';

const input = (host = 'codex') => ({
  host, prompt: 'Fix the explicit typo Helllo to Hello.', cloudConsent: true,
  target: { model: 'synthetic-model', source: 'host', supportedEfforts: ['medium', 'high'] },
  effort: { value: 'high', source: 'host' },
  event: { sessionId: 's1', turnId: 't1', correlated: true },
  context: { source: 'prompt-only', text: null, missingRequired: false },
});

test('equivalent host facts produce identical provider requests without event ids or host labels', () => {
  const a = prepareRoutingRequest(input('claude-code'));
  const b = prepareRoutingRequest(input());
  assert.equal(a.status, 'ready');
  assert.deepEqual(a.request, b.request);
  assert.deepEqual(a.choices, ['medium', 'high', 'keep']);
  assert.deepEqual(Object.keys(a.request.questions.effort.criteria), a.choices);
  assert.equal(a.enforceEligible, false);
  assert.equal(a.metadata.providerModelReturned, null);
  assert.equal(a.request.state.targetModel, 'synthetic-model');
  assert.equal(a.request.state.effortSource, 'host');
  assert.equal(JSON.stringify(a.request).includes('sessionId'), false);
});

test('reference effort and summary provenance are preserved and cannot become observed host facts', () => {
  const raw = input();
  raw.effort.source = 'user-reference';
  raw.context = { source: 'model-summary', text: 'An unverified summary.', missingRequired: false };
  const out = prepareRoutingRequest(raw);
  assert.equal(out.status, 'ready');
  assert.equal(out.request.state.effortSource, 'user-reference');
  assert.equal(out.request.state.contextSource, 'model-summary');
  assert.equal(out.request.state.taskContext, raw.context.text);
  assert.equal(out.enforceEligible, false);
  assert.match(out.request.questions.effort.instructions, /unverified/);
});

for (const [name, patch, reason] of [
  ['no consent', { cloudConsent: false }, 'no-consent'],
  ['untrusted model facts', { target: { model: 'synthetic-model', source: 'model-summary', supportedEfforts: ['high'] } }, 'invalid-input'],
  ['unknown effort', { effort: null }, 'unknown-effort'],
  ['max protection', { effort: { value: 'max', source: 'host' } }, 'protected-effort'],
  ['unsupported baseline', { effort: { value: 'low', source: 'host' } }, 'unsupported-effort'],
  ['none pending policy', { effort: { value: 'none', source: 'host' } }, 'unsupported-effort'],
  ['bad correlation', { event: { sessionId: 's1', turnId: 't1', correlated: false } }, 'correlation'],
  ['long prompt', { prompt: 'x'.repeat(6001) }, 'invalid-input'],
  ['empty prompt', { prompt: ' ' }, 'invalid-input'],
  ['long summary', { context: { source: 'model-summary', text: 'x'.repeat(2001), missingRequired: false } }, 'invalid-input'],
]) test(`${name} cannot prepare a request`, () => {
  const out = prepareRoutingRequest({ ...input(), ...patch });
  assert.equal(out.status, 'skip');
  assert.equal(out.reason, reason);
  assert.equal(out.enforceEligible, false);
  assert.equal('request' in out, false);
  assert.equal('input' in out, false);
});

test('capability order is canonical; duplicate or invalid capability lists are rejected', () => {
  const raw = input();
  raw.target.supportedEfforts = ['high', 'medium'];
  assert.deepEqual(prepareRoutingRequest(raw).request, prepareRoutingRequest(input()).request);
  for (const list of [['high', 'high'], [''], [], 'high', Array(33).fill('high')]) {
    raw.target.supportedEfforts = list;
    assert.equal(prepareRoutingRequest(raw).reason, 'invalid-input');
  }
});

test('unknown fields cannot replace instructions, credentials or leak into prepared requests', () => {
  const raw = input();
  raw.apiKey = 'KEY-CANARY';
  raw.questions = { effort: 'INSTRUCTION-CANARY' };
  raw.target.extra = 'EXTRA-CANARY';
  const before = structuredClone(raw);
  const out = prepareRoutingRequest(raw);
  assert.deepEqual(raw, before);
  assert.equal(JSON.stringify(out).includes('CANARY'), false);
  assert.equal(out.request.state.userPrompt, raw.prompt);
  assert.equal(out.metadata.contractVersion, 'routing-input-v1');
});

test('shadow keeps unknown facts explicit instead of blocking experimental recommendations', () => {
  const raw = input();
  raw.target = null;
  raw.effort.source = 'user-reference';
  raw.event.sessionId = null;
  raw.context.missingRequired = true;
  const out = prepareRoutingRequest(raw);
  assert.equal(out.status, 'ready');
  assert.equal(out.enforceEligible, false);
  assert.deepEqual(out.choices, ['low', 'medium', 'high', 'xhigh', 'keep']);
  assert.deepEqual(out.uncertainties, ['unknown-session', 'unknown-model', 'unknown-support', 'reference-effort', 'missing-context']);
  assert.deepEqual(out.request.state.uncertainties, out.uncertainties);
  assert.equal(out.request.state.targetModel, null);
  raw.context = null;
  assert.ok(prepareRoutingRequest(raw).uncertainties.includes('unknown-context'));
});
