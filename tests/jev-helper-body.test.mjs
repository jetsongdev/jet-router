import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHelperBody, parseHelperResult, HELPER_OUTPUT_LIMIT } from '../src/providers/jev.js';

const decision = { provider: 'jev', choice: 'medium', confidence: .8, contextScore: .4, riskScore: .2 };

test('object and process validators agree and strip untrusted extra fields', () => {
  const body = { ok: true, apiKey: 'secret-canary', decision: { ...decision, prompt: 'prompt-canary' } };
  const expected = { decision };
  assert.deepEqual(parseHelperBody(body), expected);
  assert.deepEqual(parseHelperResult({ exitCode: 0, stdout: JSON.stringify(body) }), expected);
  assert.notEqual(parseHelperBody(body).decision, body.decision);
  for (const invalid of [null, {}, { ok: true, decision: { ...decision, choice: 'secret-canary' } },
    { ok: true, decision: { ...decision, riskScore: NaN } }, { ok: false, reason: 'secret-canary' }]) {
    assert.deepEqual(parseHelperBody(invalid), { reason: 'invalid-response' });
  }
  assert.deepEqual(parseHelperBody({ ok: false, reason: 'timeout', raw: 'secret-canary' }), { reason: 'timeout' });
});

test('process boundary still rejects failed, oversized and malformed output before object validation', () => {
  const stdout = JSON.stringify({ ok: true, decision });
  assert.deepEqual(parseHelperResult({ exitCode: 1, stdout }), { reason: 'provider-error' });
  assert.deepEqual(parseHelperResult({ exitCode: 0, stdout: stdout + ' '.repeat(HELPER_OUTPUT_LIMIT) }), { reason: 'provider-error' });
  assert.deepEqual(parseHelperResult({ exitCode: 0, stdout: 'not-json' }), { reason: 'invalid-response' });
});


test('helper output remains bounded by the originating request choices', () => {
  const body = { ok: true, decision: { provider: 'jev', choice: 'low', confidence: 0.8, contextScore: 0.9, riskScore: 0.1 } };
  assert.deepEqual(parseHelperBody(body, ['medium', 'keep']), { reason: 'invalid-response' });
  assert.deepEqual(parseHelperResult({ exitCode: 0, stdout: JSON.stringify(body) }, ['medium', 'keep']), { reason: 'invalid-response' });
  assert.equal(parseHelperBody(body, ['low', 'keep']).decision.choice, 'low');
});


test('only fixed response diagnostic codes survive helper boundaries', () => {
  for (const diagnostic of ['probability-sum', 'SECRET_CANARY']) {
    const body = { ok: false, reason: 'invalid-response', diagnostic };
    const expected = diagnostic === 'probability-sum' ? { reason: body.reason, diagnostic } : { reason: body.reason };
    assert.deepEqual(parseHelperBody(body), expected);
    assert.deepEqual(parseHelperResult({ exitCode: 0, stdout: JSON.stringify(body) }), expected);
  }
});
