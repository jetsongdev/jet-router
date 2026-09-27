import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cases } from '../eval/jev-smoke.mjs';
import { buildJevRequest } from '../src/providers/jev-contract.js';
import { parseHelperResult, validJevKey, PROCESS_ENV, PROCESS_TIMEOUT_MS, HELPER_OUTPUT_LIMIT } from '../src/providers/jev.js';

export function plan() {
  const items = cases.map(({ id, expected, ...state }) => {
    const request = JSON.stringify(buildJevRequest(state));
    return { id, currentEffort: state.currentEffort, expected,
      requestBytes: Buffer.byteLength(request), requestSha256: createHash('sha256').update(request).digest('hex') };
  });
  if (items.length !== 12 || items.some(item => item.requestBytes > 65536)) throw new Error('invalid-corpus');
  return { kind: 'synthetic-smoke', modelRequested: 'jev-latest', maxCalls: 12,
    retries: 0, endpoint: 'https://api.typesafe.ai/v1/systemone',
    corpusSha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex'), items };
}

// Uses the exact shipped helper. No HTTP path exists in the dry run.
export function runHelper(state, apiKey) {
  return new Promise(resolveResult => {
    const childEnv = { ...process.env };
    for (const name of Object.keys(childEnv)) if (childEnv[name] === apiKey) delete childEnv[name];
    const child = spawn(process.execPath, [fileURLToPath(new URL('./jev-request.mjs', import.meta.url))], {
      env: { ...childEnv, ...PROCESS_ENV },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', done = false;
    const finish = result => {
      if (done) return;
      done = true; clearTimeout(timer); resolveResult(result);
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ reason: 'timeout' }); }, PROCESS_TIMEOUT_MS);
    child.on('error', () => finish({ reason: 'provider-error' }));
    child.stdout.on('data', chunk => {
      if (done) return;
      stdout += chunk.toString('utf8');
      if (stdout.length > HELPER_OUTPUT_LIMIT) { child.kill('SIGKILL'); finish({ reason: 'invalid-response' }); }
    });
    child.stderr.resume(); // Never propagate child errors or bodies.
    child.on('close', exitCode => finish(parseHelperResult({ exitCode, stdout })));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ apiKey, state }));
  });
}

export async function evaluate(apiKey, run = runHelper) {
  const report = { ...plan(), mode: 'live', attempted: 0, results: [],
    actualBilledUsd: null, actualTokens: null, modelReturned: null, enforceApproved: false };
  for (const { id, expected, ...state } of cases) {
    const began = performance.now();
    report.attempted++;
    const result = await run(state, apiKey);
    const latencyMs = Math.round(performance.now() - began);
    report.results.push({ id, ...result, latencyMs,
      withinHookWaitBudget: latencyMs < 1000,
      needsReview: !result.decision || !expected.includes(result.decision.choice) });
    if (result.reason) break; // No retry after transport/schema/timeout failure.
  }
  return report;
}

// Deliberately does not source shell code or load any other .env variable.
export function parseKeyFile(text) {
  const entries = text.split(/\r?\n/).filter(line => /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=/.test(line));
  if (entries.length !== 1) return undefined;
  const value = entries[0].replace(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*/, '').trim();
  const quoted = value.match(/^(["'])([^"'\r\n]*)\1\s*(?:#.*)?$/);
  return quoted ? quoted[2] : (/^[^\s"']+(?:\s+#.*)?$/.test(value) ? value.split(/\s+#/)[0] : undefined);
}

function readKeyFile(path) {
  if (statSync(path).size > 65536) return undefined;
  return parseKeyFile(readFileSync(path, 'utf8'));
}

export async function main(args, env, output) {
  try {
    if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
      output(JSON.stringify({ ...plan(), mode: 'dry-run', attempted: 0 }, null, 2)); return 0;
    }
    if (args.length !== 3 || args[0] !== '--live' || !['--key-env', '--key-file'].includes(args[1]) ||
        (args[1] === '--key-env' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(args[2]))) {
      output('usage: evaluate-jev.mjs [--dry-run | --live --key-env NAME | --live --key-file PATH]'); return 1;
    }
    plan(); // Validate the entire corpus before reading the explicitly named key.
    const key = args[1] === '--key-env' ? env[args[2]] : readKeyFile(args[2]);
    if (!validJevKey(key)) { output('missing-key'); return 1; }
    const report = await evaluate(key);
    output(JSON.stringify(report, null, 2));
    return report.results.some(item => item.reason) ? 1 : 0;
  } catch { output('evaluation-failed'); return 1; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2), process.env, text => process.stdout.write(`${text}\n`));
}
