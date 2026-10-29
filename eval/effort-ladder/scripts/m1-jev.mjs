import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { requestJev } from '../../../scripts/jev-request.mjs';
import { MIN_APPLY_PROBABILITY } from '../../../src/policy.js';
import { sha256 } from '../lib/ids.mjs';
import { loadKeys } from '../lib/keys.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const reasons = new Set(['missing-key', 'invalid-input', 'timeout', 'provider-error', 'redirect', 'http-error', 'response-too-large', 'invalid-response']);
const choices = new Set(['keep', 'low', 'medium', 'high', 'xhigh']);
const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const pair = (id, original) => JSON.stringify([id, original]);

export async function runM1({ paid = false, onlyFailed = false, resume = true, maxCalls = 45, gapMs = 250, timeoutMs = 3000, manifestPath = join(base, 'tasks-manifest.json'), outputPath = join(base, 'runs/m1/decisions-jev.jsonl') } = {}, { request, apiKey, env = process.env, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!request && !(paid && env.LADDER_ALLOW_PAID === '1')) throw Object.assign(Error('paid call blocked'), { exitCode: 3 });
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 0 || !Number.isSafeInteger(gapMs) || gapMs < 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw Error('invalid arguments');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.some(t => typeof t.task_id !== 'string' || typeof t.prompt !== 'string' || sha256(t.prompt) !== t.prompt_sha256) || new Set(manifest.map(t => t.task_id)).size !== manifest.length) throw Error('manifest invalid or prompt hash mismatch');
  const latest = new Map();
  if (existsSync(outputPath)) for (const line of readFileSync(outputPath, 'utf8').split('\n').filter(Boolean)) { const row = JSON.parse(line); latest.set(pair(row.task_id, row.original), row); }
  if (!request) { apiKey = loadKeys(env.LADDER_KEYS_FILE).TYPESAFE_API_KEY; if (!apiKey) throw Error('missing-key'); request = (input, timeout) => requestJev(input, undefined, timeout); }
  let calls = 0, capped = false;
  for (const task of manifest) for (const original of ['medium', 'high']) {
    const id = pair(task.task_id, original), previous = latest.get(id);
    if (onlyFailed ? !previous || previous.error === null : resume && previous?.error === null) continue;
    if (calls >= maxCalls) { capped = true; break; }
    if (calls) await sleep(gapMs);
    const routingInput = { host: 'claude-code', prompt: task.prompt, cloudConsent: true, target: { model: 'claude-opus-5-5', source: 'host', supportedEfforts: null }, effort: { value: original, source: 'host' }, event: { sessionId: null, turnId: `m1-${task.task_id.replace(/[^A-Za-z0-9_-]/g, '-')}-${original}`, correlated: true }, context: { source: 'prompt-only', missingRequired: null } };
    const start = performance.now(); let result;
    try { result = await request({ apiKey, routingInput }, timeoutMs); } catch { result = { ok: false, reason: 'provider-error' }; }
    const latencyMs = Math.round(performance.now() - start); calls++;
    const d = result?.decision;
    const valid = result?.ok === true && choices.has(d?.choice) && unit(d.selectedProbability) && unit(d.confidence) && unit(d.contextScore) && unit(d.riskScore);
    const error = valid ? null : (reasons.has(result?.reason) ? result.reason : 'invalid-response');
    const row = { v: 1, task_id: task.task_id, prompt_sha256: task.prompt_sha256, model: 'jev', original, recommendation: valid ? d.choice : null, applied: valid && d.choice !== 'keep' && d.selectedProbability >= MIN_APPLY_PROBABILITY ? d.choice : original, probability: valid ? d.selectedProbability : null, confidence: valid ? d.confidence : null, contextScore: valid ? d.contextScore : null, riskScore: valid ? d.riskScore : null, contextSent: false, latencyMs, error, ts: new Date().toISOString() };
    mkdirSync(dirname(outputPath), { recursive: true }); appendFileSync(outputPath, JSON.stringify(row) + '\n'); latest.set(id, row);
  }
  const summary = { success: 0, failures: {}, recommendations: {}, calls, capped };
  for (const task of manifest) for (const original of ['medium', 'high']) {
    const row = latest.get(pair(task.task_id, original)); if (!row) continue;
    if (row.error !== null) summary.failures[row.error] = (summary.failures[row.error] ?? 0) + 1;
    else { summary.success++; summary.recommendations[row.recommendation] = (summary.recommendations[row.recommendation] ?? 0) + 1; }
  }
  return summary;
}

function parseArgs(args) {
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (flag === '--paid') options.paid = true;
    else if (flag === '--only-failed') options.onlyFailed = true;
    else if (flag === '--resume') options.resume = true;
    else if (flag === '--no-resume') options.resume = false;
    else if (['--max-calls', '--gap-ms', '--timeout-ms'].includes(flag)) {
      const value = args.shift(); if (!value || !/^\d+$/.test(value)) throw Error('invalid arguments');
      options[{ '--max-calls': 'maxCalls', '--gap-ms': 'gapMs', '--timeout-ms': 'timeoutMs' }[flag]] = Number(value);
    } else throw Error('invalid arguments');
  }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { if (!process.argv.includes('--paid') || process.env.LADDER_ALLOW_PAID !== '1') throw Object.assign(Error('paid call blocked'), { exitCode: 3 }); console.log(JSON.stringify(await runM1(parseArgs(process.argv.slice(2))))); }
  catch (error) { console.error(error.exitCode === 3 ? 'paid call blocked' : 'm1 execution failed'); process.exitCode = error.exitCode ?? 1; }
}
