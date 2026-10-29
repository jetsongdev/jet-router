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
 try { const rows=await runAgent({wave:'w1',tasks:['ag/site-route-repair'],efforts:['max'],reps:1,twoTurn:true,query,grade,ledger,baseDir:dir}); assert.equal(count,2); assert.deepEqual(rows.map(r=>r.arm),[null,'S']); assert.ok(rows.every(r=>r.costUsd===3 && r.costSource==='assumed-max' && !r.passed)); } finally {ledger.close(); await rm(dir,{recursive:true,force:true});}
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

test('result followed by exception continues; missing-result failures stop safely', async () => {
 const {dir} = await setup();
 try {
  let calls=0;
  async function* afterResult() { calls++; yield {type:'result',subtype:'error_max_budget_usd',is_error:true,total_cost_usd:0.1}; throw Error('private result exception'); }
  const rows=await runAgent({wave:'result',tasks:['ag/site-route-repair'],efforts:['low'],reps:2,query:afterResult,grade,baseDir:dir});
  assert.equal(calls,2); assert.ok(rows.every(r=>r.endReason==='error_max_budget_usd' && !('errorClass' in r)));
  calls=0;
  async function* auth() { calls++; throw Object.assign(Error('private credential'),{status:401}); }
  await assert.rejects(runAgent({wave:'auth',tasks:['ag/site-route-repair'],efforts:['low'],reps:2,query:auth,grade,baseDir:dir}), e=>e.exitCode===5);
  const authRows=(await readFile(join(dir,'runs','auth','agent.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls,1); assert.equal(authRows[0].errorClass,'auth'); assert.equal(authRows[0].endReason,'error_during_execution'); assert.ok(!JSON.stringify(authRows).includes('private'));
  calls=0;
  async function* crash() { calls++; throw Error('crash secret'); }
  await assert.rejects(runAgent({wave:'crash',tasks:['ag/site-route-repair'],efforts:['low'],reps:4,query:crash,grade,baseDir:dir}), /consecutive-errors/);
  assert.equal(calls,3); const crashRows=(await readFile(join(dir,'runs','crash','agent.jsonl'),'utf8')).trim().split('\n').map(JSON.parse); assert.ok(crashRows.every(r=>r.errorClass==='other'));
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('effort budgets apply to reservations and both turns', async () => {
 const {dir}=await setup(); const reservations=[], calls=[];
 const ledger={reserve:async (segment,usd)=>{reservations.push(usd); return reservations.length;},settle:async()=>{}};
 async function* query({options}) {calls.push([options.effort,options.maxBudgetUsd]); yield {type:'result',subtype:'error_max_turns',session_id:'s',total_cost_usd:0};}
 try {
  await runAgent({wave:'budget',tasks:['ag/site-route-repair'],efforts:['high','xhigh','max'],reps:1,twoTurn:true,query,grade,ledger,baseDir:dir});
  assert.deepEqual(calls.map(([effort,budget])=>budget),reservations);
  assert.ok(calls.every(([effort,budget])=>budget===({high:1,xhigh:1.5,max:3}[effort])));
  assert.ok(calls.some(([effort])=>effort==='max')); assert.equal(calls.length,8);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('per-request cache usage and Bash nonzero hints are bounded and deduplicated', async () => {
 const {dir}=await setup();
 async function* query() {
  yield {type:'assistant',parent_tool_use_id:null,message:{id:'a',usage:{input_tokens:2,cache_read_input_tokens:3,cache_creation_input_tokens:4,output_tokens:999,cache_creation:{ephemeral_5m_input_tokens:4,ephemeral_1h_input_tokens:0}},content:[{type:'tool_use',name:'Bash',id:'b1'},{type:'tool_use',name:'Bash',id:'b2'}]}};
  yield {type:'assistant',message:{id:'a',usage:{input_tokens:99},content:[]}};
  yield {type:'assistant',parent_tool_use_id:'nested',message:{id:'nested',usage:{input_tokens:100},content:[]}};
  yield {type:'assistant',message:{id:'c',usage:{input_tokens:5,cache_read_input_tokens:6,cache_creation_input_tokens:7},content:[]}};
  yield {type:'user',message:{content:[{type:'tool_result',tool_use_id:'b1',is_error:false,content:'secret exit code 12'}, {type:'tool_result',tool_use_id:'b2',is_error:true,content:[{type:'text',text:'secret Exit code 1'}]}]}};
  yield {type:'result',subtype:'success',total_cost_usd:0.1};
 }
 try {const [row]=await runAgent({wave:'usage',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,query,grade,baseDir:dir});
  assert.deepEqual(row.steps,[{id:'a',input_tokens:2,cache_read_input_tokens:3,cache_creation_input_tokens:4,cache_creation:{ephemeral_5m_input_tokens:4,ephemeral_1h_input_tokens:0}},{id:'c',input_tokens:5,cache_read_input_tokens:6,cache_creation_input_tokens:7}]);
  assert.equal(row.cacheReadTotal,9); assert.equal(row.cacheCreationTotal,11); assert.equal(row.firstStepCacheCreation,4); assert.equal(row.bashNonzeroHints,2); assert.equal(row.bashNonzeroFlagged,1); assert.ok(!JSON.stringify(row).includes('secret')); assert.ok(!JSON.stringify(row.steps).includes('output_tokens'));
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('error classes and consecutive failure reset', async () => {
 const {dir}=await setup(); const ledger={reserve:async()=>1,settle:async()=>{}};
 try {
  for (const [label,error,expected,exitCode] of [
   ['billing',Object.assign(Error('secret'),{status:402}),'billing',5],
   ['rate',Object.assign(Error('secret'),{status:429}),'rate_limit',null],
   ['network',Object.assign(Error('secret'),{code:'ECONNRESET'}),'network',null]
  ]) {
   async function* query() {throw error;}
   const args={wave:label,tasks:['ag/site-route-repair'],efforts:['low'],reps:1,query,grade,ledger,baseDir:dir};
   if (exitCode) await assert.rejects(runAgent(args),e=>e.exitCode===exitCode); else await runAgent(args);
   const row=JSON.parse(await readFile(join(dir,'runs',label,'agent.jsonl'),'utf8')); assert.equal(row.errorClass,expected); assert.ok(!JSON.stringify(row).includes('secret'));
  }
  let calls=0;
  async function* mixed() {calls++; if (calls!==3) throw Error('crash'); yield {type:'result',subtype:'success',total_cost_usd:0.1};}
  const rows=await runAgent({wave:'reset',tasks:['ag/site-route-repair'],efforts:['low'],reps:5,query:mixed,grade,ledger,baseDir:dir}); assert.equal(calls,5); assert.deepEqual(rows.map(r=>r.endReason),['error_during_execution','error_during_execution','success','error_during_execution','error_during_execution']);
 } finally {await rm(dir,{recursive:true,force:true});}
});
