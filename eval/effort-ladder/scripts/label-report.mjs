import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFORTS } from '../lib/ids.mjs';

const excludedTasks = new Set(['tq/keyed-queue', 'tq/async-memo', 'tq/ttl-lru', 'ss/patch-components', 'tq/ledger', 'tq/ranges']);
const passed = row => row.passed === true && row.truncated !== true;
const median = values => {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
};
function outputTokens(row) {
  if (row.kind === 'agent' || row.turn === 1 || row.turn === 2) {
    const models = row.usage?.modelUsage;
    if (models && Object.values(models).some(x => Number.isFinite(x.outputTokens))) {
      return Object.values(models).reduce((sum, x) => sum + (Number.isFinite(x.outputTokens) ? x.outputTokens : 0), 0);
    }
    return Number.isFinite(row.usage?.usage?.output_tokens) ? row.usage.usage.output_tokens : null;
  }
  return Number.isFinite(row.usage?.output_tokens) ? row.usage.output_tokens : null;
}
function cell(rows) {
  if (!rows.length) return null;
  const N = rows.length, k = rows.filter(passed).length, p = k / N, z = 1.959963984540054;
  const denominator = 1 + z * z / N;
  const center = (p + z * z / (2 * N)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / N + z * z / (4 * N * N)) / denominator;
  const tokens = rows.map(outputTokens).filter(Number.isFinite);
  const costs = rows.map(r => r.costUsd).filter(Number.isFinite);
  return { k, N, p, wilson95: [Math.max(0, center - margin), Math.min(1, center + margin)], medianOutputTokens: median(tokens), meanCostUsd: costs.length === N ? costs.reduce((a, b) => a + b, 0) / N : null };
}
function labelFor(cells, reference, refIndex) {
  if (!reference || reference.k === 0) return null;
  const threshold = (reference.k - (reference.N >= 10 ? 1 : 0)) / reference.N;
  const index = EFFORTS.findIndex((_, i) => i <= refIndex && EFFORTS.slice(i, refIndex + 1).every(e => cells[e] && cells[e].p >= threshold));
  return index < 0 ? null : EFFORTS[index];
}
// Hypergeometric lower tail: successes in the candidate cell under equal rates.
function fisherLower(candidate, reference) {
  const logChoose = (n, k) => {
    if (k < 0 || k > n) return -Infinity;
    let value = 0;
    for (let i = 1; i <= Math.min(k, n - k); i++) value += Math.log(n - i + 1) - Math.log(i);
    return value;
  };
  const successes = candidate.k + reference.k, total = candidate.N + reference.N;
  let probability = 0;
  for (let k = Math.max(0, successes - reference.N); k <= candidate.k; k++) {
    probability += Math.exp(logChoose(successes, k) + logChoose(total - successes, candidate.N - k) - logChoose(total, candidate.N));
  }
  return Math.min(1, probability);
}
function supplementaryRule(cells, reference, refIndex, rule) {
  const checks = Object.fromEntries(EFFORTS.map((effort, i) => {
    const c = cells[effort];
    if (!c || i > refIndex) return [effort, null];
    if (rule === 'A') {
      const required = Math.max(0, Math.ceil(reference.k * c.N / reference.N) - 1);
      return [effort, { required, meets: c.k >= required, severe: c.k <= required - 2 }];
    }
    const p = fisherLower(c, reference);
    return [effort, { p, meets: p >= 0.1, severe: p < 0.1 }];
  }));
  const tooHard = reference.p < 0.6;
  if (reference.k === 0) return { label: null, status: 'unsolved', tooHard, checks };
  const labelIndex = EFFORTS.findIndex((_, i) => i <= refIndex && EFFORTS.slice(i, refIndex + 1).every(e => checks[e]?.meets));
  if (labelIndex < 0) return { label: null, status: 'unmeasured', tooHard, checks };
  const unstable = EFFORTS.slice(0, labelIndex).some((e, i) => checks[e]?.meets && EFFORTS.slice(i + 1, labelIndex).some(mid => checks[mid]?.severe));
  return { label: EFFORTS[labelIndex], status: labelIndex === 0 ? 'saturated' : unstable ? 'unstable' : 'ok', tooHard, checks };
}
export function buildReport(rows, decisions, waves = []) {
  let excluded = 0;
  const selected = rows.filter(r => {
    if (r.wave === 'w1' && r.effort === 'max' && excludedTasks.has(r.taskId)) { excluded++; return false; }
    return r.kind !== 'agent' && r.turn !== 1 && r.turn !== 2 || r.turn === 1;
  });
  const tasks = [...new Set(selected.map(r => r.taskId))].sort().map(taskId => {
    const taskRows = selected.filter(r => r.taskId === taskId);
    const cells = Object.fromEntries(EFFORTS.map(e => [e, cell(taskRows.filter(r => r.effort === e))]));
    const refIndex = EFFORTS.findLastIndex(e => cells[e]);
    const refEffort = EFFORTS[refIndex], reference = cells[refEffort];
    const label = labelFor(cells, reference, refIndex);
    const threshold = (reference.k - (reference.N >= 10 ? 1 : 0)) / reference.N;
    const status = reference.k === 0 ? 'unsolved' : !label ? 'unmeasured' : label === 'low' ? 'saturated' : EFFORTS.slice(0, EFFORTS.indexOf(label)).some(e => cells[e] && cells[e].p >= threshold) ? 'unstable' : 'ok';
    // Equal best rates use the largest N, making the tie deterministic.
    const best = Object.values(cells).filter(Boolean).sort((a, b) => b.p - a.p || b.N - a.N)[0];
    const unequalN = new Set(Object.values(cells).filter(Boolean).map(c => c.N)).size > 1;
    const ruleA = supplementaryRule(cells, reference, refIndex, 'A');
    return { taskId, cells, refEffort, unequalN, threshold, label: ruleA.label, status: ruleA.status, rule0: { label, status }, label_bprime: labelFor(cells, best, refIndex), ruleA, ruleF: supplementaryRule(cells, reference, refIndex, 'F') };
  });
  const byTask = new Map(tasks.map(t => [t.taskId, t]));
  const counts = () => ({ under: 0, equal: 0, over: 0, unjudged: 0 });
  const e1 = { applied: counts(), recommendation: counts(), rows: [] };
  for (const d of decisions) {
    const task = byTask.get(d.task_id);
    const compare = value => {
      const effort = value === 'keep' ? d.original : value;
      if (d.error || !task || !['ok', 'saturated'].includes(task.status) || !EFFORTS.includes(effort)) return null;
      const delta = EFFORTS.indexOf(effort) - EFFORTS.indexOf(task.label);
      return delta < 0 ? 'under' : delta > 0 ? 'over' : 'equal';
    };
    const applied = compare(d.applied), recommendation = compare(d.recommendation);
    e1.applied[applied ?? 'unjudged']++; e1.recommendation[recommendation ?? 'unjudged']++;
    e1.rows.push({ taskId: d.task_id, original: d.original, label: task?.label ?? null, status: task?.status ?? 'unmeasured', recommendation: d.recommendation, applied: d.applied, probability: d.probability ?? null, recommendationResult: recommendation, appliedResult: applied });
  }
  const agentRows = rows.filter(r => r.turn === 1 && (r.kind === 'agent' || r.taskId?.startsWith('ag/')));
  const e2 = {};
  for (const field of ['shadowRaise', 'shadowRaiseV0b']) {
    if (!agentRows.some(r => r[field] != null)) continue;
    const table = subset => {
      const result = { triggered: { passed: 0, failed: 0 }, not_triggered: { passed: 0, failed: 0 }, unknown: 0 };
      for (const row of subset) {
        const state = row[field]?.status;
        if (!(state === 'triggered' || state === 'not_triggered')) result.unknown++;
        else result[state][passed(row) ? 'passed' : 'failed']++;
      }
      return result;
    };
    e2[field] = Object.fromEntries([...EFFORTS.map(e => [e, table(agentRows.filter(r => r.effort === e))]), ['total', table(agentRows)]]);
  }
  const turn2 = rows.filter(r => r.turn === 2).map(r => ({ runId: r.runId, parentRunId: r.parentRunId, taskId: r.taskId, arm: r.arm, passed: passed(r) }));
  return { waves, excludedW1Max: excluded, tasks, e1, e2, turn2 };
}
export function markdown(report) {
  const out = ['# Effort ladder report', '', `Waves: ${report.waves.join(', ')}`, '원장 주석: a4 취소 run 1건은 assumed-max 로 정산되어 원장이 실제보다 최대 $0.93 과대', `Excluded w1 max (절단, 미측정): ${report.excludedW1Max}`, '', '## Labels', '', '| Task | low | medium | high | xhigh | max | refEffort | N | 주 라벨 (ruleA) | 주 상태 (ruleA) | rule0 참고 | rule0 상태 | label_bprime (rule0) | ruleF 민감도 | ruleF 상태 | too-hard |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const t of report.tasks) out.push(`| ${t.taskId} | ${EFFORTS.map(e => t.cells[e] ? `${t.cells[e].k}/${t.cells[e].N}` : '—').join(' | ')} | ${t.refEffort} | ${t.unequalN ? 'N 불균일' : '균일'} | ${t.label ?? '—'} | ${t.status} | ${t.rule0.label ?? '—'} | ${t.rule0.status} | ${t.label_bprime ?? '—'} | ${t.ruleF.label ?? '—'} | ${t.ruleF.status} | ${t.ruleA.tooHard ? 'yes' : 'no'} |`);
  out.push('', '주 라벨 ruleA: 셀별 1건 관용. rule0은 참고, label_bprime은 rule0 민감도. ruleF: 단측 Fisher p < 0.1 위반. too-hard: 기준 통과율 < 0.6. 미측정 중간 단계는 충족으로 보지 않음.', '', '## Cell details', '', '| Task | Effort | k/N | Wilson 95% | Median output tokens | Mean cost USD |', '|---|---|---|---|---|---|');
  for (const t of report.tasks) for (const e of EFFORTS) { const c = t.cells[e]; if (c) out.push(`| ${t.taskId} | ${e} | ${c.k}/${c.N} | ${c.wilson95.map(x => x.toFixed(3)).join('–')} | ${c.medianOutputTokens ?? '—'} | ${c.meanCostUsd == null ? '—' : c.meanCostUsd.toFixed(6)} |`); }
  out.push('', '## E1', '', '주 라벨 ruleA 기준으로 각 M1 행을 집계하며 unsolved, unstable, 미측정은 판정하지 않음.', '', '| 추천 | 부족 | 일치 | 과잉 | 판정 제외 |', '|---|---:|---:|---:|---:|');
  for (const key of ['recommendation', 'applied']) { const c = report.e1[key]; out.push(`| ${key} | ${c.under} | ${c.equal} | ${c.over} | ${c.unjudged} |`); }
  out.push('', '| Task | Original | Label | Status | Recommendation (probability) | 판정 | Applied | 판정 |', '|---|---|---|---|---|---|---|---|');
  for (const r of report.e1.rows) out.push(`| ${r.taskId} | ${r.original} | ${r.label ?? '—'} | ${r.status} | ${r.recommendation ?? '—'} (${r.probability ?? '—'}) | ${r.recommendationResult ?? '—'} | ${r.applied ?? '—'} | ${r.appliedResult ?? '—'} |`);
  for (const [field, tables] of Object.entries(report.e2)) {
    out.push('', `## E2: ${field}`, '', '| Effort | Triggered pass | Triggered fail | Not triggered pass | Not triggered fail | Unknown |', '|---|---:|---:|---:|---:|---:|');
    for (const [e, t] of Object.entries(tables)) out.push(`| ${e} | ${t.triggered.passed} | ${t.triggered.failed} | ${t.not_triggered.passed} | ${t.not_triggered.failed} | ${t.unknown} |`);
  }
  out.push('', '## E2: turn 2', '', '| Run | Parent run | Task | Arm | Passed |', '|---|---|---|---|---|');
  for (const r of report.turn2) out.push(`| ${r.runId} | ${r.parentRunId ?? '—'} | ${r.taskId} | ${r.arm ?? '—'} | ${r.passed} |`);
  return out.join('\n') + '\n';
}
function readJsonl(path, allowPartial = false) {
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  if (allowPartial && !content.endsWith('\n')) {
    try { JSON.parse(lines.at(-1)); } catch { lines.pop(); }
  }
  return lines.filter(line => line.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${path}:${i + 1}: ${error.message}`); }
  });
}
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--waves' || !args[1]) throw new Error('Usage: node scripts/label-report.mjs --waves w1,w2,w2m,w3,a1,a2,a3');
  const waves = args[1].split(',');
  if (new Set(waves).size !== waves.length || waves.some(w => !/^(w1|w2|w2m|w3|a1|a2|a3|a4)$/.test(w))) throw new Error('Invalid or duplicate wave');
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const rows = waves.flatMap(w => readJsonl(resolve(root, 'runs', w, w.startsWith('a') ? 'agent.jsonl' : 'results.jsonl'), w === 'a4'));
  const report = buildReport(rows, readJsonl(resolve(root, 'runs/m1/decisions-jev.jsonl')), waves);
  const dir = resolve(root, 'runs/report'); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'labels.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(resolve(dir, 'labels.md'), markdown(report));
  console.log(`Wrote ${dir}/labels.json and labels.md`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
