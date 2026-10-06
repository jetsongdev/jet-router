import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { usageRecord, parseLine, report, measuredFactors, SAVINGS_FACTORS } from '../src/usage.js';
import { recordLine, readRecords, formatReport } from '../scripts/usage.mjs';

const usage = output => ({ input_tokens: 4, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 });
const make = (ts, record, output, extra = {}) => ({ ts, ...usageRecord({ project: '/work/icp', model: 'claude-opus-5-5',
  record: { provider: 'jev', reasonCode: 'unevaluated', latencyMs: 300, forwarded: record.original, ...record },
  outcome: 'answer', durationMs: 1000, usage: usage(output), ...extra }) });

test('stored records keep only validated decision and token fields', () => {
  const stored = usageRecord({ project: '/work/icp', model: 'claude-opus-5-5', outcome: 'answer', durationMs: 5,
    record: { mode: 'enforce', provider: 'jev', original: 'xhigh', recommendation: 'medium', applied: 'medium',
      reasonCode: 'unevaluated', probability: 0.7, contextScore: 0.9, riskScore: 0.05, latencyMs: 12.4, text: 'CANARY_SECRET', prompt: 'CANARY_SECRET' },
    usage: { ...usage(50), answer: 'CANARY_SECRET' } });
  assert.ok(!JSON.stringify(stored).includes('CANARY'));
  assert.deepEqual(stored.usage, { input: 4, output: 50, cacheRead: 100, cacheCreation: 10 });
  assert.equal(stored.classifyMs, 12);
  assert.deepEqual([stored.contextScore, stored.riskScore], [0.9, 0.05]);
  const odd = usageRecord({ project: 7, model: 'x'.repeat(200), outcome: 'odd', durationMs: -1,
    record: { mode: 'x', provider: 'y', original: 'turbo', recommendation: 'max?', applied: 'zzz', probability: 3, contextScore: '0.9', riskScore: -1 }, usage: null });
  assert.deepEqual([odd.project, odd.model, odd.mode, odd.provider, odd.original, odd.applied, odd.probability, odd.contextScore, odd.riskScore, odd.outcome, odd.durationMs, odd.usage.output],
    [null, null, null, null, null, null, null, null, null, null, null, null]);
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

test('gated counts only different enforce candidates below the apply probability', () => {
  const records = [
    make('2026-10-06T01:00:00Z', { mode: 'enforce', original: 'medium', recommendation: 'high', probability: 0.43 }, 100),
    make('2026-10-06T02:00:00Z', { mode: 'enforce', original: 'medium', recommendation: 'medium', probability: 0.44 }, 100),
    make('2026-10-06T03:00:00Z', { mode: 'enforce', original: 'medium', recommendation: 'high', applied: 'high', probability: 0.48 }, 100),
    make('2026-10-06T04:00:00Z', { mode: 'enforce', original: 'medium', recommendation: 'keep', probability: 0.3 }, 100),
    make('2026-10-06T05:00:00Z', { mode: 'shadow', original: 'medium', recommendation: 'high', probability: 0.43 }, 100),
    make('2026-10-06T06:00:00Z', { mode: 'enforce', original: 'medium', recommendation: 'high', probability: 0.43 }, 100, { kind: 'subagent' }),
  ];
  assert.equal(report(records).total.gated, 1);
  assert.match(formatReport(report(records)), /확률 미달/);
});

test('measured control ratios replace evaluation ratios once both arms have enough turns', () => {
  const at = i => `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T02:00:00Z`;
  const records = [];
  for (let i = 0; i < 10; i++) {
    records.push(make(at(i), { mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium' }, 500));
    records.push(make(at(i), { mode: 'enforce', original: 'xhigh', recommendation: 'medium', holdout: true }, 1000));
    records.push(make(at(i), { mode: 'enforce', original: 'medium', recommendation: 'xhigh', applied: 'xhigh' }, 2000));
    records.push(make(at(i), { mode: 'enforce', original: 'medium', recommendation: 'xhigh', holdout: true }, 1000));
  }
  // Excluded from both arms: a yielded treatment and a control the user changed.
  records.push(make(at(0), { mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium', yielded: true }, 9000));
  records.push(make(at(0), { mode: 'enforce', original: 'xhigh', recommendation: 'medium', holdout: true, forwarded: 'high' }, 9000));
  // Too few samples: falls back to the evaluation ratio.
  for (let i = 0; i < 3; i++) {
    records.push(make(at(i), { mode: 'enforce', original: 'xhigh', recommendation: 'high', applied: 'high' }, 1000));
    records.push(make(at(i), { mode: 'enforce', original: 'xhigh', recommendation: 'high', holdout: true }, 1800));
  }
  const factors = measuredFactors(records);
  const byPair = Object.fromEntries(factors.map(f => [f.pair, f]));
  assert.deepEqual([byPair['xhigh>medium'].treatmentTurns, byPair['xhigh>medium'].controlTurns, byPair['xhigh>medium'].usable], [10, 10, true]);
  assert.equal(byPair['xhigh>medium'].outputRatio, 0.5);
  assert.deepEqual(byPair['xhigh>medium'].ci95, [0.5, 0.5]);
  assert.equal(byPair['medium>xhigh'].outputRatio, 2);
  assert.equal(byPair['xhigh>high'].usable, false);
  const { total } = report(records, { by: ['all'] });
  const high = SAVINGS_FACTORS['claude-opus-5-5']['xhigh>high'].outputRatio;
  // 10 × +500 (measured down) + 10 × −1000 (measured up) + 3 × evaluation fallback.
  assert.equal(total.estimatedSaved, Math.round(10 * 500 - 10 * 1000 + 3 * (1000 / high - 1000)));
  assert.equal(total.measuredTurns, 20); assert.equal(total.estimatedTurns, 23);
  assert.equal(total.holdout, 24); assert.equal(total.unestimatedAppliedTurns, 1);
  const text = formatReport(report(records, { by: ['pair'] }));
  assert.match(text, /측정 비율/); assert.match(text, /0\.500–0\.500\s+사용/); assert.match(text, /표본 부족/);
});

test('subagent turns are a separate kind with their own ratios and no evaluation fallback', () => {
  const at = i => `2026-10-${String(1 + i).padStart(2, '0')}T02:00:00Z`;
  const sub = (record, output) => make(at(0), record, output, { kind: 'subagent' });
  const records = [];
  for (let i = 0; i < 10; i++) {
    records.push(make(at(i), { mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium' }, 500));
    records.push(make(at(i), { mode: 'enforce', original: 'xhigh', recommendation: 'medium', holdout: true }, 1000));
    records.push(sub({ mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium' }, 300));
    records.push(sub({ mode: 'enforce', original: 'xhigh', recommendation: 'medium', holdout: true }, 1200));
  }
  // Older lines without kind read back as main turns.
  assert.equal(parseLine(JSON.stringify({ ...records[0], kind: undefined })).kind, 'main');
  assert.equal(parseLine(JSON.stringify({ ...records[0], kind: 'CANARY' })).kind, 'main');
  const byKind = Object.fromEntries(measuredFactors(records).map(f => [f.kind, f]));
  assert.deepEqual([byKind.main.outputRatio, byKind.subagent.outputRatio], [0.5, 0.25]);
  const rows = Object.fromEntries(report(records, { by: ['kind'] }).rows.map(r => [r.key, r]));
  assert.deepEqual([rows.main.turns, rows.subagent.turns, rows.main.estimatedSaved, rows.subagent.estimatedSaved], [20, 20, 5000, 9000]);
  // With too few subagent samples, the main-turn evaluation ratio is not borrowed.
  const few = [sub({ mode: 'enforce', original: 'xhigh', recommendation: 'medium', applied: 'medium' }, 300)];
  const { total } = report(few, { by: ['all'] });
  assert.deepEqual([total.estimatedTurns, total.unestimatedAppliedTurns], [0, 1]);
  assert.match(formatReport(report(records, { by: ['kind'] })), /claude-opus-5-5 · subagent · xhigh>medium/);
});
