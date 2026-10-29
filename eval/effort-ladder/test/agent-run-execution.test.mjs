import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIsolation, assertHiddenOutside } from '../lib/agent-isolation.mjs';
import { openLedger } from '../lib/ledger.mjs';
import { runAgent, FOLLOWUP } from '../scripts/run-agent.mjs';

async function setup() { const dir = await mkdtemp(join(tmpdir(), 'agent-test-')); const task = join(dir, 'agent', 'site-route-repair'); await mkdir(join(task, 'fixture'), { recursive: true }); await writeFile(join(task, 'fixture', 'x'), 'initial'); await writeFile(join(task, 'prompt.txt'), 'prompt'); await writeFile(join(task, 'meta.json'), JSON.stringify({ maxTurns: 4 })); return { dir, task }; }
const grade = async (_slug, dir) => ({ passed: (await readFile(join(dir, 'x'), 'utf8')) === 'fixed', passedChecks: 0, totalChecks: 1, publicTestsUnmodified: true });
test('isolation options and hidden path boundaries', async () => {
 const {dir, task} = await setup(); const iso = await createIsolation({fixture: join(task, 'fixture'), hiddenPaths: [join(dir, 'agent')], effort: 'low', maxTurns: 4, maxBudgetUsd: 1});
 try { const o = iso.options; assert.deepEqual(o.settingSources, []); assert.deepEqual(o.plugins, []); assert.equal(o.strictMcpConfig, true); assert.equal(o.permissionMode, 'dontAsk'); assert.equal(o.sandbox.failIfUnavailable, true); assert.deepEqual(o.sandbox.network.allowedDomains, []); assert.deepEqual(Object.keys(o.env).filter(k => k !== 'ANTHROPIC_API_KEY').sort(), ['CLAUDE_CONFIG_DIR','HOME','PATH','TMPDIR']); assert.ok(!JSON.stringify(o, (k,v) => k === 'ANTHROPIC_API_KEY' ? undefined : v).includes(join(process.env.HOME, '.claude'))); await assert.rejects(assertHiddenOutside({cwd: iso.cwd, hiddenPaths: [iso.cwd], options:o})); } finally { await iso.cleanup(); await rm(dir, {recursive:true,force:true}); }
});
test('forks restore same parent workspace, charge incremental totals, and stop at cap', async () => {
 const {dir} = await setup(); const calls = []; const ledger = openLedger(join(dir, 'ledger'), {agent:1,turn2:2});
 async function* query({prompt, options}) { calls.push({prompt, options, before: await readFile(join(options.cwd, 'x'), 'utf8')}); await writeFile(join(options.cwd, 'x'), options.forkSession ? 'fixed' : 'parent'); yield {type:'system',subtype:'init',effort:options.effort,session_id:'session'}; yield {type:'result',subtype:'success',is_error:false,session_id:'session',total_cost_usd:options.forkSession ? 0.6 : 0.4,usage:{},modelUsage:{}}; }
 try { const rows = await runAgent({wave:'w1',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,twoTurn:true,query,grade,ledger,baseDir:dir}); assert.equal(rows.length,3); assert.deepEqual(calls.map(c=>c.before), ['initial','parent','parent']); assert.equal(calls[1].prompt,FOLLOWUP); assert.equal(calls[1].options.resume,'session'); assert.equal(calls[2].options.forkSession,true); assert.deepEqual(rows.map(r=>r.effort),['low','low','medium']); assert.equal(rows[1].parentRunId,rows[0].runId); assert.ok(Math.abs(ledger.totals().segments.turn2.spent - 0.4)<1e-9); await assert.rejects(runAgent({wave:'w2',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,query,grade,ledger,baseDir:dir}), /cap exceeded/); assert.equal(calls.length,3); } finally {ledger.close(); await rm(dir,{recursive:true,force:true});}
});
test('unpaid CLI and non-injected API block without calling SDK', async () => {
 const cli = spawnSync(process.execPath, ['scripts/run-agent.mjs', '--wave','w1'], {cwd: new URL('..', import.meta.url), encoding:'utf8', env:{PATH:process.env.PATH}}); assert.equal(cli.status,3); assert.match(cli.stderr,/paid call blocked/); await assert.rejects(runAgent({paid:false}), /paid call blocked/);
});
test('max effort omits U and zero cost is charged at the cap', async () => {
 const {dir} = await setup(); const ledger = openLedger(join(dir,'ledger')); let count=0;
 async function* query() {count++; yield {type:'result',subtype:'error_max_turns',is_error:true,session_id:'s',total_cost_usd:0,usage:{},modelUsage:{}};}
 try { const rows=await runAgent({wave:'w1',tasks:['ag/site-route-repair'],efforts:['max'],reps:1,twoTurn:true,query,grade,ledger,baseDir:dir}); assert.equal(count,2); assert.deepEqual(rows.map(r=>r.arm),[null,'S']); assert.ok(rows.every(r=>r.costUsd===1.5 && r.costSource==='assumed-max' && !r.passed)); } finally {ledger.close(); await rm(dir,{recursive:true,force:true});}
});
