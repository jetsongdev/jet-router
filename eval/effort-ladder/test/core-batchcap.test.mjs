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
  const opts={wave:'next',outDir:dir,paid:true,assume:file}, deps={client,env:{LADDER_ALLOW_PAID:'1'}};
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
  const opts={wave:'w',outDir:dir,paid:true}, deps={client,env:{LADDER_ALLOW_PAID:'1'}};
  await execute('submit',opts,deps); const result=await execute('collect',opts,deps);
  assert.equal(result.costUsd,40); assert.equal(result.overrun,true); assert.equal(lines(join(dir,'w/results.jsonl'))[0].overrun,true);
  const ledger=openLedger(join(dir,'ledger.jsonl')); assert.equal(ledger.totals().segments.batch.spent,40);ledger.close();
  build({wave:'later',tasks:'tq/ranges',efforts:'low',outDir:dir});
  await assert.rejects(execute('submit',{...opts,wave:'later'},deps),/cap exceeded/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
