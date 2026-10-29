import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build,execute} from '../scripts/batch.mjs';
import {openLedger} from '../lib/ledger.mjs';

const lines=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
test('estimate cap, reservation, assumptions and p95',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'batchcap-'));
 try {
  const file=join(dir,'assume.json'); writeFileSync(file,JSON.stringify({low:1000000}));
  const built=build({wave:'next',tasks:'tq/ranges',efforts:'low',outDir:dir,assume:file});
  assert.ok(built.realisticUsd>built.worstUsd);
  let calls=0; const client={messages:{batches:{create:async()=>{calls++;return {id:'mock'};}}}};
  const opts={wave:'next',outDir:dir,ledger:join(dir,'ledger.jsonl'),paid:true,assume:file}, deps={client,env:{LADDER_ALLOW_PAID:'1'}};
  await assert.rejects(execute('submit',{...opts,cap:8},deps),e=>e.exitCode===4&&e.message==='wave estimate exceeds cap');
  assert.equal(calls,0);
  mkdirSync(join(dir,'previous')); writeFileSync(join(dir,'previous/results.jsonl'),Array.from({length:20},(_,i)=>JSON.stringify({effort:'low',usage:{output_tokens:(i+1)*10000}})).join('\n')+'\n');
  const p95=build({wave:'preview',tasks:'tq/ranges',efforts:'low',outDir:dir,assumeFrom:'previous'});
  const request=lines(p95.path)[0]; const input=Math.ceil(Buffer.byteLength(request.params.messages[0].content)/4);
  assert.equal(p95.realisticUsd,(input*4+190000*20)/1e6*0.5);
  const submitted=await execute('submit',{...opts,assumeFrom:'previous'},deps);
  assert.equal(submitted.realisticUsd,p95.realisticUsd);
  assert.ok(submitted.reservationUsd>0.5); assert.equal(submitted.reservationUsd,p95.realisticUsd*1.25);
  const ledger=openLedger(join(dir,'ledger.jsonl')); assert.equal(ledger.totals().segments.batch.reserved,submitted.reservationUsd);ledger.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('actual overrun is recorded even above the ledger cap',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'batchcap-'));
 try {
  const built=build({wave:'w',tasks:'tq/ranges',efforts:'low',outDir:dir}); const request=lines(built.path)[0];
  const client={messages:{batches:{create:async()=>({id:'mock'}),results:async()=>[{custom_id:request.custom_id,result:{type:'succeeded',message:{stop_reason:'max_tokens',usage:{input_tokens:0,output_tokens:4000000},content:[]}}}]}}};
  const opts={wave:'w',outDir:dir,ledger:join(dir,'ledger.jsonl'),paid:true}, deps={client,env:{LADDER_ALLOW_PAID:'1'}};
  await execute('submit',opts,deps); const result=await execute('collect',opts,deps);
  assert.equal(result.costUsd,40); assert.equal(result.overrun,true); assert.equal(lines(join(dir,'w/results.jsonl'))[0].overrun,true);
  const ledger=openLedger(join(dir,'ledger.jsonl')); assert.equal(ledger.totals().segments.batch.spent,40);ledger.close();
  build({wave:'later',tasks:'tq/ranges',efforts:'low',outDir:dir});
  await assert.rejects(execute('submit',{...opts,wave:'later'},deps),/cap exceeded/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('batch and agent share ledger, pilot cap and total cap',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shared-ledger-')); const ledgerPath=join(dir,'ledger.jsonl');
 try {
  const {runAgent}=await import('../scripts/run-agent.mjs');
  const task=join(dir,'agent','site-route-repair'); mkdirSync(join(task,'fixture'),{recursive:true}); writeFileSync(join(task,'fixture','x'),'x'); writeFileSync(join(task,'prompt.txt'),'prompt'); writeFileSync(join(task,'meta.json'),'{"maxTurns":1}');
  const client={messages:{batches:{create:async()=>({id:'mock'})}}}, deps={client,env:{LADDER_ALLOW_PAID:'1'}};
  build({wave:'p',tasks:'tq/ranges',efforts:'low',outDir:dir});
  await execute('submit',{wave:'p',outDir:dir,ledger:ledgerPath,segment:'pilot',paid:true},deps);
  async function* query(){yield {type:'result',subtype:'success',session_id:'s',total_cost_usd:0.2};}
  const grade=async()=>({passed:true,passedChecks:1,totalChecks:1,publicTestsUnmodified:true});
  await runAgent({wave:'a',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,segment:'pilot',query,grade,baseDir:dir,ledgerPath});
  let ledger=openLedger(ledgerPath); assert.equal(ledger.totals().segments.pilot.reserved,0.5); assert.equal(ledger.totals().segments.pilot.spent,0.2); assert.throws(()=>ledger.reserve('pilot',4.31),/cap exceeded/);
  for(const [segment,usd] of [['batch',37],['agent',85],['boost',13]]) {const id=ledger.reserve(segment,usd);ledger.settle(id,{runId:segment,usd,source:'assumed-max'});}
  const id=ledger.reserve('pilot',4.0);ledger.settle(id,{runId:'fill',usd:4.0,source:'assumed-max'});ledger.close();
  ledger=openLedger(ledgerPath,{agent:100}); assert.ok(Math.abs(ledger.totals().total.remaining-0.3)<1e-9); assert.ok(ledger.totals().segments.agent.remaining>1); assert.throws(()=>ledger.reserve('agent',0.31),/cap exceeded/); ledger.close();
  await assert.rejects(runAgent({wave:'blocked',tasks:['ag/site-route-repair'],efforts:['low'],reps:1,segment:'agent',query,grade,baseDir:dir,ledgerPath}),/cap exceeded/);
  build({wave:'blocked-batch',tasks:'tq/ranges',efforts:'low',outDir:dir});
  await assert.rejects(execute('submit',{wave:'blocked-batch',outDir:dir,ledger:ledgerPath,segment:'pilot',paid:true},deps),/cap exceeded/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
