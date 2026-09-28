import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, realpathSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { tasks } from '../eval/task-quality/tasks.mjs';
import { taskPrompt, runProcess, gradeCode } from './run-task-quality.mjs';

// Claude counterpart of compare-downshift.mjs. Routes come from the installed
// jet-router shadow path (host claude-code) and are frozen before generation.
const sha = x => createHash('sha256').update(x).digest('hex');
const model = 'claude-opus-5-5';
const schema = { type: 'object', properties: { code: { type: 'string' } }, required: ['code'], additionalProperties: false };
// One line so the prompt can be typed into the composer for routing unchanged.
export const claudePrompt = task => taskPrompt(task).replace(/\s*\n+\s*/g, ' ');
const save = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

function recordedEfforts(sessionId) {
  const projects = join(homedir(), '.claude/projects');
  for (const dir of readdirSync(projects)) {
    const file = join(projects, dir, `${sessionId}.jsonl`);
    if (!existsSync(file)) continue;
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(entry => entry.type === 'assistant').map(entry => entry.perTurnEffort ?? null);
  }
  return null;
}

export async function generateClaude(task, effort) {
  if (!['low', 'medium', 'high', 'xhigh'].includes(effort)) throw new Error('effort');
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'jet-router-claude-coding-')));
  try {
    const args = ['-p', '--model', model, '--effort', effort, '--output-format', 'json', '--json-schema', JSON.stringify(schema),
      '--tools', '', '--setting-sources', '', '--strict-mcp-config'];
    // No user CLAUDE.md, auto-memory, plugin hooks or Jev key reach the generation.
    const env = { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '0' };
    delete env.TYPESAFE_API_KEY;
    const execution = await runProcess('claude', args, { cwd: dir, env }, claudePrompt(task), 600000);
    let out; try { out = JSON.parse(execution.stdout); } catch { out = undefined; }
    const code = out?.structured_output?.code;
    const usage = out?.usage ? {
      input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens,
      cache_read_input_tokens: out.usage.cache_read_input_tokens, cache_creation_input_tokens: out.usage.cache_creation_input_tokens,
    } : null;
    const sessionId = out?.session_id ?? null;
    const efforts = sessionId ? recordedEfforts(sessionId) : null;
    const common = { task: task.id, model, requestedEffort: effort, recordedEfforts: efforts,
      effortEvidence: 'explicit --effort; transcript perTurnEffort; wire-unobserved',
      promptSha256: sha(claudePrompt(task)), sessionId, usage, numTurns: out?.num_turns ?? null,
      costUsd: out?.total_cost_usd ?? null, latencyMs: execution.latencyMs };
    const effortMismatch = !efforts?.length || efforts.some(e => e !== effort);
    if (execution.code !== 0 || out?.is_error || typeof code !== 'string' || code.length > 65536 || !usage || effortMismatch) {
      return { ...common, passed: false, error: effortMismatch ? 'effort-mismatch' : 'generation-failed' };
    }
    const grade = gradeCode(task.id, code);
    return { ...common, code, codeSha256: sha(code), grade, passed: grade.passed };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const main = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
const [mode, path] = main ? process.argv.slice(2) : [];
if (mode === 'prompts') {
  for (const task of tasks) console.log(JSON.stringify({ task: task.id, promptSha256: sha(claudePrompt(task)), prompt: claudePrompt(task) }));
} else if (mode === 'run') {
  try {
    const routes = JSON.parse(readFileSync(path, 'utf8'));
    const output = path.replace(/\.json$/, '-runs.json');
    if (!routes.complete || existsSync(output) || routes.taskSha256 !== sha(JSON.stringify(tasks))) throw new Error('input');
    for (const route of routes.routes) {
      if (route.promptSha256 !== sha(claudePrompt(tasks.find(t => t.id === route.task)))) throw new Error('prompt');
    }
    const selected = routes.routes.filter(r => r.eligible);
    if (!selected.length) throw new Error('no-downshift');
    const report = { startedAt: new Date().toISOString(), routes, results: [], complete: false };
    for (let round = 0; round < 3; round++) for (const [index, route] of selected.entries()) {
      for (const arm of (round + index) % 2 ? ['recommended', 'baseline'] : ['baseline', 'recommended']) {
        const effort = arm === 'baseline' ? 'xhigh' : route.choice;
        const result = await generateClaude(tasks.find(t => t.id === route.task), effort);
        report.results.push({ round, arm, order: report.results.length, ...result }); save(output, report);
        console.log(JSON.stringify({ task: route.task, round, arm, effort, passed: result.passed, usage: result.usage, latencyMs: result.latencyMs, error: result.error }));
        if (result.error) throw new Error('generation');
      }
    }
    report.complete = true; report.finishedAt = new Date().toISOString(); save(output, report);
  } catch { console.error('claude-downshift-experiment-stopped'); process.exitCode = 1; }
} else if (mode) { console.error('mode'); process.exitCode = 1; }
