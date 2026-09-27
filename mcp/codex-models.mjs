import { spawn } from 'node:child_process';

const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);

// A complete, bounded startup snapshot; no task threads, turns or prompts.
// Unknown/unavailable catalogs remain null rather than guessed capabilities.
export function parseModelPage(value) {
  if (!value || !Array.isArray(value.data) || value.data.length > 100 ||
      (value.nextCursor != null && (typeof value.nextCursor !== 'string' || value.nextCursor.length > 1024))) throw new Error('invalid catalog');
  return { entries: value.data.map(item => {
    const efforts = item?.supportedReasoningEfforts?.map(entry => entry.reasoningEffort);
    if (!identifier(item?.model) || !Array.isArray(efforts) || efforts.length < 1 || efforts.length > 32 ||
        efforts.some(value => !identifier(value)) || new Set(efforts).size !== efforts.length) throw new Error('invalid model');
    return [item.model, efforts];
  }), cursor: value.nextCursor ?? null };
}

export function discoverCodexModels({ launch = spawn, timeout = 4000 } = {}) {
  return new Promise(resolve => {
    let child, timer, finished = false, buffer = '', bytes = 0, pages = 0, id = 1;
    const catalog = new Map(), cursors = new Set();
    const finish = value => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child?.kill('SIGKILL');
      resolve(value);
    };
    try {
      child = launch('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] });
      timer = setTimeout(() => finish(null), timeout);
      child.on('error', () => finish(null));
      child.on('exit', () => finish(null));
      child.stdin.on('error', () => finish(null));
      const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
      child.stdout.on('data', data => {
        bytes += data.length;
        if (bytes > 1024 * 1024) return finish(null);
        buffer += data.toString('utf8');
        let boundary;
        while (!finished && (boundary = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
          try {
            const response = JSON.parse(line);
            if (response.id !== id) continue;
            if (response.error || !response.result) return finish(null);
            if (id === 1) {
              send({ jsonrpc: '2.0', method: 'initialized', params: {} });
              send({ jsonrpc: '2.0', id: ++id, method: 'model/list', params: { limit: 100 } });
            } else {
              const page = parseModelPage(response.result);
              for (const [model, efforts] of page.entries) {
                if (catalog.has(model)) return finish(null);
                catalog.set(model, efforts);
              }
              if (!page.cursor) return finish(catalog);
              if (++pages >= 10 || cursors.has(page.cursor)) return finish(null);
              cursors.add(page.cursor);
              send({ jsonrpc: '2.0', id: ++id, method: 'model/list', params: { limit: 100, cursor: page.cursor } });
            }
          } catch { finish(null); }
        }
      });
      send({ jsonrpc: '2.0', id, method: 'initialize', params: { clientInfo: { name: 'jet-router', version: '0.1.0' } } });
    } catch { finish(null); }
  });
}
