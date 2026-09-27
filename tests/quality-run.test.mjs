import test from 'node:test';
import assert from 'node:assert/strict';
import { runQuality, main } from '../scripts/run-quality.mjs';
import { plan, score } from '../scripts/evaluate-quality.mjs';
import { prepareRoutingRequest } from '../src/harness.js';
import { createHash } from 'node:crypto';
const decision = { provider: 'jev', choice: 'keep', confidence: .8, contextScore: .5, riskScore: .2 };
test('runner sends exactly the frozen requests sequentially and emits a scoreable record', async () => {
  let active = 0, calls = 0;
  const planned = plan();
  const report = await runQuality('test-key', async (input, key) => {
    assert.equal(++active, 1); assert.equal(key, 'test-key');
    const hash = createHash('sha256').update(JSON.stringify(prepareRoutingRequest(input).request)).digest('hex');
    assert.equal(hash, planned.items[calls++].requestSha256);
    await Promise.resolve(); active--; return { decision };
  });
  assert.equal(calls, 12); assert.equal(report.complete, true);
  assert.equal(score({ ...report, evidence: 'fixture' }).splits.holdout.count, 6);
  assert.equal(JSON.stringify(report).includes('test-key'), false);
});
test('first failure stops with sanitized evidence and no retry', async () => {
  for (const failure of [() => ({ reason: 'timeout' }), () => { throw new Error('SECRET'); }, () => ({ decision: { ...decision, choice: 'SECRET' } })]) {
    let calls = 0;
    const report = await runQuality('key', async () => ++calls === 1 ? { decision } : failure());
    assert.equal(calls, 2); assert.equal(report.complete, false);
    assert.equal(JSON.stringify(report).includes('SECRET'), false);
    assert.throws(() => score(report));
  }
});
test('missing keys and invalid CLI arguments cannot invoke live runner', async () => {
  const forbidden = () => assert.fail('must not run');
  await assert.rejects(runQuality(undefined, forbidden));
  for (const args of [[], ['--live', '--key-env', 'MISSING'], ['--live', '--key-env', 'INVALID-NAME']]) {
    assert.equal(await main(args, {}, () => {}, forbidden), 1);
  }
});
