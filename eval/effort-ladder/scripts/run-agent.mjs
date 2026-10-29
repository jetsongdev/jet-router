import { cp, mkdir, readFile, readdir, rm, appendFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EFFORTS, runId, sha256 } from '../lib/ids.mjs';
import { openLedger } from '../lib/ledger.mjs';
import { createIsolation } from '../lib/agent-isolation.mjs';
import { createShadowRaise } from '../lib/shadow-raise.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
export async function runAgent({ wave, tasks, efforts, reps, twoTurn = false, paid = false, query: injectedQuery, grade: injectedGrade, ledger: injectedLedger, baseDir = base, outputDir }) {
  if (!injectedQuery && !(paid && process.env.LADDER_ALLOW_PAID === '1')) throw Error('paid call blocked');
  if (!/^[A-Za-z0-9_-]+$/.test(wave) || !Number.isSafeInteger(reps) || reps < 1 || !tasks.length || !efforts.length || efforts.some(e => !EFFORTS.includes(e)) || tasks.some(t => !/^ag\/[A-Za-z0-9_-]+$/.test(t))) throw Error('invalid arguments');
  outputDir ??= join(baseDir, 'runs', wave);
  const query = injectedQuery ?? (await import('@anthropic-ai/claude-agent-sdk')).query;
  const grade = injectedGrade ?? (await import('../agent/grade-agent.mjs')).gradeWorkspace;
  await mkdir(outputDir, { recursive: true });
  const ledger = injectedLedger ?? openLedger(join(baseDir, 'ledger.jsonl'));
  const rows = [];
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
        isolated = await createIsolation({ fixture: join(taskDir, 'fixture'), hiddenPaths: [join(baseDir, 'agent'), snapshotRoot], effort: item.effort, maxTurns: meta.maxTurns, maxBudgetUsd: item.effort === 'max' ? 1.5 : 1 });
        const execute = async ({ effort, turn = 1, arm, parent }) => {
          const id = runId({ wave, suite: 'ag', slug, effort: item.effort, rep: item.rep, ...(turn === 2 ? { turn, arm } : {}) });
          const budget = effort === 'max' ? 1.5 : 1;
          const reservation = await ledger.reserve(turn === 1 ? 'agent' : 'turn2', budget, id);
          const shadow = createShadowRaise(), startedAt = new Date().toISOString(), start = Date.now();
          let result, sessionId, effortEvidence = null, error;
          try {
            const options = { ...isolated.options, effort, maxBudgetUsd: budget, ...(parent ? { resume: parent.sessionId, forkSession: true } : {}) };
            for await (const message of query({ prompt: turn === 1 ? prompt : FOLLOWUP, options })) {
              shadow.observe(message);
              if (message.session_id) sessionId = message.session_id;
              if (message.type === 'system' && message.subtype === 'init' && typeof message.effort === 'string') effortEvidence = message.effort;
              if (message.type === 'result') result = message;
            }
          } catch (e) { error = e; }
          const cumulative = result?.total_cost_usd;
          const usable = Number.isFinite(cumulative) && cumulative > 0 && (!parent || (Number.isFinite(parent.cost) && parent.cost > 0 && cumulative > parent.cost));
          const costUsd = usable ? cumulative - (parent?.cost ?? 0) : budget;
          const costSource = usable ? 'sdk-total_cost_usd' : 'assumed-max';
          await ledger.settle(reservation, { runId: id, usd: costUsd, usage: result?.modelUsage ?? result?.usage ?? null, source: costSource });
          const ws = join(outputDir, 'ws', id); await mkdir(dirname(ws), { recursive: true }); await cp(isolated.cwd, ws, { recursive: true, force: false, errorOnExist: true });
          const scored = await grade(slug, ws);
          const failedResult = !result || result.subtype !== 'success' || result.is_error;
          const row = { v: 1, runId: id, taskId: item.task, kind: 'agent', effort, rep: item.rep, wave, turn, arm: arm ?? null, parentRunId: parent?.id ?? null, model: 'claude-opus-5-5', promptSha256: sha256(turn === 1 ? prompt : FOLLOWUP), fixtureSha256, startedAt, durationMs: Date.now() - start, endReason: result?.subtype ?? 'error_during_execution', truncated: ['error_max_turns', 'error_max_budget_usd'].includes(result?.subtype), usage: result ? { usage: result.usage, modelUsage: result.modelUsage } : null, costUsd, costSource, passed: !failedResult && scored.passed, passedChecks: scored.passedChecks, totalChecks: scored.totalChecks, publicTestsUnmodified: scored.publicTestsUnmodified, shadowRaise: turn === 2 ? parent.shadow : shadow.result(), effortEvidence, ...(turn === 2 ? { effortTurn2: effort } : {}) };
          await appendFile(join(outputDir, 'agent.jsonl'), JSON.stringify(row) + '\n'); rows.push(row);
          if (error) throw error;
          return { id, sessionId, cost: cumulative, shadow: shadow.result(), row };
        };
        const parent = await execute({ effort: item.effort });
        if (twoTurn && targets.has(slug) && !parent.row.passed) {
          if (!parent.sessionId) throw Error('failed run has no session ID for fork');
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
    else if (['--wave', '--tasks', '--efforts', '--reps'].includes(flag)) { const value = args.shift(); if (!value || value.startsWith('--')) throw Error('invalid arguments'); result[flag.slice(2)] = value; }
    else throw Error('invalid arguments');
  }
  if (!result.paid || process.env.LADDER_ALLOW_PAID !== '1') throw Error('paid call blocked');
  return { ...result, tasks: (result.tasks ?? '').split(',').filter(Boolean), efforts: (result.efforts ?? '').split(',').filter(Boolean), reps: Number(result.reps) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runAgent(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = error.message === 'paid call blocked' ? 3 : 1; }
}
