import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gradeWorkspace } from '../agent/grade-agent.mjs';

const base = join(dirname(fileURLToPath(import.meta.url)), '../agent');
const slugs = ['convention-export-feature', 'convention-new-provider',
  'wide-currency-migration', 'wide-logger-api'];

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return groups.flat();
}

for (const slug of slugs) {
  test(slug, { timeout: 600000 }, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'hard-b-'));
    const task = join(base, slug);
    const workspace = join(temp, 'workspace');
    async function fresh(overlay) {
      await rm(workspace, { recursive: true, force: true });
      await cp(join(task, 'fixture'), workspace, { recursive: true });
      if (overlay) await cp(join(task, overlay), workspace, { recursive: true, force: true });
    }
    try {
      await fresh();
      let grade = await gradeWorkspace(slug, workspace);
      assert.ok(grade.passedChecks < grade.totalChecks, 'fixture must fail');
      await fresh('solution');
      grade = await gradeWorkspace(slug, workspace);
      assert.equal(grade.publicTestsUnmodified, true);
      assert.equal(grade.passed, true, JSON.stringify(grade.results.filter(result => !result.ok)));
      const publicRun = spawnSync(process.execPath, ['--test', 'test/public.test.mjs'], {
        cwd: workspace, encoding: 'utf8', timeout: 30000,
      });
      assert.equal(publicRun.status, 0, publicRun.stdout + publicRun.stderr);
      const variants = await readdir(join(task, 'mutants'));
      assert.ok(variants.length >= 3);
      for (const variant of variants) {
        await fresh('mutants/' + variant);
        grade = await gradeWorkspace(slug, workspace);
        assert.ok(grade.passedChecks < grade.totalChecks, `${variant} survived`);
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
}

test('task structure and local-only prompt constraints', async () => {
  for (const slug of slugs) {
    const task = join(base, slug);
    const prompt = await readFile(join(task, 'prompt.txt'), 'utf8');
    const words = prompt.trim().split(/\s+/).length;
    assert.ok(words >= 150 && words <= 400, `${slug}: ${words} words`);
    assert.doesNotMatch(prompt, /^\s*(?:\d+[.)]|[-*])\s/m);
    assert.doesNotMatch(prompt, /\b(?:Exception|Note):/);
    const files = await filesUnder(join(task, 'fixture'));
    if (slug === 'convention-export-feature') assert.ok(files.length >= 20 && files.length <= 30);
    if (slug === 'wide-currency-migration') assert.ok(files.length >= 45 && files.length <= 60);
    if (slug === 'wide-logger-api') assert.ok(files.length >= 50);
    const sources = (await filesUnder(join(task, 'fixture/src'))).filter(path => path.endsWith('.mjs'));
    const texts = await Promise.all(sources.map(path => readFile(path, 'utf8')));
    const lines = texts.reduce((sum, text) => sum + text.split('\n').length - 1, 0);
    assert.ok(lines >= 600 && lines <= 2500, `${slug}: ${lines} source lines`);
    const meta = JSON.parse(await readFile(join(task, 'meta.json'), 'utf8'));
    assert.deepEqual(meta, { maxTurns: 36, hiddenTimeoutMs: 180000,
      budgetUsd: { low: 1.5, medium: 1.5, high: 2, xhigh: 3 } });
    const { checks } = await import(`../agent/${slug}/hidden/checks.mjs`);
    assert.ok(checks.length >= 15);
    const publicTest = await readFile(join(task, 'fixture/test/public.test.mjs'), 'utf8');
    const publicCount = (publicTest.match(/^test\(/gm) ?? []).length;
    assert.ok(publicCount >= 2 && publicCount <= 4);
  }
});
