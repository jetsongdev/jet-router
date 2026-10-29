import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, markdown } from '../scripts/label-report.mjs';

const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
function rows(taskId, pairs, extra = {}) {
  return pairs.flatMap(([k, n], i) => Array.from({ length: n }, (_, j) => ({ taskId, effort: efforts[i], passed: j < k, wave: 'w2', kind: 'single', truncated: false, usage: { output_tokens: 10 + j }, costUsd: 1, ...extra })));
}
const result = data => buildReport(data, []).tasks[0];

test('saturated, unsolved, unstable and ok', () => {
  assert.equal(result(rows('s', [[5,5],[5,5],[5,5],[5,5],[5,5]])).status, 'saturated');
  const unsolved = result(rows('u', [[1,5],[1,5],[1,5],[1,5],[0,5]]));
  assert.equal(unsolved.status, 'unsolved'); assert.equal(unsolved.label, null);
  const unstable = result(rows('i', [[0,5],[5,5],[3,5],[5,5],[5,5]]));
  assert.equal(unstable.rule0.status, 'unstable'); assert.equal(unstable.rule0.label, 'xhigh');
  const ok = result(rows('o', [[0,5],[1,5],[5,5],[5,5],[5,5]]));
  assert.equal(ok.rule0.status, 'ok'); assert.equal(ok.rule0.label, 'high');
});
test('delta uses reference N and compares rates with mixed N', () => {
  const mixed = result(rows('m', [[0,5],[4,5],[9,10],[10,10],[9,10]]));
  assert.equal(mixed.threshold, 0.8); assert.equal(mixed.rule0.label, 'medium');
  assert.equal(mixed.label_bprime, 'high');
  const small = result(rows('n', [[0,5],[4,5],[4,5],[5,5],[5,5]]));
  assert.equal(small.threshold, 1); assert.equal(small.rule0.label, 'xhigh');
});
test('exclude specified w1 max only; other truncated rows fail', () => {
  const data = rows('tq/ranges', [[0,1],[0,1],[0,1],[0,1],[1,1]]);
  data.push({ ...data.at(-1), wave: 'w1' }, { ...data.at(-1), wave: 'w3', truncated: true });
  const report = buildReport(data, []);
  assert.equal(report.excludedW1Max, 1);
  assert.deepEqual([report.tasks[0].cells.max.k, report.tasks[0].cells.max.N], [1,2]);
});
test('agent tokens, turn isolation, E1 and E2', () => {
  const data = rows('ag/example', [[1,1],[1,1],[1,1],[1,1],[1,1]], { kind: 'agent', turn: 1, usage: { modelUsage: { a: { outputTokens: 10 }, b: { outputTokens: 3 } } }, shadowRaise: { status: 'triggered' }, shadowRaiseV0b: { status: 'not_triggered' } });
  data.push({ ...data[0], turn: 2, passed: false, parentRunId: 'parent', arm: 'U' });
  const report = buildReport(data, [{ task_id: 'ag/example', original: 'high', recommendation: 'keep', applied: 'medium' }]);
  assert.equal(report.tasks[0].cells.low.medianOutputTokens, 13);
  assert.equal(report.tasks[0].cells.low.N, 1);
  assert.equal(report.e1.recommendation.over, 1); assert.equal(report.e1.applied.over, 1);
  assert.equal(report.e2.shadowRaise.total.triggered.passed, 5);
  assert.equal(report.e2.shadowRaiseV0b.total.not_triggered.passed, 5);
  assert.equal(report.turn2[0].parentRunId, 'parent'); assert.equal(report.turn2[0].passed, false);
});

test('rule0 and ruleA use the actual reference and cell-specific tolerance', () => {
  const unit = result(rows('unit', [[9,10],[10,10],[9,10],[10,10],[5,5]]));
  assert.equal(unit.refEffort, 'max'); assert.equal(unit.rule0.label, 'xhigh'); assert.equal(unit.label, 'low'); assert.equal(unit.status, 'saturated');
  assert.equal(unit.ruleA.label, 'low'); assert.equal(unit.ruleA.status, 'saturated'); assert.equal(unit.unequalN, true);
  const heading = result(rows('heading', [[0,10],[9,10],[8,10],[10,10],[10,10]]));
  assert.equal(heading.ruleA.label, 'xhigh'); assert.equal(heading.ruleA.status, 'ok');
  const noMax = result(rows('missing', [[0,5],[1,5],[5,5],[5,5],[0,0]]));
  assert.equal(noMax.refEffort, 'xhigh'); assert.equal(noMax.rule0.label, 'high'); assert.equal(noMax.ruleA.label, 'high');
});
test('ruleA detects only a severe intervening dip and flags hard references', () => {
  const unstable = result(rows('dip', [[5,5],[1,5],[5,5],[5,5],[5,5]]));
  assert.equal(unstable.ruleA.label, 'high'); assert.equal(unstable.ruleA.status, 'unstable');
  const hard = result(rows('hard', [[0,5],[0,5],[1,5],[2,5],[2,5]]));
  assert.equal(hard.ruleA.tooHard, true); assert.equal(hard.ruleF.tooHard, true); assert.notEqual(hard.ruleA.label, null);
  const unsolved = result(rows('unsolved', [[1,5],[1,5],[1,5],[1,5],[0,5]]));
  assert.equal(unsolved.ruleA.status, 'unsolved'); assert.equal(unsolved.ruleF.status, 'unsolved');
});
test('ruleF uses one-sided Fisher lower tail and identifies intervening violations', () => {
  const task = result(rows('fisher', [[5,5],[0,5],[5,5],[5,5],[5,5]]));
  assert.ok(Math.abs(task.ruleF.checks.medium.p - 1 / 252) < 1e-12);
  assert.equal(task.ruleF.label, 'high'); assert.equal(task.ruleF.status, 'unstable');
  assert.ok(task.ruleF.checks.low.p > 0.1);
});

 test('primary label drives E1 and the report preserves reference columns and ledger note', () => {
  const data = rows('heading', [[0,10],[9,10],[8,10],[10,10],[10,10]]);
  const report = buildReport(data, [{ task_id: 'heading', original: 'high', recommendation: 'high', applied: 'xhigh' }], ['a4']);
  const task = report.tasks[0];
  assert.equal(task.rule0.status, 'unstable');
  assert.deepEqual([task.label, task.status], ['xhigh', 'ok']);
  assert.equal(report.e1.recommendation.under, 1); assert.equal(report.e1.applied.equal, 1);
  const text = markdown(report);
  assert.match(text, /주 라벨 \(ruleA\)/); assert.match(text, /rule0 참고/); assert.match(text, /ruleF 민감도/);
  assert.ok(text.includes('원장 주석: a4 취소 run 1건은 assumed-max 로 정산되어 원장이 실제보다 최대 $0.93 과대'));
});
