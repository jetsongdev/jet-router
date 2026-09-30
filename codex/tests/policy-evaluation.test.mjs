import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, main, plan } from '../../scripts/evaluate-codex-policy.mjs';

test('policy evaluation is dry by default and fixes bounded cases before calls', async () => {
  let output;
  assert.equal(await main([], {}, text => { output = JSON.parse(text); }), 0);
  assert.equal(output.attempted, 0);
  assert.equal(plan().maxCalls, 10);
  assert.equal(new Set(plan().items.map(item => item.id)).size, 10);
  assert.equal(await main(['--unexpected'], {}, () => {}), 1);
  assert.equal(await main(['--live'], {}, () => {}), 1);
});
test('evaluation stops on first provider failure without leaking raw errors', async () => {
  let calls = 0;
  const report = await evaluate('fixture', async () => { calls++; throw Error('SECRET-CANARY'); });
  assert.equal(calls, 1);
  assert.equal(report.completed, false);
  assert.equal(JSON.stringify(report).includes('SECRET-CANARY'), false);
});
test('evaluation compares policies on identical validated decisions with no model calls', async () => {
  const report = await evaluate('fixture', async () => ({ decision: {
    provider: 'jev', choice: 'low', confidence: .98, contextScore: .42, riskScore: .02, selectedProbability: .99,
  } }));
  assert.equal(report.attempted, 10);
  assert.equal(report.realModelCalls, 0);
  assert.equal(report.completed, true);
  assert.equal(report.results[0].codexCandidate, null);
  assert.equal(report.results[0].choiceOnlyCandidate, 'low');
  assert.equal(report.results[0].codexExpected, false);
  assert.equal(report.results.find(row => row.id === 'missing-context').choiceOnlyExpected, false);
});

test('current request plan and replayed live decisions match the versioned evidence', async () => {
  const read = name => JSON.parse(readFileSync(new URL(`../../docs/evaluations/codex-policy-2026-09-30/${name}.json`, import.meta.url), 'utf8'));
  const { mode, attempted, ...recordedPlan } = read('candidate-plan');
  assert.deepEqual(plan(), recordedPlan);
  for (const name of ['baseline', 'candidate']) {
    const evidence = read(name);
    const replay = await evaluate('fixture', async input => evidence.results.find(row => row.id === input.event.turnId));
    assert.deepEqual(replay.results, evidence.results);
    assert.equal(replay.completed, true);
  }
});
