// Explicit opt-in smoke test. Uses existing Codex authentication; never reads credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { startProxy } from './proxy.mjs';
import { inspectItems } from './live-evidence.mjs';
import { classifyJev } from '../mcp/shadow.mjs';
import { validJevKey } from '../src/providers/jev.js';

const args = process.argv.slice(2);
const plan = { model: 'gpt-6-astra', baseline: 'medium', maxJevCalls: 1, maxModelTurns: 2,
  retriesByProbe: 0, independentSessions: false, costComparison: false, wireObserved: false };
if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
  console.log(JSON.stringify(plan));
} else if (args.length !== 2 || args[0] !== '--live' || existsSync(args[1]) || !validJevKey(process.env.TYPESAFE_API_KEY)) {
  console.error('usage: probe-live.mjs --live NEW_REPORT_PATH (requires TYPESAFE_API_KEY)'); process.exitCode = 1;
} else {
  const report = { ...plan, startedAt: new Date().toISOString(), jevCalls: 0, submitted: [], turns: [], complete: false };
  const save = () => writeFileSync(args[1], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(args[1], '{}\n', { flag: 'wx', mode: 0o600 });
  const dir = mkdtempSync(join(tmpdir(), 'jet-router-live-'));
  const config = { mode: 'enforce', consent: true, apiKey: process.env.TYPESAFE_API_KEY };
  let proxy, ws, stage = 'startup', seq = 0;
  const pending = new Map(), events = [];
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('rpc-timeout')); }, 75000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    const auth = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'auth.json');
    assert.ok(existsSync(auth), 'existing-file-login-required');
    const home = join(dir, 'home'); mkdirSync(home);
    symlinkSync(auth, join(home, 'auth.json')); // No credential values read or printed by the probe.
    const env = { ...process.env, CODEX_HOME: home }; delete env.TYPESAFE_API_KEY;
    proxy = await startProxy({ config, notice: () => {},
      classify: async (...parameters) => {
        assert.equal(++report.jevCalls, 1);
        const result = await classifyJev(...parameters); report.jev = result; save(); return result;
      },
      launch: () => {
        const child = spawn('codex', ['app-server', '--stdio',
          '-c', 'model="gpt-6-astra"', '-c', 'model_reasoning_effort="medium"',
          '-c', 'project_doc_max_bytes=0', '-c', 'features.shell_tool=false'], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
        const write = child.stdin.write.bind(child.stdin);
        child.stdin.write = (chunk, ...rest) => {
          const message = JSON.parse(chunk);
          if (message.method === 'turn/start') {
            report.submitted.push({ effort: message.params.effort ?? null, explicitOverride: message.params.effort !== undefined }); save();
          }
          return write(chunk, ...rest);
        };
        return child;
      } });
    ws = new WebSocket(`ws+unix://${proxy.socketPath}:/`);
    ws.on('message', bytes => {
      const message = JSON.parse(bytes);
      const entry = message.method === undefined ? pending.get(message.id) : undefined;
      if (entry) {
        pending.delete(message.id); clearTimeout(entry.timer);
        if (message.error) entry.reject(Error('rpc-error')); else entry.resolve(message.result);
      } else if (message.method) events.push(message);
    });
    ws.on('close', () => {
      for (const { timer, reject } of pending.values()) { clearTimeout(timer); reject(Error('backend-disconnected')); }
      pending.clear();
    });
    await once(ws, 'open'); stage = 'initialize';
    await rpc('initialize', { clientInfo: { name: 'jet-router-live-probe', version: '0.1.0' } });
    ws.send(JSON.stringify({ method: 'initialized' }));
    stage = 'thread-start';
    const { thread } = await rpc('thread/start', { model: plan.model, cwd: dir, ephemeral: true,
      sandbox: 'read-only', approvalPolicy: 'never', baseInstructions: 'Follow the literal edit. Return code only. Never use tools.' });
    assert.equal(thread.model, plan.model); assert.equal(thread.reasoningEffort, plan.baseline);
    const prompt = '아래 함수의 문자열 Helllo만 Hello로 고쳐줘. 다른 것은 변경하지 말고 코드만 출력해줘. 파일과 도구는 사용하지 마.\nfunction greeting(name) { return `Helllo, ${name}!`; }';
    for (let index = 0; index < 2; index++) {
      stage = `turn-${index + 1}`;
      if (index === 1) config.mode = 'off';
      const began = Date.now();
      const { turn } = await rpc('turn/start', { threadId: thread.id, input: [{ type: 'text', text: prompt }] });
      const complete = () => events.find(e => e.method === 'turn/completed' && e.params.turn.id === turn.id);
      while (!complete()) {
        await Promise.race([once(ws, 'message'), new Promise((_, reject) => {
          const timer = setTimeout(() => reject(Error('turn-timeout')), 60000 - (Date.now() - began));
          timer.unref(); ws.once('message', () => clearTimeout(timer));
        })]);
      }
      const done = complete().params.turn;
      const usage = events.filter(e => e.method === 'thread/tokenUsage/updated' && e.params.turnId === turn.id).at(-1)?.params.tokenUsage.last;
      const items = events.filter(e => e.method === 'item/completed' && e.params.turnId === turn.id).map(e => e.params.item);
      const after = (await rpc('thread/read', { threadId: thread.id, includeTurns: false })).thread;
      report.turns.push({ mode: config.mode, status: done.status, baselineAfter: after.reasoningEffort,
        latencyMs: Date.now() - began, usage: usage ?? null,
        ...inspectItems(items) }); save();
      assert.equal(done.status, 'completed'); assert.ok(usage); assert.equal(after.reasoningEffort, 'medium');
      assert.equal(report.turns[index].outputMatches, true); assert.equal(report.turns[index].usedTools, false);
      if (index === 0) { assert.equal(report.jev.decision.choice, 'low'); assert.equal(report.submitted[0].effort, 'low'); }
      else assert.equal(report.submitted[1].explicitOverride, false);
    }
    assert.equal(report.submitted.length, 2);
    report.complete = true;
  } catch { report.failureStage = stage; process.exitCode = 1; }
  finally {
    for (const { timer, reject } of pending.values()) { clearTimeout(timer); reject(Error('closed')); }
    ws?.close(); await proxy?.close(); rmSync(dir, { recursive: true, force: true }); save();
    console.log(JSON.stringify(report));
  }
}
