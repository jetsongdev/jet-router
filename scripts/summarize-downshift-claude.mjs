import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tasks } from '../eval/task-quality/tasks.mjs';
import { gradeCode } from './run-task-quality.mjs';
import { signFlip } from './summarize-downshift.mjs';
import { claudePrompt } from './compare-downshift-claude.mjs';

// Claude counterpart of summarize-downshift.mjs; Claude reports cache reads and
// writes separately and no reasoning-token split.
const sha = x => createHash('sha256').update(x).digest('hex');
const KEYS = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'];
function totals(rows) {
  const sum = key => rows.reduce((n, r) => n + r.usage[key], 0);
  return { runs: rows.length, passes: rows.filter(r => r.passed).length, input: sum('input_tokens'),
    cacheRead: sum('cache_read_input_tokens'), cacheCreation: sum('cache_creation_input_tokens'), output: sum('output_tokens'),
    costUsd: Number(rows.reduce((n, r) => n + r.costUsd, 0).toFixed(6)), latencyMs: rows.reduce((n, r) => n + r.latencyMs, 0) };
}
export function summarize(report) {
  assert.equal(report.complete, true); assert.equal(report.routes.complete, true);
  const eligible = report.routes.routes.filter(r => r.eligible); assert.ok(eligible.length > 0);
  assert.equal(report.results.length, eligible.length * 6);
  const sessions = new Set(), pairs = [];
  const perTask = eligible.map(route => {
    const rows = report.results.filter(r => r.task === route.task); assert.equal(rows.length, 6);
    for (let round = 0; round < 3; round++) {
      const pair = rows.filter(r => r.round === round); assert.equal(pair.length, 2);
      const baseline = pair.find(r => r.arm === 'baseline'), recommended = pair.find(r => r.arm === 'recommended');
      for (const row of pair) {
        assert.ok(row.sessionId && !sessions.has(row.sessionId)); sessions.add(row.sessionId);
        assert.ok(!row.error); assert.equal(row.model, report.routes.model); assert.equal(row.numTurns, 2); // --json-schema answers through one StructuredOutput call.
        const effort = row.arm === 'baseline' ? report.routes.baseline : route.choice;
        assert.equal(row.requestedEffort, effort); assert.ok(row.recordedEfforts.every(e => e === effort));
        assert.equal(row.passed, row.grade.passed);
        for (const key of KEYS) assert.ok(Number.isFinite(row.usage[key]) && row.usage[key] >= 0);
      }
      assert.equal(baseline.promptSha256, recommended.promptSha256);
      pairs.push({ task: route.task, round, baselinePassed: baseline.passed, recommendedPassed: recommended.passed,
        outputSaved: baseline.usage.output_tokens - recommended.usage.output_tokens, regression: baseline.passed && !recommended.passed });
    }
    const baseline = totals(rows.filter(r => r.arm === 'baseline')), recommended = totals(rows.filter(r => r.arm === 'recommended'));
    return { task: route.task, effort: route.choice, baseline, recommended, outputSaved: baseline.output - recommended.output,
      outputReductionPct: 100 * (baseline.output - recommended.output) / baseline.output };
  });
  const baseline = totals(report.results.filter(r => r.arm === 'baseline'));
  const recommended = totals(report.results.filter(r => r.arm === 'recommended'));
  const outputReductionPct = 100 * (baseline.output - recommended.output) / baseline.output;
  const regressions = pairs.filter(p => p.regression).length;
  return { baseline, recommended, perTask, pairs, regressions, outputReductionPct,
    cliCostReductionPct: 100 * (baseline.costUsd - recommended.costUsd) / baseline.costUsd,
    taskLevelOneSidedSignFlipP: signFlip(perTask.map(t => t.outputSaved / 3)),
    positiveSavingPairs: pairs.filter(p => p.outputSaved > 0).length,
    passCriterion: outputReductionPct >= 10 && regressions === 0 && report.complete,
    bothArmsAllPassed: baseline.passes === baseline.runs && recommended.passes === recommended.runs,
    exclusions: report.routes.routes.filter(r => !r.eligible).map(r => ({ task: r.task, choice: r.choice, reason: 'not-a-strict-downshift' })),
    routerLatencyMs: report.routes.routes.map(r => r.latencyMs), routerCost: null };
}
export function verify(report) {
  assert.equal(report.routes.taskSha256, sha(JSON.stringify(tasks)));
  assert.equal(report.routes.graderSha256, sha(readFileSync(new URL('../eval/task-quality/grade.mjs', import.meta.url))));
  for (const [index, row] of report.results.entries()) {
    assert.equal(row.order, index);
    assert.equal(row.promptSha256, sha(claudePrompt(tasks.find(t => t.id === row.task))));
    assert.equal(row.codeSha256, sha(row.code)); assert.deepEqual(gradeCode(row.task, row.code), row.grade);
  }
  return summarize(report);
}
if (process.argv[2]) {
  const summary = verify(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  writeFileSync(process.argv[3], JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ baseline: summary.baseline, recommended: summary.recommended, outputReductionPct: summary.outputReductionPct, regressions: summary.regressions, passCriterion: summary.passCriterion, p: summary.taskLevelOneSidedSignFlipP }));
}
