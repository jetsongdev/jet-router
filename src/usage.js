import { EFFORTS } from './policy.js';

// Local usage log: one line per routed main turn. Never prompt or answer text.
export const USAGE_VERSION = 1;
const MODES = ['shadow', 'enforce'];
const PROVIDERS = ['fake', 'jev'];
const OUTCOMES = ['answer', 'aborted', 'error', 'refusal'];

// Output-token ratio (recommended / original) measured on the same tasks.
// Only measured pairs are estimated; everything else is reported as unestimated.
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
export function usageRecord({ project, model, record, outcome, durationMs, usage }) {
  return {
    v: USAGE_VERSION,
    project: text(project, 1024),
    model: text(model, 128),
    mode: MODES.includes(record.mode) ? record.mode : null,
    provider: PROVIDERS.includes(record.provider) ? record.provider : null,
    original: effort(record.original),
    recommendation: record.recommendation === 'keep' ? 'keep' : effort(record.recommendation),
    applied: effort(record.applied),
    yielded: record.yielded === true,
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
    project: value.project, model: value.model, outcome: value.outcome, durationMs: value.durationMs,
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
  pair: r => `${r.original ?? '?'}>${r.applied ?? r.recommendation ?? '?'}`,
  all: () => 'all',
});

function factorFor(r, target) {
  return SAVINGS_FACTORS[r.model]?.[`${r.original}>${target}`] ?? null;
}

function emptyTotals() {
  return { turns: 0, enforceTurns: 0, applied: 0, upshifts: 0, yielded: 0, skipped: 0,
    output: 0, input: 0, cacheRead: 0, cacheCreation: 0,
    estimatedSaved: 0, estimatedBaselineOutput: 0, estimatedTurns: 0, unestimatedAppliedTurns: 0, unestimatedAppliedOutput: 0,
    shadowPotentialSaved: 0, shadowEstimatedTurns: 0, shadowUnestimatedTurns: 0 };
}

const SKIP = new Set(['no-consent', 'missing-key', 'busy', 'redirect', 'http-error', 'response-too-large', 'invalid-input',
  'timeout', 'provider-error', 'invalid-response', 'correlation', 'max', 'unsupported', 'overlap', 'queued', 'attachment',
  'hidden-context', 'empty', 'too-long', 'command', 'rewritten']);

// Estimates only what was measured. An applied turn's actual output is the
// recommended arm, so the counterfactual is actual / ratio. A yielded turn ran
// partly at the user's effort and is never estimated.
export function accumulate(totals, r) {
  const t = totals;
  t.turns++;
  for (const key of ['output', 'input', 'cacheRead', 'cacheCreation']) t[key] += r.usage[key] ?? 0;
  if (SKIP.has(r.reasonCode)) t.skipped++;
  if (r.mode === 'enforce') {
    t.enforceTurns++;
    if (r.applied) {
      t.applied++;
      if (EFFORTS.indexOf(r.applied) > EFFORTS.indexOf(r.original)) t.upshifts++;
      if (r.yielded) t.yielded++;
      const factor = r.yielded ? null : factorFor(r, r.applied);
      if (factor && r.usage.output !== null) {
        const baseline = r.usage.output / factor.outputRatio;
        t.estimatedBaselineOutput += baseline;
        t.estimatedSaved += baseline - r.usage.output;
        t.estimatedTurns++;
      } else {
        t.unestimatedAppliedTurns++;
        t.unestimatedAppliedOutput += r.usage.output ?? 0;
      }
    }
  } else if (r.mode === 'shadow' && EFFORTS.includes(r.recommendation) && r.recommendation !== r.original && !SKIP.has(r.reasonCode)) {
    // Shadow ran at the original effort: potential saving = actual * (1 - ratio).
    const factor = factorFor(r, r.recommendation);
    if (factor && r.usage.output !== null) {
      t.shadowPotentialSaved += r.usage.output * (1 - factor.outputRatio);
      t.shadowEstimatedTurns++;
    } else t.shadowUnestimatedTurns++;
  }
  return t;
}

export function report(records, { by = ['day'], from, to } = {}) {
  const inRange = r => (!from || localDay(r.ts) >= from) && (!to || localDay(r.ts) <= to);
  const keys = by.map(name => {
    if (!GROUPS[name]) throw new Error(`unknown group: ${name}`);
    return GROUPS[name];
  });
  const groups = new Map();
  const total = emptyTotals();
  for (const r of records.filter(inRange)) {
    const key = keys.map(k => k(r)).join(' · ');
    if (!groups.has(key)) groups.set(key, emptyTotals());
    accumulate(groups.get(key), r);
    accumulate(total, r);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, t]) => ({ key, ...round(t) }));
  return { by, from: from ?? null, to: to ?? null, rows, total: round(total) };
}

function round(t) {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
}
