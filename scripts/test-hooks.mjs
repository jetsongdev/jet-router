import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Test a disposable plugin with synthetic config; never read/write user options.
const root = mkdtempSync(join(tmpdir(), 'jet-router-hooks-'));
try {
  for (const mode of ['fake', 'jev']) {
    const dir = join(root, mode);
    for (const path of ['.claude-plugin', 'hooks', 'src', 'scripts/jev-request.mjs', 'tests/runtime.test.ts']) {
      cpSync(path, join(dir, path), { recursive: true });
    }
    const manifestPath = join(dir, '.claude-plugin/plugin.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.userConfig.provider.default = mode;
    manifest.userConfig.cloudConsent.default = mode === 'jev';
    manifest.userConfig.jevApiKey.default = 'SYNTHETIC_KEY_CANARY';
    manifest.userConfig.holdoutRate.default = '0'; // Random control turns would make the runtime test flaky.
    writeFileSync(manifestPath, JSON.stringify(manifest));
    console.log(`Offline Claude hook test: ${mode}`);
    const result = spawnSync('claude', ['plugin', 'test', dir], { stdio: 'inherit' });
    if (result.status !== 0) { process.exitCode = 1; break; }
  }
} finally { rmSync(root, { recursive: true, force: true }); }
