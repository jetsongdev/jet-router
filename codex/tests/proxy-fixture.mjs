// Integration fixture only. Never exposed through runtime environment options.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startProxy } from '../proxy.mjs';
const root = process.argv[2];
const completed = [];
const proxy = await startProxy({
  config: { mode: 'enforce', consent: true, apiKey: 'fixture-only' },
  classify: async input => ({ decision: { provider: 'jev',
    choice: input.prompt.includes('PROBE_LOW') ? 'low' : 'keep', confidence: .9, contextScore: 1, riskScore: 0 } }),
  launch: () => {
    const child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.error) writeFileSync(join(root, 'adapter-error.json'), JSON.stringify(message.error));
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
