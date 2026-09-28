import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createCoordinator } from './coordinator.mjs';
import { createRouter } from './router.mjs';
import { parseModelPage } from '../mcp/codex-models.mjs';

// Deliberately one client and a private backend: never attach an existing daemon
// or let another client race restoration. The socket is private and local only.
export async function startProxy({ config, classify, launch = () => spawn('codex', ['app-server', '--stdio'],
  { stdio: ['pipe', 'pipe', 'pipe'] }), notice = text => process.stderr.write(`[jet-router] ${text}\n`) }) {
  const dir = await mkdtemp(join(tmpdir(), 'jet-router-codex-'));
  const socketPath = join(dir, 'proxy.sock');
  const server = createServer();
  const wss = new WebSocketServer({ server, maxPayload: 4 * 1024 * 1024 });
  const blocked = new Set();
  let occupied = false, cleanup = async () => {};
  wss.on('connection', socket => {
    if (occupied) { socket.close(1008, 'one client per proxy'); return; }
    occupied = true;
    const child = launch(), pending = new Map(), catalog = new Map();
    let sequence = 0, ended = false;
    const send = value => { if (socket.readyState === 1) socket.send(JSON.stringify(value)); };
    const write = value => { if (!ended) child.stdin.write(`${JSON.stringify(value)}\n`); };
    const rpc = (method, params) => new Promise((resolve, reject) => {
      if (ended) return reject(new Error('backend unavailable'));
      const id = `jet-router-${++sequence}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('backend timeout')); }, 15000);
      pending.set(id, { resolve, reject, timer });
      write({ id, method, params });
    });
    const coordinator = createCoordinator({ rpc, reply: send, catalog, blocked, route: createRouter(config, classify), notice });
    const fail = () => {
      ended = true;
      for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('backend disconnected')); }
      pending.clear();
      socket.close(1011, 'backend disconnected; verify thread effort before resuming');
    };
    child.on('error', fail);
    child.on('exit', fail);
    child.stdin.on('error', fail);
    // Do not print backend output: it can include prompt content or credentials.
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const value = JSON.parse(line);
        const entry = value.method === undefined ? pending.get(value.id) : undefined;
        if (entry) {
          pending.delete(value.id); clearTimeout(entry.timer);
          if (value.error) entry.reject(Object.assign(new Error('backend rejected request'), { rpcError: value.error }));
          else entry.resolve(value.result);
        } else send(value);
      } catch { fail(); }
    });
    let initialized = false, ready = Promise.resolve();
    socket.on('message', bytes => {
      let message;
      try { message = JSON.parse(bytes.toString()); } catch { socket.close(1003, 'invalid JSON'); return; }
      if (!message || typeof message !== 'object') { socket.close(1003, 'invalid RPC'); return; }
      // Server tool/approval responses and notifications are never serialized
      // behind a turn that may be waiting for them.
      if (!message.method || message.id === undefined) { write(message); return; }
      if (message.method === 'initialize') {
        if (initialized) { send({ id: message.id, error: { code: -32600, message: 'already initialized' } }); return; }
        initialized = true;
        ready = (async () => {
          const params = structuredClone(message.params ?? {});
          params.capabilities = { ...params.capabilities, experimentalApi: true };
          send({ id: message.id, result: await rpc('initialize', params) });
          // Catalog failures leave no enforce candidates. No guessed capabilities.
          try {
            let cursor, pages = 0;
            const snapshot = new Map();
            do {
              const page = parseModelPage(await rpc('model/list', { limit: 100, ...(cursor ? { cursor } : {}) }));
              for (const [model, efforts] of page.entries) snapshot.set(model, efforts);
              cursor = page.cursor;
              if (++pages > 10) throw new Error('catalog too large');
            } while (cursor);
            for (const [model, efforts] of snapshot) catalog.set(model, efforts);
          } catch { notice('catalog unavailable: effort unchanged'); }
        })().catch(() => fail());
        return;
      }
      ready.then(() => coordinator.handle(message)).catch(fail);
    });
    let closing;
    cleanup = () => closing ??= (async () => {
      await coordinator.close();
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise(resolve => {
          const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
          child.kill('SIGTERM');
        });
      }
      occupied = false;
    })();
    socket.on('close', () => { void cleanup(); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  await chmod(socketPath, 0o600);
  return { socketPath, async close() {
    for (const socket of wss.clients) socket.close();
    await cleanup();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  } };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.env.JET_ROUTER_MODE ?? 'off';
  if (!['off', 'enforce'].includes(mode)) throw new Error('proxy supports off or enforce');
  const proxy = await startProxy({ config: { mode, consent: process.env.JET_ROUTER_CLOUD_CONSENT === 'true',
    apiKey: process.env.TYPESAFE_API_KEY } });
  process.stdout.write(`codex --remote unix://${proxy.socketPath}\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await proxy.close(); process.exit(0); });
}
