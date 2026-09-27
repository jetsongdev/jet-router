import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, score, main } from '../scripts/evaluate-quality.mjs';
const record = () => {
  const planned = plan();
  return { corpusSha256: planned.corpusSha256, evidence: 'fixture', results: planned.items.map(item => ({
    id: item.id, requestSha256: item.requestSha256, latencyMs: 10,
    result: { ok: true, decision: { provider: 'jev', choice: item.accepted[0], confidence: .8, contextScore: .6, riskScore: .3 } },
  })) };
};
test('prospective plan fixes splits and request hashes without claiming quality approval', () => {
  const planned = plan();
  assert.deepEqual(planned, plan());
  assert.equal(planned.items.length, 12);
  assert.equal(planned.items.filter(item => item.split === 'holdout').length, 6);
  assert.equal(new Set(planned.items.map(item => item.id)).size, 12);
  assert.equal(planned.enforceApproved, false);
  for (const item of planned.items) assert.match(item.requestSha256, /^[a-f0-9]{64}$/);
});
test('scoring distinguishes fixture agreement, failures, missing-context misses and abstentions', () => {
  const input = record();
  input.results.find(row => row.id === 'holdout-destructive').result.decision.choice = 'low';
  input.results[0].result = { ok: false, reason: 'timeout' };
  const result = score(input);
  assert.equal(result.splits.tune.matching, 5);
  assert.equal(result.splits.tune.failures, 1);
  assert.equal(result.splits.holdout.requiredKeepMisses, 1);
  assert.equal(result.splits.holdout.matching, 5);
  assert.equal(result.enforceApproved, false);
  assert.equal(result.evidenceVerified, false);
  assert.equal(result.evidence, 'fixture');
});
test('partial, duplicate, mixed-version and malformed records cannot be scored as complete', () => {
  for (const change of [
    r => r.results.pop(), r => r.results.push(r.results[0]),
    r => { r.results[1] = r.results[0]; },
    r => { r.corpusSha256 = 'old'; }, r => { r.results[0].requestSha256 = 'old'; },
    r => { r.results[0].latencyMs = -1; }, r => { r.evidence = 'verified'; },
  ]) { const input = record(); change(input); assert.throws(() => score(input)); }
});
test('invalid provider values stay failures and never leak raw strings', () => {
  const input = record();
  input.results[0].result.decision.choice = 'PRIVATE_CANARY';
  const result = score(input);
  assert.equal(result.splits.tune.failures, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_CANARY'), false);
});
test('CLI has no live mode and default plan needs no credentials', () => {
  let output;
  assert.equal(main([], value => { output = value; }), 0);
  assert.equal(JSON.parse(output).kind, 'prospective-quality-pilot');
  assert.equal(main(['--live'], value => { output = value; }), 1);
  assert.equal(output, 'invalid-quality-evaluation-input');
});
