import { EFFORTS } from './policy.js';

// Local usage log: one line per routed main turn. Never prompt or answer text.
export const USAGE_VERSION = 1;
const MODES = ['shadow', 'enforce'];
const PROVIDERS = ['fake', 'jev'];
const OUTCOMES = ['answer', 'aborted', 'error', 'refusal'];
// main: a typed turn; subagent: a subagent turn spawned by one (no kind = main).
const KINDS = ['main', 'subagent'];

// Output-token ratio (recommended / original) measured on the same tasks.
// Only measured pairs are estimated; everything else is reported as unestimated.
// Measured on main turns only, so subagent turns rely on their own control group.
export const SAVINGS_FACTORS = Object.freeze({
  'claude-opus-5-5': Object.freeze({
    'xhigh>medium': Object.freeze({ outputRatio: 9467 / 18298, runs: 9, source: 'docs/evaluations/downshift-claude-2026-09-28' }),
    'xhigh>high': Object.freeze({ outputRatio: 5204 / 9517, runs: 3, source: 'docs/evaluations/downshift-claude-2026-09-28' }),
  }),
});

const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const effort = value => (EFFORTS.includes(value) ? value : null);
const text = (value, max) => (typeof value === 'string' && value.length <= max ? value : null);

// Builds the stored record from a router record and host usage. Unknown values
// become null instead of being copied, so no free text can reach the log.
export function usageRecord({ project, model, kind, record, outcome, durationMs, usage }) {
  return {
    v: USAGE_VERSION,
    kind: KINDS.includes(kind) ? kind : 'main',
    project: text(project, 1024),
    model: text(model, 128),
    mode: MODES.includes(record.mode) ? record.mode : null,
    provider: PROVIDERS.includes(record.provider) ? record.provider : null,
    original: effort(record.original),
    recommendation: record.recommendation === 'keep' ? 'keep' : effort(record.recommendation),
    applied: effort(record.applied),
    yielded: record.yielded === true,
    holdout: record.holdout === true,
    forwarded: effort(record.forwarded),
    reasonCode: text(record.reasonCode, 32),
    probability: typeof record.probability === 'number' && record.probability >= 0 && record.probability <= 1 ? record.probability : null,
    classifyMs: count(record.latencyMs === null ? null : Math.round(record.latencyMs)),
    outcome: OUTCOMES.includes(outcome) ? outcome : null,
    durationMs: count(durationMs),
    usage: {
      input: count(usage?.input_tokens), output: count(usage?.output_tokens),
      cacheRead: count(usage?.cache_read_input_tokens), cacheCreation: count(usage?.cache_creation_input_tokens),
    },
  };
}

// Re-validates a stored line; a record is rebuilt field by field, never passed through.
export function parseLine(line) {
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  if (!value || value.v !== USAGE_VERSION || typeof value.ts !== 'string' || Number.isNaN(Date.parse(value.ts))) return null;
  const rebuilt = usageRecord({
    project: value.project, model: value.model, kind: value.kind, outcome: value.outcome, durationMs: value.durationMs,
    record: { ...value, latencyMs: value.classifyMs },
    usage: { input_tokens: value.usage?.input, output_tokens: value.usage?.output,
      cache_read_input_tokens: value.usage?.cacheRead, cache_creation_input_tokens: value.usage?.cacheCreation },
  });
  return { ts: value.ts, ...rebuilt };
}

function localDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoWeek(ts) {
  const d = new Date(ts);
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const week = Math.ceil(((day - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const GROUPS = Object.freeze({
  day: r => localDay(r.ts),
  week: r => isoWeek(r.ts),
  month: r => localDay(r.ts).slice(0, 7),
  project: r => r.project ?? '(unknown)',
  model: r => r.model ?? '(unknown)',
  mode: r => r.mode ?? '(unknown)',
  kind: r => r.kind,
  pair: r => `${r.original ?? '?'}>${r.applied ?? r.recommendation ?? '?'}`,
  all: () => 'all',
});

export const MIN_SAMPLES = 10;
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

// Deterministic resampling so the same log always prints the same interval.
function bootstrapRatio(treatment, control, rounds = 1000) {
  let seed = 0x9e3779b9;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = values => values[Math.floor(next() * values.length)];
  const ratios = [];
  for (let i = 0; i < rounds; i++) {
    const t = mean(treatment.map(() => pick(treatment))), c = mean(control.map(() => pick(control)));
    if (c > 0) ratios.push(t / c);
  }
  ratios.sort((a, b) => a - b);
  return ratios.length ? [ratios[Math.floor(ratios.length * 0.025)], ratios[Math.ceil(ratios.length * 0.975) - 1]] : [null, null];
}

// Measured ratio per model, kind and pair: applied turns versus randomly
// held-out turns of the same pair. Subagent turns inherit the main turn's arm,
// and their task sizes differ, so they are never mixed with main turns. Turns whose effort the user changed mid-turn are
// excluded from both arms.
export function measuredFactors(records) {
  const arms = new Map();
  for (const r of records) {
    if (r.mode !== 'enforce' || r.usage.output === null || !r.model) continue;
    const target = r.applied ?? (r.holdout ? r.recommendation : null);
    if (!target) continue;
    const key = `${r.model}|${r.kind}|${r.original}>${target}`;
    if (!arms.has(key)) arms.set(key, { treatment: [], control: [] });
    if (r.applied && !r.yielded && !r.holdout) arms.get(key).treatment.push(r.usage.output);
    if (r.holdout && r.forwarded === r.original) arms.get(key).control.push(r.usage.output);
  }
  return [...arms.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, { treatment, control }]) => {
    const [model, kind, pair] = key.split('|');
    const usable = treatment.length >= MIN_SAMPLES && control.length >= MIN_SAMPLES && mean(control) > 0;
    const ratio = treatment.length && control.length && mean(control) > 0 ? mean(treatment) / mean(control) : null;
    const [low, high] = usable ? bootstrapRatio(treatment, control) : [null, null];
    return { model, kind, pair, treatmentTurns: treatment.length, controlTurns: control.length,
      treatmentMeanOutput: treatment.length ? mean(treatment) : null, controlMeanOutput: control.length ? mean(control) : null,
      outputRatio: ratio, ci95: [low, high], usable };
  });
}

function factorFor(r, target, measured) {
  const own = measured.find(f => f.usable && f.model === r.model && f.kind === r.kind && f.pair === `${r.original}>${target}`);
  if (own) return { outputRatio: own.outputRatio, source: 'measured' };
  const evaluated = r.kind === 'main' ? SAVINGS_FACTORS[r.model]?.[`${r.original}>${target}`] : undefined;
  return evaluated ? { outputRatio: evaluated.outputRatio, source: 'evaluation' } : null;
}

function emptyTotals() {
  return { turns: 0, enforceTurns: 0, applied: 0, upshifts: 0, yielded: 0, holdout: 0, skipped: 0,
    output: 0, input: 0, cacheRead: 0, cacheCreation: 0,
    estimatedSaved: 0, estimatedBaselineOutput: 0, estimatedTurns: 0, measuredTurns: 0, unestimatedAppliedTurns: 0, unestimatedAppliedOutput: 0,
    shadowPotentialSaved: 0, shadowEstimatedTurns: 0, shadowUnestimatedTurns: 0 };
}

const SKIP = new Set(['no-consent', 'missing-key', 'busy', 'redirect', 'http-error', 'response-too-large', 'invalid-input',
  'timeout', 'provider-error', 'invalid-response', 'correlation', 'max', 'unsupported', 'overlap', 'queued', 'attachment',
  'hidden-context', 'empty', 'too-long', 'command', 'rewritten']);

// Estimates only what was measured. An applied turn's actual output is the
// recommended arm, so the counterfactual is actual / ratio; a measured upshift
// ratio above 1 yields a negative saving. A yielded turn ran partly at the
// user's effort and is never estimated; held-out turns are the control.
export function accumulate(totals, r, measured = []) {
  const t = totals;
  t.turns++;
  for (const key of ['output', 'input', 'cacheRead', 'cacheCreation']) t[key] += r.usage[key] ?? 0;
  if (SKIP.has(r.reasonCode)) t.skipped++;
  if (r.mode === 'enforce') {
    t.enforceTurns++;
    if (r.holdout) t.holdout++;
    if (r.applied) {
      t.applied++;
      if (EFFORTS.indexOf(r.applied) > EFFORTS.indexOf(r.original)) t.upshifts++;
      if (r.yielded) t.yielded++;
      const factor = r.yielded ? null : factorFor(r, r.applied, measured);
      if (factor && r.usage.output !== null) {
        const baseline = r.usage.output / factor.outputRatio;
        t.estimatedBaselineOutput += baseline;
        t.estimatedSaved += baseline - r.usage.output;
        t.estimatedTurns++;
        if (factor.source === 'measured') t.measuredTurns++;
      } else {
        t.unestimatedAppliedTurns++;
        t.unestimatedAppliedOutput += r.usage.output ?? 0;
      }
    }
  } else if (r.mode === 'shadow' && EFFORTS.includes(r.recommendation) && r.recommendation !== r.original && !SKIP.has(r.reasonCode)) {
    // Shadow ran at the original effort: potential saving = actual * (1 - ratio).
    const factor = factorFor(r, r.recommendation, measured);
    if (factor && r.usage.output !== null) {
      t.shadowPotentialSaved += r.usage.output * (1 - factor.outputRatio);
      t.shadowEstimatedTurns++;
    } else t.shadowUnestimatedTurns++;
  }
  return t;
}

// factorRecords lets a filtered view (one project, one mode) keep the ratios
// measured on every record of the period.
export function report(records, { by = ['day'], from, to, factorRecords } = {}) {
  const inRange = r => (!from || localDay(r.ts) >= from) && (!to || localDay(r.ts) <= to);
  const keys = by.map(name => {
    if (!GROUPS[name]) throw new Error(`unknown group: ${name}`);
    return GROUPS[name];
  });
  const groups = new Map();
  const total = emptyTotals();
  const selected = records.filter(inRange);
  // Ratios come from the whole selected period, not from each group.
  const factors = measuredFactors(factorRecords ? factorRecords.filter(inRange) : selected);
  for (const r of selected) {
    const key = keys.map(k => k(r)).join(' · ');
    if (!groups.has(key)) groups.set(key, emptyTotals());
    accumulate(groups.get(key), r, factors);
    accumulate(total, r, factors);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, t]) => ({ key, ...round(t) }));
  return { by, from: from ?? null, to: to ?? null, rows, total: round(total), factors };
}

function round(t) {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
}
