import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateHarness, main } from '../scripts/evaluate-harness.mjs';
import { cases } from '../eval/harness-cases.mjs';

test('offline corpus is reproducible, tests both hosts, and never claims quality/enforce approval', () => {
  const report = evaluateHarness();
  assert.deepEqual(evaluateHarness(), report);
  const recorded = JSON.parse(readFileSync(new URL('../docs/evaluations/harness-contract-v2.json', import.meta.url), 'utf8'));
  assert.deepEqual(report, recorded, 'request/template drift must update the versioned contract record deliberately');
  assert.equal(report.items.length, 14);
  assert.equal(new Set(report.items.map(item => item.id)).size, 14);
  assert.equal(report.passed, true);
  assert.equal(report.equivalentHostRequests, true);
  assert.equal(report.providerCalls, 0);
  assert.equal(report.enforceApproved, false);
  const output = JSON.stringify(report);
  for (const item of cases) assert.equal(output.includes(item.input.prompt), false);
});

test('CLI rejects live/custom input modes and emits a deterministic credential-free report', () => {
  assert.equal(main(['--live'], () => {}), 1);
  assert.equal(main(['--input', 'file'], () => {}), 1);
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/evaluate-harness.mjs', import.meta.url)), '--dry-run'], {
    encoding: 'utf8', env: { TYPESAFE_API_KEY: 'secret-canary' }, timeout: 5000,
  });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout.includes('secret-canary'), false);
  assert.deepEqual(JSON.parse(run.stdout), evaluateHarness());
});
