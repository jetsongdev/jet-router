import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, main, plan, parseKeyFile } from '../scripts/evaluate-jev.mjs';

test('evaluation dry run is fixed, bounded, reproducible and never reads credentials', async () => {
  const lines = [];
  const forbidden = new Proxy({}, { get() { throw new Error('credential-read'); } });
  assert.equal(await main([], forbidden, text => lines.push(text)), 0);
  assert.equal(JSON.parse(lines[0]).attempted, 0);
  assert.deepEqual(plan(), plan()); assert.equal(plan().items.length, 12);
  assert.equal(new Set(plan().items.map(item => item.id)).size, 12);
  assert.ok(plan().items.every(item => item.requestBytes <= 65536));
  assert.ok(!lines[0].includes('userPrompt'));
});

test('evaluation runs at most twelve sequential requests and stops on the first failure', async () => {
  const good = { decision: { provider: 'jev', choice: 'keep', confidence: 0.9, contextScore: 0.1, riskScore: 0.1 } };
  let active = 0, peak = 0;
  const result = await evaluate('SYNTHETIC_CANARY', async () => {
    active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return good;
  });
  assert.equal(result.attempted, 12); assert.equal(peak, 1); assert.equal(result.enforceApproved, false);
  assert.equal(result.actualBilledUsd, null); assert.ok(!JSON.stringify(result).includes('SYNTHETIC_CANARY'));
  const failed = await evaluate('SYNTHETIC_CANARY', async () => ({ reason: 'timeout' }));
  assert.equal(failed.attempted, 1); assert.equal(failed.results[0].needsReview, true);
});

test('missing key and invalid CLI arguments cannot start live evaluation', async () => {
  const lines = [];
  assert.equal(await main(['--live', '--key-env', 'TEST_KEY'], {}, text => lines.push(text)), 1);
  assert.equal(lines[0], 'missing-key');
  assert.equal(await main(['--live'], {}, () => {}), 1);
});


test('dotenv key parsing never evaluates shell code or imports other variables', () => {
  assert.equal(parseKeyFile('OTHER=ignored\nTYPESAFE_API_KEY="test-key" # note'), 'test-key');
  assert.equal(parseKeyFile("export TYPESAFE_API_KEY='test-key'"), 'test-key');
  assert.equal(parseKeyFile('TYPESAFE_API_KEY=test-key # comment'), 'test-key');
  assert.equal(parseKeyFile('TYPESAFE_API_KEY=one\nTYPESAFE_API_KEY=two'), undefined);
  assert.equal(parseKeyFile('OTHER=ignored'), undefined);
  assert.equal(parseKeyFile('TYPESAFE_API_KEY=$(touch /tmp/never)'), undefined);
});
