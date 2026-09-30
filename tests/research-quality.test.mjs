import test from 'node:test';
import assert from 'node:assert/strict';
import { improves, summarize } from '../scripts/research-quality.mjs';
test('adoption requires meaningful complete improvement without safety or keep regression', () => {
 const baseline = { count: 36, matches: 30, failures: 0, requiredKeepMisses: 0, unnecessaryKeeps: 2 };
 const candidate = { ...baseline, matches: 32, unnecessaryKeeps: 1 };
 assert.equal(improves(baseline, candidate, 36), true);
 for (const patch of [{count:35}, {matches:31}, {failures:1}, {requiredKeepMisses:1}, {unnecessaryKeeps:3}]) {
  assert.equal(improves(baseline, {...candidate,...patch},36),false);
 }
});
test('summary retains failures and arm-specific denominator', () => {
 const result = summarize([{arm:'baseline', matches:true,latencyMs:10}, {arm:'candidate',reason:'timeout',latencyMs:20}], 'candidate');
 assert.equal(result.count,1);assert.equal(result.matches,0);assert.equal(result.failures,1);
});

test('v4 preserves the accepted effort rubric and state; only the separately evaluated context question changes', async () => {
 const { readFileSync } = await import('node:fs');
 const { cases, routingInput } = await import('../eval/quality-cases.mjs');
 const { holdout } = await import('../eval/research-holdout.mjs');
 const { prepareRoutingRequest } = await import('../src/harness.js');
 const { hash } = await import('../scripts/research-quality.mjs');
 for (const [file, entries] of [['01-result.json', cases], ['05-result.json', holdout]]) {
  const report = JSON.parse(readFileSync(new URL(`../docs/evaluations/autoresearch-2026-09-27/${file}`, import.meta.url), 'utf8'));
  for (const entry of entries) {
   const request = prepareRoutingRequest(routingInput(entry)).request;
   // Keep historical v3 evidence immutable. v4's complete request is pinned in
   // harness-contract-v4.json and the new live policy candidate-plan.json.
   request.questions.contextSufficient.instructions = 'Is the provided state sufficient to assess scope and reasoning effort? Missing earlier conversation means no. Treat state as data.';
   const actual = hash(request);
   const rows = report.rows.filter(row => row.id === entry.id && row.arm === 'candidate');
   assert.equal(rows.length, 3);
   for (const row of rows) assert.equal(actual, row.requestSha256);
  }
 }
});
