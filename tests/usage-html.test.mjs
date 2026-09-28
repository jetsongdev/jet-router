import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderHtml, aggregatorSource } from '../src/usage-html.js';
import { usageRecord, report } from '../src/usage.js';
import { recordLine } from '../scripts/usage.mjs';

const make = (ts, project, extra, output) => ({ ts, ...usageRecord({ project, model: 'claude-opus-5-5', outcome: 'answer', durationMs: 1,
  record: { mode: 'enforce', provider: 'jev', original: 'medium', recommendation: 'low', reasonCode: 'unevaluated', latencyMs: 1, forwarded: 'medium', ...extra },
  usage: { input_tokens: 1, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) });
const records = [];
for (let i = 0; i < 12; i++) {
  records.push(make(`2026-10-0${1 + (i % 5)}T02:00:00Z`, i % 2 ? '/home/me/a' : '/home/me/b', { applied: 'low' }, 400 + i));
  records.push(make(`2026-10-0${1 + (i % 5)}T03:00:00Z`, i % 3 ? '/home/me/a' : '/home/me/b', { holdout: true }, 700 + i));
}
const evil = '/home/me/</script><img src=x onerror=alert(1)> ';
records.push(make('2026-10-02T04:00:00Z', evil, { applied: 'low' }, 10));

test('embedded data cannot close its script element and parses back intact', () => {
  const html = renderHtml(records, { home: '/home/me', generatedAt: new Date('2026-10-06T00:00:00Z') });
  assert.ok(!html.includes('</script><img'));
  const json = html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1];
  const data = JSON.parse(json);
  assert.equal(data.records.length, records.length);
  assert.equal(data.records.at(-1).project, '~/</script><img src=x onerror=alert(1)> ');
  assert.equal(data.records[0].project, '~/b');
});

test('the inlined aggregator matches the CLI, including ratios kept across filters', () => {
  const context = {};
  vm.runInNewContext(`${aggregatorSource()}\nglobalThis.out = { all: report(records, { by: ['project'] }), one: report(records.filter(r => r.project === '/home/me/a'), { by: ['day'], factorRecords: records }) };`,
    Object.assign(context, { records, globalThis: context }));
  assert.deepEqual(JSON.parse(JSON.stringify(context.out.all)), JSON.parse(JSON.stringify(report(records, { by: ['project'] }))));
  const filtered = report(records.filter(r => r.project === '/home/me/a'), { by: ['day'], factorRecords: records });
  assert.deepEqual(JSON.parse(JSON.stringify(context.out.one)), JSON.parse(JSON.stringify(filtered)));
  // One project alone lacks samples; the period-wide ratio still applies.
  assert.equal(report(records.filter(r => r.project === '/home/me/a'), { by: ['all'] }).total.measuredTurns, 0);
  assert.ok(filtered.total.measuredTurns > 0);
});

test('the page is self-contained, light by default and inserts data as text only', () => {
  const html = renderHtml(records);
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(/.test(html));
  assert.deepEqual([...html.matchAll(/https?:\/\/[^\s'"<>)]+/g)].map(m => m[0]).filter(u => u !== 'http://www.w3.org/2000/svg'), []);
  assert.ok(!html.includes('prefers-color-scheme'));
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(html));
});

test('report --html writes the dashboard file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jet-router-html-'));
  try {
    recordLine(JSON.stringify(records[0]), join(dir, 'usage'), new Date('2026-10-01T02:00:00Z'));
    const out = join(dir, 'out.html');
    const run = spawnSync(process.execPath, ['scripts/usage.mjs', 'report', '--html', out, '--from', '2026-10-01'],
      { env: { ...process.env, JET_ROUTER_USAGE_DIR: join(dir, 'usage') }, encoding: 'utf8' });
    assert.equal(run.status, 0); assert.match(run.stdout, /HTML 리포트/);
    assert.match(readFileSync(out, 'utf8'), /jet-router 사용량/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('report --html expands ~/ and creates the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jet-router-home-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/usage.mjs', 'report', '--html', '~/.claude/jet-router/usage-report.html'],
      { env: { ...process.env, HOME: dir, JET_ROUTER_USAGE_DIR: join(dir, 'none') }, encoding: 'utf8' });
    assert.equal(run.status, 0);
    assert.match(readFileSync(join(dir, '.claude/jet-router/usage-report.html'), 'utf8'), /jet-router 사용량/);
    assert.match(run.stdout, /열기: open ~\/.claude\/jet-router\/usage-report\.html/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
