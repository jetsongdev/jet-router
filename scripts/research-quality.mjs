import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cases, routingInput } from '../eval/quality-cases.mjs';
import { holdout } from '../eval/research-holdout.mjs';
import { parseKeyFile } from './evaluate-jev.mjs';
import { validJevKey } from '../src/providers/jev.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const baselineSource = () => readFileSync(join(root, 'docs/evaluations/autoresearch-2026-09-27/baseline-harness.txt'), 'utf8');
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function summarize(rows, arm) {
  const selected = rows.filter(row => row.arm === arm);
  return { count: selected.length, matches: selected.filter(row => row.matches).length,
    failures: selected.filter(row => row.reason).length,
    requiredKeepMisses: selected.filter(row => row.requiredKeepMiss).length,
    unnecessaryKeeps: selected.filter(row => row.unnecessaryKeep).length,
    meanLatencyMs: selected.reduce((sum, row) => sum + row.latencyMs, 0) / (selected.length || 1) };
}
export function improves(base, candidate, expectedCount) {
  return base.count === expectedCount && candidate.count === expectedCount &&
    base.failures === 0 && candidate.failures === 0 &&
    candidate.matches - base.matches >= 2 && candidate.requiredKeepMisses <= base.requiredKeepMisses &&
    candidate.unnecessaryKeeps <= base.unnecessaryKeeps;
}

// Isolated copies: experiment instructions never modify the running MCP server.
async function adapter(addition) {
  const dir = mkdtempSync(join(tmpdir(), 'jet-router-research-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'mcp'));
    cpSync(join(root, 'scripts/jev-request.mjs'), join(dir, 'scripts/jev-request.mjs'));
    cpSync(join(root, 'mcp/shadow.mjs'), join(dir, 'mcp/shadow.mjs'));
    const path = join(dir, 'src/harness.js');
    const source = baselineSource();
    const anchor = '  return { status: \'ready\', enforceEligible: false, metadata, uncertainties, input, choices, request };';
    if (!source.includes(anchor)) throw new Error('anchor');
    writeFileSync(path, source.replace(anchor, `  request.questions.effort.instructions += ${JSON.stringify(addition)};\n${anchor}`));
    const { classifyJev } = await import(pathToFileURL(join(dir, 'mcp/shadow.mjs')).href);
    const { prepareRoutingRequest } = await import(pathToFileURL(path).href);
    return { dir, run: classifyJev, prepare: prepareRoutingRequest };
  } catch (error) { rmSync(dir, { recursive: true, force: true }); throw error; }
}

export async function experiment(config, key) {
  if (!validJevKey(key) || !['dev', 'holdout'].includes(config.set) ||
      typeof config.baseline !== 'string' || typeof config.candidate !== 'string' ||
      config.baseline.length > 4000 || config.candidate.length > 4000) throw new Error('input');
  const entries = config.set === 'dev' ? cases : holdout;
  const arms = [];
  const report = { kind: 'paired-live-jev-research', set: config.set, rounds: 3,
    corpusSha256: hash(entries), config, sourceSha256: hash(baselineSource()),
    modelRequested: 'jev-latest', modelReturned: null, retries: 0, enforceApproved: false,
    actualTokens: null, actualBilledUsd: null, rows: [], complete: false };
  try {
    arms.push(await adapter(config.baseline)); arms.push(await adapter(config.candidate));
    outer: for (let round = 0; round < 3; round++) {
      for (const [index, entry] of entries.entries()) {
        // Reverse order across adjacent pairs/rounds to reduce order drift.
        for (const arm of (round + index) % 2 ? [1, 0] : [0, 1]) {
          const input = routingInput(entry);
          const prepared = arms[arm].prepare(input);
          const began = performance.now();
          const result = await arms[arm].run(input, key);
          const choice = result.decision?.choice ?? null;
          report.rows.push({ round, id: entry.id, arm: arm ? 'candidate' : 'baseline',
            requestSha256: hash(prepared.request), ...result, latencyMs: Math.round(performance.now() - began),
            matches: entry.accepted.includes(choice),
            requiredKeepMiss: entry.accepted.length === 1 && entry.accepted[0] === 'keep' && choice !== null && choice !== 'keep',
            unnecessaryKeep: !entry.accepted.includes('keep') && choice === 'keep' });
          if (!result.decision) break outer;
        }
      }
    }
    report.complete = report.rows.length === entries.length * 6 && report.rows.every(row => row.decision);
    report.baseline = summarize(report.rows, 'baseline'); report.candidate = summarize(report.rows, 'candidate');
    report.meaningfulImprovement = report.complete && improves(report.baseline, report.candidate, entries.length * 3);
    return report;
  } finally { for (const arm of arms) rmSync(arm.dir, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 5 || existsSync(process.argv[4]) || statSync(process.argv[2]).size > 16384 || statSync(process.argv[3]).size > 65536) throw new Error('args');
    const report = await experiment(JSON.parse(readFileSync(process.argv[2], 'utf8')), parseKeyFile(readFileSync(process.argv[3], 'utf8')));
    writeFileSync(process.argv[4], `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ complete: report.complete, baseline: report.baseline, candidate: report.candidate, meaningfulImprovement: report.meaningfulImprovement })}\n`);
    process.exitCode = report.complete ? 0 : 1;
  } catch { process.stderr.write('research-run-failed\n'); process.exitCode = 1; }
}
