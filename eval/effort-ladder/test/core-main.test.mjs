import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { taskId,runId,sha256 } from '../lib/ids.mjs';
import { costFromUsage } from '../lib/pricing.mjs';
import { openLedger, CapExceededError } from '../lib/ledger.mjs';
import { gradeSingle } from '../lib/grade-single.mjs';
import { prompt } from '../lib/single-prompt.mjs';
import { build,execute } from '../scripts/batch.mjs';
import { tasks } from '../../task-quality/tasks.mjs';
const temp=()=>mkdtempSync(join(tmpdir(),'ladder-test-'));
test('identifiers, prompt and cache pricing',()=>{
 assert.equal(taskId('ss','heading-index'),'ss/heading-index'); assert.equal(runId({wave:'w1',suite:'ss',slug:'heading-index',effort:'high',rep:3}),'w1-ss-heading-index-high-r03');
 assert.equal(runId({wave:'w1',suite:'tq',slug:'ranges',effort:'max',rep:1,turn:2,arm:'S'}),'w1-tq-ranges-max-r01-t2S'); assert.throws(()=>runId({wave:'w',suite:'tq',slug:'x'.repeat(60),effort:'low',rep:1}));
 assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.match(prompt('SPEC'),/separately\.\n\nSPEC$/);
 const u={input_tokens:1e6,output_tokens:1e6,cache_read_input_tokens:1e6,cache_creation_input_tokens:2e6,cache_creation:{ephemeral_5m_input_tokens:1e6,ephemeral_1h_input_tokens:1e6}};
 assert.equal(costFromUsage(u),37.2); assert.equal(costFromUsage(u,{batch:true}),18.6); assert.equal(costFromUsage({cache_creation_input_tokens:1e6}),5);
});
test('ledger caps, replay, lock and separate turn2',()=>{const dir=temp(), path=join(dir,'ledger'); try {
 let l=openLedger(path,{pilot:200,batch:200,agent:200,boost:200,turn2:15}); assert.throws(()=>openLedger(path),/EEXIST/);
 let id=l.reserve('pilot',140,'maximum'); assert.throws(()=>l.reserve('batch',0.01),CapExceededError); let turn=l.reserve('turn2',15); assert.throws(()=>l.reserve('turn2',0.01),CapExceededError);
 l.settle(id,{runId:'one',usd:139,usage:{},source:'batch-usage'}); l.close(); l=openLedger(path,{pilot:200,batch:200,agent:200,boost:200,turn2:15}); assert.equal(l.totals().total.spent,139);assert.equal(l.totals().segments.turn2.reserved,15); l.release(turn);assert.equal(l.totals().segments.turn2.remaining,15); l.close();
 l=openLedger(join(dir,'other'));assert.throws(()=>l.reserve('pilot',5.01),CapExceededError); const x=l.reserve('pilot',5);assert.throws(()=>l.settle(x,{runId:'x',usd:6,source:'assumed-max'}),CapExceededError);l.close();
 } finally {rmSync(dir,{recursive:true,force:true});}});
test('tq reference passes and empty module fails all six',()=>{const code=readFileSync(new URL('../../task-quality/reference.mjs',import.meta.url),'utf8');for(const task of tasks){assert.equal(gradeSingle({suite:'tq',slug:task.id,code}).passed,true,task.id); assert.equal(gradeSingle({suite:'tq',slug:task.id,code:'export {};'}).passed,false,task.id);}});
test('ss checks use a temporary task directory',()=>{const dir=temp();try {mkdirSync(join(dir,'fake'));writeFileSync(join(dir,'fake/checks.mjs'),"import assert from 'node:assert/strict'; export const checks=[m=>assert.equal(m.answer(),42)];");assert.equal(gradeSingle({suite:'ss',slug:'fake',code:'export const answer=()=>42',singleDir:dir}).passed,true);assert.equal(gradeSingle({suite:'ss',slug:'fake',code:'export {}',singleDir:dir}).passed,false);}finally{rmSync(dir,{recursive:true,force:true});}});
test('paid gate and mock batch roundtrip',async()=>{const dir=temp();try {
 const built=build({wave:'w0',tasks:'tq/ranges',efforts:'low,max',reps:1,outDir:dir});assert.equal(built.count,2);
 const requests=readFileSync(built.path,'utf8').trim().split('\n').map(JSON.parse);assert.equal(requests[0].params.output_config.format.type,'json_schema');
 let calls=0; const ref=readFileSync(new URL('../../task-quality/reference.mjs',import.meta.url),'utf8'); const client={messages:{batches:{create:async ({requests})=>{calls++;assert.equal(requests.length,2);assert.equal(requests[0].meta,undefined);return {id:'batch-1'};},results:async ()=>requests.map((r,i)=>({custom_id:r.custom_id,result:{type:'succeeded',message:{stop_reason:i?'max_tokens':'end_turn',usage:{input_tokens:100,output_tokens:100},content:[{type:'text',text:JSON.stringify({code:ref})}]}}}))}}};
 await assert.rejects(execute('submit',{wave:'w0',outDir:dir},{client,env:{}}),e=>e.exitCode===3);assert.equal(calls,0);
 await execute('submit',{wave:'w0',outDir:dir,paid:true},{client,env:{LADDER_ALLOW_PAID:'1'}}); const done=await execute('collect',{wave:'w0',outDir:dir,paid:true},{client,env:{LADDER_ALLOW_PAID:'1'}});assert.equal(done.count,2);
 const results=readFileSync(join(dir,'w0/results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(results[0].passed,true);assert.equal(results[1].truncated,true);assert.equal(results[1].passed,false);
 const l=openLedger(join(dir,'ledger.jsonl'));assert.equal(l.totals().segments.batch.reserved,0);assert.ok(l.totals().segments.batch.spent>0);l.close();
 const blocked=spawnSync(process.execPath,['scripts/batch.mjs','submit','--wave','w0','--out-dir',dir],{encoding:'utf8',env:{}});assert.equal(blocked.status,3);assert.match(blocked.stderr,/paid call blocked/);
 }finally{rmSync(dir,{recursive:true,force:true});}});
test('generation errors are distinct from quality failures',async()=>{const dir=temp();try {
 const built=build({wave:'w1',tasks:'tq/ranges',efforts:'low,medium,high',outDir:dir}); const requests=readFileSync(built.path,'utf8').trim().split('\n').map(JSON.parse);
 const client={messages:{batches:{create:async()=>({id:'batch-errors'}),results:async()=>[
  {custom_id:requests[0].custom_id,result:{type:'succeeded',message:{stop_reason:'refusal',usage:{input_tokens:1,output_tokens:1},content:[]}}},
  {custom_id:requests[1].custom_id,result:{type:'errored',error:{type:'error'}}},
  {custom_id:requests[2].custom_id,result:{type:'expired'}}
 ]}}};
 const opts={wave:'w1',outDir:dir,paid:true}, deps={client,env:{LADDER_ALLOW_PAID:'1'}};
 await execute('submit',opts,deps); await execute('collect',opts,deps);
 const rows=readFileSync(join(dir,'w1/results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(rows.map(x=>x.generationError),['refusal','errored','expired']);assert.ok(rows.every(x=>!x.passed&&x.totalChecks===0));
 const l=openLedger(join(dir,'ledger.jsonl'));assert.equal(l.totals().segments.batch.spent,0.5);l.close();
 }finally{rmSync(dir,{recursive:true,force:true});}});
