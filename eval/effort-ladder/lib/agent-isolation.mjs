import { mkdtemp, mkdir, cp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';

const tools = ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'];
const within = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..' + '/') && rel !== '..' && !isAbsolute(rel)); };

// Sandbox denyRead protects Bash; permission deny rules protect in-process Read/Glob/Grep.
export async function assertHiddenOutside({ cwd, hiddenPaths, options }) {
  const work = await realpath(cwd);
  const denied = options.sandbox?.filesystem?.denyRead ?? [];
  for (const path of hiddenPaths) {
    const target = await realpath(path);
    if (within(work, target) || !denied.some(d => within(resolve(d), target))) throw new Error('hidden path is not isolated');
    if (!options.settings?.permissions?.deny?.some(d => d === `Read(/${target}/**)`)) throw new Error('hidden path lacks tool read denial');
  }
}

export async function createIsolation({ fixture, hiddenPaths, effort, maxTurns, maxBudgetUsd }) {
  const root = await mkdtemp(join(tmpdir(), 'effort-agent-'));
  try {
    const cwd = join(root, 'workspace'), home = join(root, 'home'), config = join(root, 'config'), temp = join(root, 'tmp');
    await Promise.all([mkdir(home), mkdir(config), mkdir(temp)]);
    await cp(fixture, cwd, { recursive: true, dereference: false });
    const hidden = await Promise.all(hiddenPaths.map(p => realpath(p)));
    const env = { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, TMPDIR: temp };
    if (Boolean(process.env.ANTHROPIC_API_KEY)) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const options = {
      model: 'claude-opus-5-5', effort, maxTurns, maxBudgetUsd, cwd, env,
      settingSources: [], plugins: [], strictMcpConfig: true,
      tools, allowedTools: tools, disallowedTools: ['WebFetch', 'WebSearch', 'Task', 'Agent'],
      permissionMode: 'dontAsk',
      settings: { permissions: { deny: hidden.map(p => `Read(/${p}/**)`) } },
      sandbox: { enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false,
        network: { allowedDomains: [], strictAllowlist: true, allowUnixSockets: [], allowAllUnixSockets: false, allowLocalBinding: false },
        filesystem: { denyRead: hidden } }
    };
    await assertHiddenOutside({ cwd, hiddenPaths: hidden, options });
    return { root, cwd, options, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
