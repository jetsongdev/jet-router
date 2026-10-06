// Integration fixture only. Never exposed through runtime environment options.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startProxy } from '../proxy.mjs';
const root = process.argv[2];
const completed = [];
const trace = [];
const proxy = await startProxy({
  config: { mode: 'enforce', consent: true, apiKey: 'fixture-only' },
  classify: async input => ({ decision: { provider: 'jev',
    choice: input.prompt.includes('PROBE_LOW') ? 'low' : 'keep', confidence: .9, contextScore: 1, riskScore: 0 } }),
  launch: () => {
    const child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const sent = new Map();
    const originalWrite = child.stdin.write.bind(child.stdin);
    child.stdin.write = (chunk, ...args) => {
      const message = JSON.parse(chunk);
      if (message.method && message.id !== undefined) {
        const entry = { method: message.method, sentAt: Date.now() };
        sent.set(message.id, entry); trace.push(entry);
        writeFileSync(join(root, 'adapter-rpc.json'), JSON.stringify(trace));
      }
      return originalWrite(chunk, ...args);
    };
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const message = JSON.parse(line);
        const entry = sent.get(message.id);
        if (!message.method && entry) {
          entry.latencyMs = Date.now() - entry.sentAt;
          entry.errorCode = message.error?.code ?? null;
          writeFileSync(join(root, 'adapter-rpc.json'), JSON.stringify(trace));
        }
        if (message.method === 'turn/completed') {
          completed.push(message.params.turn.status);
          writeFileSync(join(root, 'adapter-events.json'), JSON.stringify(completed));
        }
      } catch {}
    });
    child.on('exit', () => writeFileSync(join(root, 'adapter-backend-exited'), 'done'));
    return child;
  },
});
writeFileSync(join(root, 'adapter-socket.txt'), proxy.socketPath);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await proxy.close(); process.exit(0); });
