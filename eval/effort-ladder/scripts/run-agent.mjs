import { cp, mkdir, readFile, readdir, rm, appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EFFORTS, runId, sha256 } from '../lib/ids.mjs';
import { openLedger } from '../lib/ledger.mjs';
import { loadKeys } from '../lib/keys.mjs';
import { createIsolation } from '../lib/agent-isolation.mjs';
import { bashNonzeroHint, createShadowRaise } from '../lib/shadow-raise.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const segments = ['pilot', 'batch', 'agent', 'boost', 'turn2'];
function safeInit(message) {
  const result = {};
  for (const key of ['model', 'permissionMode', 'cwd', 'output_style']) if (typeof message[key] === 'string') result[key] = message[key];
  for (const key of ['tools', 'slash_commands', 'agents', 'skills']) if (Array.isArray(message[key])) result[key] = message[key].filter(value => typeof value === 'string');
  if (message.effort === null || EFFORTS.includes(message.effort)) result.effort = message.effort;
  if (['ANTHROPIC_API_KEY', 'apiKeyHelper', '/login managed key', 'none', 'user', 'project', 'org', 'temporary', 'oauth'].includes(message.apiKeySource)) result.apiKeySource = message.apiKeySource;
  for (const [key, fields] of [['mcp_servers', ['name', 'status', 'source']], ['plugins', ['name', 'path', 'version']]]) {
    if (Array.isArray(message[key])) result[key] = message[key].map(item => Object.fromEntries(fields.filter(k => typeof item[k] === 'string').map(k => [k, item[k]])));
  }
  return result;
}
function budgetFor(effort, meta) { return meta.budgetUsd?.[effort] ?? (effort === 'max' ? 3 : effort === 'xhigh' ? 1.5 : 1); }
function classifyError(error) {
  const status = error?.status ?? error?.statusCode;
  const detail = `${error?.name ?? ''} ${error?.code ?? ''} ${error?.message ?? ''}`;
  if (status === 402 || /billing|credit.balance|payment|insufficient.quota/i.test(detail)) return 'billing';
  if (status === 401 || status === 403 || /authenticat|unauthori[sz]ed|forbidden|invalid.api.key|credential/i.test(detail)) return 'auth';
  if (status === 429 || /rate.?limit/i.test(detail)) return 'rate_limit';
  if (/network|fetch.failed|econn|enotfound|etimedout|socket|dns/i.test(detail)) return 'network';
  return 'other';
}
function executionStop(reason, exitCode = 1) { const error = Error(reason); error.exitCode = exitCode; return error; }
const targets = new Set(['site-route-repair', 'link-lint-scope', 'batch-rollback-debug']);
export const FOLLOWUP = 'Some requirements in the original task are still not met. Re-read the task statement carefully, find what is missing or wrong, fix it, and run the public tests again.';

