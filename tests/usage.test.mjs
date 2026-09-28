import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { usageRecord, parseLine, report, SAVINGS_FACTORS } from '../src/usage.js';
import { recordLine, readRecords, formatReport } from '../scripts/usage.mjs';

const usage = output => ({ input_tokens: 4, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 });
const make = (ts, record, output, extra = {}) => ({ ts, ...usageRecord({ project: '/work/icp', model: 'claude-opus-5-5',
  record: { provider: 'jev', reasonCode: 'unevaluated', latencyMs: 300, forwarded: record.original, ...record },
  outcome: 'answer', durationMs: 1000, usage: usage(output), ...extra }) });

test('stored records keep only validated decision and token fields', () => {
  const stored = usageRecord({ project: '/work/icp', model: 'claude-opus-5-5', outcome: 'answer', durationMs: 5,
    record: { mode: 'enforce', provider: 'jev', original: 'xhigh', recommendation: 'medium', applied: 'medium',
      reasonCode: 'unevaluated', probability: 0.7, latencyMs: 12.4, text: 'CANARY_SECRET', prompt: 'CANARY_SECRET' },
    usage: { ...usage(50), answer: 'CANARY_SECRET' } });
  assert.ok(!JSON.stringify(stored).includes('CANARY'));
  assert.deepEqual(stored.usage, { input: 4, output: 50, cacheRead: 100, cacheCreation: 10 });
  assert.equal(stored.classifyMs, 12);
  const odd = usageRecord({ project: 7, model: 'x'.repeat(200), outcome: 'odd', durationMs: -1,
    record: { mode: 'x', provider: 'y', original: 'turbo', recommendation: 'max?', applied: 'zzz', probability: 3 }, usage: null });
  assert.deepEqual([odd.project, odd.model, odd.mode, odd.provider, odd.original, odd.applied, odd.probability, odd.outcome, odd.durationMs, odd.usage.output],
    [null, null, null, null, null, null, null, null, null, null]);
});

test('record appends one private line per turn into a monthly file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jet-router-usage-'));
  try {
    const input = JSON.stringify(usageRecord({ project: '/p', model: 'claude-opus-5-5', outcome: 'answer', durationMs: 1,
      record: { mode: 'shadow', provider: 'fake', original: 'high', recommendation: 'low', reasonCode: 'shadow', latencyMs: 0 }, usage: usage(9) }));
    assert.equal(recordLine(input, dir, new Date('2026-10-02T01:00:00Z')), true);
    assert.equal(recordLine(input, dir, new Date('2026-10-03T01:00:00Z')), true);
    assert.equal(recordLine('{"v":2}', dir), false);
    assert.deepEqual(readdirSync(dir), ['2026-10.jsonl']);
    assert.equal(statSync(join(dir, '2026-10.jsonl')).mode & 0o777, 0o600);
    const lines = readFileSync(join(dir, '2026-10.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 2); assert.ok(parseLine(lines[0]));
    assert.equal(readRecords(dir).length, 2);
    assert.deepEqual(readRecords(join(dir, 'missing')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('savings are estimated only for measured pairs and exclude yielded and upshifted turns', () => {
  const ratio = SAVINGS_FACTORS['claude-opus-5-5']['xhigh>medium'].outputRatio;
  const records = [
    make('2026-10-01T02:00:00Z', { mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium' }, 500),
    make('2026-10-01T03:00:00Z', { mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium', yielded: true }, 900),
    make('2026-10-01T04:00:00Z', { mode: 'enforce', original: 'high', recommendation: 'low', applied: 'low' }, 300),
    make('2026-10-02T02:00:00Z', { mode: 'enforce', original: 'medium', recommendation: 'xhigh', applied: 'xhigh' }, 2000),
    make('2026-10-02T03:00:00Z', { mode: 'enforce', original: 'xhigh', recommendation: 'keep' }, 700),
    make('2026-10-02T04:00:00Z', { mode: 'shadow', original: 'xhigh', recommendation: 'medium' }, 1000),
    make('2026-10-02T05:00:00Z', { mode: 'shadow', original: 'xhigh', recommendation: 'keep', reasonCode: 'timeout' }, 800),
  ];
  const { total, rows } = report(records, { by: ['day'] });
  assert.deepEqual(rows.map(r => r.key), ['2026-10-01', '2026-10-02']);
  assert.equal(total.turns, 7); assert.equal(total.applied, 4); assert.equal(total.upshifts, 1);
  assert.equal(total.yielded, 1); assert.equal(total.skipped, 1);
  assert.equal(total.estimatedTurns, 1);
  assert.equal(total.estimatedSaved, Math.round(500 / ratio - 500));
  assert.equal(total.unestimatedAppliedTurns, 3);
  assert.equal(total.shadowEstimatedTurns, 1);
  assert.equal(total.shadowPotentialSaved, Math.round(1000 * (1 - ratio)));
  assert.equal(total.output, 6200);
  assert.equal(report(records, { from: '2026-10-02' }).total.turns, 4);
  assert.equal(report(records, { to: '2026-10-01' }).total.turns, 3);
  const pair = report(records, { by: ['project', 'pair'] }).rows.map(r => r.key);
  assert.ok(pair.includes('/work/icp · xhigh>medium'));
  assert.throws(() => report(records, { by: ['nope'] }), /unknown group/);
  assert.match(formatReport(report(records, { by: ['day'] })), /추정 대상 턴 출력 절감률/);
});
