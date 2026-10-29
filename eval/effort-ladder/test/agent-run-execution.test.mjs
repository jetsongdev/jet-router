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
 const {dir, task} = await setup(); const iso = await createIsolation({fixture: join(task, 'fixture'), hiddenPaths: [join(dir, 'agent')], effort: 'low', maxTurns: 4, maxBudgetUsd: 1, apiKey: 'test-key'});
 try { const o = iso.options; assert.equal(o.env.ANTHROPIC_API_KEY, 'test-key'); assert.deepEqual(o.settingSources, []); assert.deepEqual(o.plugins, []); assert.equal(o.strictMcpConfig, true); assert.equal(o.permissionMode, 'dontAsk'); assert.equal(o.sandbox.failIfUnavailable, true); assert.deepEqual(o.sandbox.network.allowedDomains, []); assert.deepEqual(Object.keys(o.env).filter(k => k !== 'ANTHROPIC_API_KEY').sort(), ['CLAUDE_CONFIG_DIR','HOME','PATH','TMPDIR']); assert.ok(!JSON.stringify(o, (k,v) => k === 'ANTHROPIC_API_KEY' ? undefined : v).includes(join(process.env.HOME, '.claude'))); await assert.rejects(assertHiddenOutside({cwd: iso.cwd, hiddenPaths: [iso.cwd], options:o})); } finally { await iso.cleanup(); await rm(dir, {recursive:true,force:true}); }
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
test('pilot forced forks save safe init and count tool errors', async () => {
 const {dir} = await setup(); const calls=[];
 async function* query({options}) {
  calls.push(options); await writeFile(join(options.cwd,'x'),'fixed');
  yield {type:'system',subtype:'init',session_id:'s',model:'mock',apiKey:'CANARY',env:{secret:'CANARY'},apiKeySource:'ANTHROPIC_API_KEY',mcp_servers:[{name:'m',status:'ok',apiKey:'CANARY'}],plugins:[{name:'p',path:'/p',apiKey:'CANARY'}]};
  await options.hooks.PreToolUse[0].hooks[0]({effort:{level:options.effort}});
  yield {type:'assistant',message:{content:[{type:'tool_use',name:'Bash',id:'b'},{type:'tool_use',name:'Read',id:'r'}]}};
  yield {type:'user',message:{content:[{type:'tool_result',tool_use_id:'b',is_error:true},{type:'tool_result',tool_use_id:'r',is_error:true}]}};
  yield {type:'result',subtype:'success',session_id:'s',total_cost_usd:options.forkSession?0.2:0.1,usage:{},modelUsage:{}};
 }
 try {
  const rows=await runAgent({wave:'pilot',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,twoTurn:true,forkAlways:true,segment:'pilot',query,grade,baseDir:dir});
  assert.equal(rows.length,3); assert.deepEqual(rows.map(r=>r.effortEvidence),['low','low','medium']);
  assert.ok(rows.every(r=>r.bashCalls===1&&r.bashErrors===1&&r.toolErrors===2)); assert.ok(rows.slice(1).every(r=>r.forced===true));
  const init=await readFile(join(dir,'runs','pilot','init',`${rows[0].runId}.json`),'utf8'); assert.ok(!init.includes('CANARY')); assert.equal(JSON.parse(init).apiKeySource,'ANTHROPIC_API_KEY');
  const ledger=openLedger(join(dir,'runs','ledger.jsonl')); assert.ok(Math.abs(ledger.totals().segments.pilot.spent-0.3)<1e-9); assert.equal(ledger.totals().segments.turn2.spent,0); ledger.close();
  await assert.rejects(runAgent({wave:'bad',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,forkAlways:true,segment:'pilot',query,grade,baseDir:dir}),/invalid arguments/);
  await assert.rejects(runAgent({wave:'bad',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,forkAlways:true,twoTurn:true,query,grade,baseDir:dir}),/invalid arguments/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