async function treeHash(dir) {
  async function files(root, prefix = '') {
    const result = [];
    for (const ent of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) result.push(...await files(join(root, ent.name), rel));
      else if (ent.isFile()) result.push([rel, sha256(await readFile(join(root, ent.name)))]);
      else throw Error('fixture contains unsupported entry');
    }
    return result;
  }
  return sha256(JSON.stringify(await files(dir)));
}
function shuffle(items, seed) {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  for (let i = items.length - 1; i > 0; i--) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; const j = state % (i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}

// Supplying query is the only unpaid path, and must be a test stub.
export async function runAgent({ wave, tasks, efforts, reps, twoTurn = false, forkAlways = false, segment, paid = false, query: injectedQuery, grade: injectedGrade, ledger: injectedLedger, ledgerPath, baseDir = base, outputDir }) {
  if (!injectedQuery && !(paid && process.env.LADDER_ALLOW_PAID === '1')) throw Error('paid call blocked');
  if (!/^[A-Za-z0-9_-]+$/.test(wave) || !Number.isSafeInteger(reps) || reps < 1 || !tasks.length || !efforts.length || efforts.some(e => !EFFORTS.includes(e)) || tasks.some(t => !/^ag\/[A-Za-z0-9_-]+$/.test(t))) throw Error('invalid arguments');
  if ((segment !== undefined && !segments.includes(segment)) || (forkAlways && (!twoTurn || segment !== 'pilot'))) throw Error('invalid arguments');
  outputDir ??= join(baseDir, 'runs', wave);
  ledgerPath ??= join(baseDir, 'runs', 'ledger.jsonl');
  const apiKey = injectedQuery ? undefined : loadKeys().ANTHROPIC_API_KEY;
  if (!injectedQuery && !apiKey) throw Error('missing-key');
  const query = injectedQuery ?? (await import('@anthropic-ai/claude-agent-sdk')).query;
  const grade = injectedGrade ?? (await import('../agent/grade-agent.mjs')).gradeWorkspace;
  await mkdir(outputDir, { recursive: true });
  if (!injectedLedger) await mkdir(dirname(ledgerPath), { recursive: true });
  const ledger = injectedLedger ?? openLedger(ledgerPath);
  const rows = []; let consecutiveErrors = 0;
  try {
    const matrix = [];
    for (const task of tasks) for (const effort of efforts) for (let rep = 1; rep <= reps; rep++) matrix.push({ task, effort, rep });
    for (const item of shuffle(matrix, wave)) {
      const slug = item.task.slice(3), taskDir = join(baseDir, 'agent', slug);
      const prompt = await readFile(join(taskDir, 'prompt.txt'), 'utf8');
      const meta = JSON.parse(await readFile(join(taskDir, 'meta.json'), 'utf8'));
      const fixtureSha256 = await treeHash(join(taskDir, 'fixture'));
      const snapshotRoot = await mkdtemp(join(tmpdir(), 'effort-parent-'));
      let isolated;
      try {
        isolated = await createIsolation({ fixture: join(taskDir, 'fixture'), hiddenPaths: [join(baseDir, 'agent'), snapshotRoot], effort: item.effort, maxTurns: meta.maxTurns, maxBudgetUsd: budgetFor(item.effort, meta), apiKey });
        const execute = async ({ effort, turn = 1, arm, parent }) => {
          const id = runId({ wave, suite: 'ag', slug, effort: item.effort, rep: item.rep, ...(turn === 2 ? { turn, arm } : {}) });
          const budget = budgetFor(effort, meta);
          const reservation = await ledger.reserve(segment ?? (turn === 1 ? 'agent' : 'turn2'), budget, id);
          const shadow = createShadowRaise(), shadowV0b = createShadowRaise({ rule: 'v0b' }), startedAt = new Date().toISOString(), start = Date.now();
          let result, sessionId, effortEvidence = null, hookEffort = null, error;
          const bashIds = new Set(), errorIds = new Set(), stepIds = new Set(); const steps = []; let bashCalls = 0, toolErrors = 0, bashNonzeroHints = 0, bashNonzeroFlagged = 0;
          try {
            const options = { ...isolated.options, effort, maxBudgetUsd: budget, hooks: { PreToolUse: [{ hooks: [async input => { if (typeof input.effort?.level === 'string') hookEffort = input.effort.level; return {}; }] }] }, ...(parent ? { resume: parent.sessionId, forkSession: true } : {}) };
            for await (const message of query({ prompt: turn === 1 ? prompt : FOLLOWUP, options })) {
              shadow.observe(message); shadowV0b.observe(message);
              if (message.type === 'assistant' && message.parent_tool_use_id == null && message.message?.id && !stepIds.has(message.message.id)) {
                stepIds.add(message.message.id);
                const usage = message.message.usage ?? {};
                const step = { id: message.message.id, input_tokens: usage.input_tokens ?? null, cache_read_input_tokens: usage.cache_read_input_tokens ?? null, cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null };
                if (usage.cache_creation) step.cache_creation = Object.fromEntries(['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'].filter(key => usage.cache_creation[key] != null).map(key => [key, usage.cache_creation[key]]));
                steps.push(step);
              }
              if (message.session_id) sessionId = message.session_id;
              if (message.type === 'system' && message.subtype === 'init') {
                effortEvidence = typeof message.effort === 'string' ? message.effort : null;
                const dir = join(outputDir, 'init'); await mkdir(dir, { recursive: true });
                await writeFile(join(dir, `${id}.json`), JSON.stringify(safeInit(message), null, 2) + '\n');
              }
              const content = message.message?.content;
              if (Array.isArray(content) && (message.type === 'assistant' || message.type === 'user')) for (const block of content) {
                if (message.type === 'assistant' && block.type === 'tool_use' && block.name === 'Bash') { bashCalls++; bashIds.add(block.id); }
                if (message.type === 'user' && block.type === 'tool_result') {
                  if (block.is_error === true) { toolErrors++; errorIds.add(block.tool_use_id); }
                  if (bashIds.has(block.tool_use_id) && bashNonzeroHint(block.content)) { bashNonzeroHints++; if (block.is_error === true) bashNonzeroFlagged++; }
                }
              }
              if (message.type === 'result') result = message;
            }
          } catch (e) { error = e; }
          effortEvidence ??= hookEffort;
          const bashErrors = [...errorIds].filter(id => bashIds.has(id)).length;
          const cumulative = result?.total_cost_usd;
          const usable = Number.isFinite(cumulative) && cumulative > 0 && (!parent || (Number.isFinite(parent.cost) && parent.cost > 0 && cumulative > parent.cost));
          const costUsd = usable ? cumulative - (parent?.cost ?? 0) : budget;
          const costSource = usable ? 'sdk-total_cost_usd' : 'assumed-max';
          await ledger.settle(reservation, { runId: id, usd: costUsd, usage: result?.modelUsage ?? result?.usage ?? null, source: costSource });
          const ws = join(outputDir, 'ws', id); await mkdir(dirname(ws), { recursive: true }); await cp(isolated.cwd, ws, { recursive: true, force: false, errorOnExist: true });
          const scored = await grade(slug, ws);
          const failedResult = !result || result.subtype !== 'success' || result.is_error;
          const row = { v: 1, runId: id, taskId: item.task, kind: 'agent', effort, rep: item.rep, wave, turn, arm: arm ?? null, parentRunId: parent?.id ?? null, model: 'claude-opus-5-5', promptSha256: sha256(turn === 1 ? prompt : FOLLOWUP), fixtureSha256, startedAt, durationMs: Date.now() - start, endReason: result?.subtype ?? 'error_during_execution', truncated: ['error_max_turns', 'error_max_budget_usd'].includes(result?.subtype), usage: result ? { usage: result.usage, modelUsage: result.modelUsage } : null, costUsd, costSource, passed: !failedResult && scored.passed, passedChecks: scored.passedChecks, totalChecks: scored.totalChecks, publicTestsUnmodified: scored.publicTestsUnmodified, shadowRaise: turn === 2 ? parent.shadow : shadow.result(), shadowRaiseV0b: turn === 2 ? parent.shadowV0b : shadowV0b.result(), effortEvidence, bashCalls, bashErrors, toolErrors, bashNonzeroHints, bashNonzeroFlagged, steps, cacheReadTotal: steps.reduce((sum, step) => sum + (step.cache_read_input_tokens ?? 0), 0), cacheCreationTotal: steps.reduce((sum, step) => sum + (step.cache_creation_input_tokens ?? 0), 0), firstStepCacheCreation: steps[0]?.cache_creation_input_tokens ?? null, ...(!result ? { errorClass: classifyError(error) } : {}), ...(turn === 2 && forkAlways ? { forced: true } : {}), ...(turn === 2 ? { effortTurn2: effort } : {}) };
          await appendFile(join(outputDir, 'agent.jsonl'), JSON.stringify(row) + '\n'); rows.push(row);
          consecutiveErrors = result ? 0 : consecutiveErrors + 1;
          if (!result && ['auth', 'billing'].includes(row.errorClass)) throw executionStop('agent-execution-' + row.errorClass, 5);
          if (consecutiveErrors >= 3) throw executionStop('agent-execution-consecutive-errors');
          return { id, sessionId, cost: cumulative, shadow: shadow.result(), shadowV0b: shadowV0b.result(), row };
        };
        const parent = await execute({ effort: item.effort });
        if (parent.row.endReason !== 'error_during_execution' && twoTurn && targets.has(slug) && (forkAlways || !parent.row.passed)) {
          if (!parent.sessionId) throw Error('run has no session ID for fork');
          const snapshot = join(snapshotRoot, 'workspace'); await cp(isolated.cwd, snapshot, { recursive: true });
          for (const [arm, effort] of [['S', item.effort], ['U', EFFORTS[EFFORTS.indexOf(item.effort) + 1]]]) {
            if (!effort) continue;
            await rm(isolated.cwd, { recursive: true, force: true }); await cp(snapshot, isolated.cwd, { recursive: true });
            await execute({ effort, turn: 2, arm, parent });
          }
        }
      } finally { if (isolated) await isolated.cleanup(); await rm(snapshotRoot, { recursive: true, force: true }); }
    }
  } finally { if (!injectedLedger) ledger.close(); }
  return rows;
}

function parseArgs(args) {
  const result = { twoTurn: false, paid: false };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--paid') result.paid = true;
    else if (flag === '--two-turn') result.twoTurn = true;
    else if (flag === '--fork-always') result.forkAlways = true;
    else if (['--wave', '--tasks', '--efforts', '--reps', '--segment', '--ledger'].includes(flag)) { const value = args.shift(); if (!value || value.startsWith('--')) throw Error('invalid arguments'); result[flag === '--ledger' ? 'ledgerPath' : flag.slice(2)] = value; }
    else throw Error('invalid arguments');
  }
  if (!result.paid || process.env.LADDER_ALLOW_PAID !== '1') throw Error('paid call blocked');
  return { ...result, tasks: (result.tasks ?? '').split(',').filter(Boolean), efforts: (result.efforts ?? '').split(',').filter(Boolean), reps: Number(result.reps) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runAgent(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? (error.message === 'paid call blocked' ? 3 : 1); }
}
