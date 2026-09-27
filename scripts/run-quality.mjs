import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cases, routingInput } from '../eval/quality-cases.mjs';
import { plan } from './evaluate-quality.mjs';
import { parseKeyFile } from './evaluate-jev.mjs';
import { classifyJev } from '../mcp/shadow.mjs';
import { parseHelperBody, validJevKey } from '../src/providers/jev.js';

export async function runQuality(apiKey, run = classifyJev) {
  const planned = plan();
  if (!validJevKey(apiKey)) throw new Error('missing-key');
  const report = { corpusSha256: planned.corpusSha256, corpusVersion: planned.corpusVersion,
    evidence: 'live-jev', modelRequested: 'jev-latest', modelReturned: null,
    maxCalls: cases.length, retries: 0, complete: false, enforceApproved: false,
    actualTokens: null, actualBilledUsd: null, results: [] };
  for (const [index, entry] of cases.entries()) {
    const began = performance.now();
    let raw;
    try { raw = await run(routingInput(entry), apiKey); }
    catch { raw = { reason: 'provider-error' }; }
    const result = parseHelperBody(raw?.decision ? { ok: true, ...raw } : { ok: false, ...raw }, planned.items[index].choices);
    report.results.push({ id: entry.id, requestSha256: planned.items[index].requestSha256,
      latencyMs: Math.round(performance.now() - began),
      result: { ok: Boolean(result.decision), ...result } });
    if (!result.decision) break;
  }
  report.complete = report.results.length === cases.length && report.results.every(row => row.result.ok);
  return report;
}

export async function main(args, env, write, run = runQuality) {
  try {
    if (args.length !== 3 || args[0] !== '--live' || !['--key-file', '--key-env'].includes(args[1])) throw new Error('args');
    plan();
    let key;
    if (args[1] === '--key-env') {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args[2])) throw new Error('env');
      key = env[args[2]];
    } else {
      if (statSync(args[2]).size > 65536) throw new Error('size');
      key = parseKeyFile(readFileSync(args[2], 'utf8'));
    }
    if (!validJevKey(key)) throw new Error('key');
    const report = await run(key);
    write(JSON.stringify(report, null, 2));
    return report.complete ? 0 : 1;
  } catch { write('quality-run-failed'); return 1; }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2), process.env, text => process.stdout.write(`${text}\n`));
}
