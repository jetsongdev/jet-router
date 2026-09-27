import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cases, corpusVersion, routingInput } from '../eval/quality-cases.mjs';
import { prepareRoutingRequest } from '../src/harness.js';
import { parseHelperBody } from '../src/providers/jev.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function plan() {
  return { kind: 'prospective-quality-pilot', corpusVersion, corpusSha256: hash(cases),
    labels: 'unvalidated-review-hypotheses', enforceApproved: false,
    items: cases.map(entry => {
      const prepared = prepareRoutingRequest(routingInput(entry));
      if (prepared.status !== 'ready') throw new Error('invalid corpus');
      return { id: entry.id, split: entry.split, category: entry.category,
        accepted: entry.accepted, rationale: entry.rationale,
        choices: prepared.choices, requestSha256: hash(prepared.request) };
    }) };
}

// Score only a complete, explicitly attributed record of the frozen requests.
// No provider, credential reader, retries or model task execution exists here.
export function score(record) {
  const planned = plan();
  if (!record || record.corpusSha256 !== planned.corpusSha256 ||
      !['fixture', 'live-jev'].includes(record.evidence) || !Array.isArray(record.results) ||
      record.results.length !== cases.length) throw new Error('invalid record');
  const seen = new Set();
  const items = record.results.map(row => {
    const expected = planned.items.find(entry => entry.id === row.id);
    if (!expected || seen.has(row.id) || row.requestSha256 !== expected.requestSha256 ||
        !Number.isFinite(row.latencyMs) || row.latencyMs < 0) throw new Error('invalid row');
    seen.add(row.id);
    const checked = parseHelperBody(row.result, expected.choices);
    const choice = checked.decision?.choice ?? null;
    return { id: row.id, split: expected.split, choice,
      matchesHypothesis: choice !== null && expected.accepted.includes(choice),
      requiredKeepMiss: expected.accepted.length === 1 && expected.accepted[0] === 'keep' && choice !== null && choice !== 'keep',
      failure: checked.reason ?? null, latencyMs: row.latencyMs,
      contextScore: checked.decision?.contextScore ?? null, riskScore: checked.decision?.riskScore ?? null };
  });
  const splits = Object.fromEntries(['tune', 'holdout'].map(split => {
    const rows = items.filter(row => row.split === split);
    return [split, { count: rows.length, matching: rows.filter(row => row.matchesHypothesis).length,
      failures: rows.filter(row => row.failure).length, keep: rows.filter(row => row.choice === 'keep').length,
      requiredKeepMisses: rows.filter(row => row.requiredKeepMiss).length,
      meanLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length }];
  }));
  return { ...planned, evidence: record.evidence, evidenceVerified: false, splits, items,
    note: 'Hypothesis agreement is not task success, calibrated accuracy or enforce approval.' };
}

export function main(args, write) {
  try {
    if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
      write(JSON.stringify(plan(), null, 2)); return 0;
    }
    if (args.length !== 2 || args[0] !== '--score') throw new Error('arguments');
    if (statSync(args[1]).size > 65536) throw new Error('size');
    write(JSON.stringify(score(JSON.parse(readFileSync(args[1], 'utf8'))), null, 2));
    return 0;
  } catch { write('invalid-quality-evaluation-input'); return 1; }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2), text => process.stdout.write(`${text}\n`));
}
