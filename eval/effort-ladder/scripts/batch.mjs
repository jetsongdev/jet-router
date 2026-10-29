import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadKeys } from '../lib/keys.mjs';
import { buildManifest } from './build-manifest.mjs';
import { EFFORTS, runId } from '../lib/ids.mjs';
import { costFromUsage } from '../lib/pricing.mjs';
import { gradeSingle } from '../lib/grade-single.mjs';
import { openLedger, CapExceededError } from '../lib/ledger.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const model='claude-opus-5-5';
const schema={type:'object',properties:{code:{type:'string'}},required:['code'],additionalProperties:false};
const readJSON=p=>JSON.parse(readFileSync(p,'utf8'));
const readLines=p=>readFileSync(p,'utf8').split('\n').filter(Boolean).map(JSON.parse);
const json=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const defaultAssumptions={low:1200,medium:2200,high:3500,xhigh:4600,max:8000};
function assumptions({assume,assumeFrom,outDir}) {
 const values={...defaultAssumptions};
 if(assume) {
  const overrides=readJSON(assume);
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.entries(overrides).some(([k,v])=>!EFFORTS.includes(k)||!Number.isSafeInteger(v)||v<0)) throw Error('invalid output token assumptions');
  Object.assign(values,overrides);
 }
 if(assumeFrom) {
  if(!/^[A-Za-z0-9_-]+$/.test(assumeFrom)) throw Error('invalid assumption wave');
  const records=readLines(join(outDir,assumeFrom,'results.jsonl'));
  for(const effort of EFFORTS) {
   const tokens=records.filter(r=>r.effort===effort).map(r=>r.usage?.output_tokens).filter(n=>Number.isSafeInteger(n)&&n>=0).sort((a,b)=>a-b);
   if(tokens.length) values[effort]=tokens[Math.ceil(tokens.length*0.95)-1];
  }
 }
 return values;
}
function estimates(rows,values) {
 let realisticUsd=0,worstUsd=0;
 for(const r of rows) {
  const effort=r.params.output_config.effort;
  if(!Object.hasOwn(values,effort)) throw Error('invalid request effort');
  const input_tokens=Math.ceil(Buffer.byteLength(r.params.messages[0].content)/4);
  realisticUsd+=costFromUsage({input_tokens,output_tokens:values[effort]},{batch:true});
  worstUsd+=costFromUsage({input_tokens,output_tokens:32000},{batch:true});
 }
 return {realisticUsd,worstUsd};
}
function argsOf(args) {const out={}; for(let i=0;i<args.length;i++){const k=args[i]; if(!k.startsWith('--')) throw Error('invalid option'); out[k.slice(2)]=k==='--paid'?true:args[++i];} return out;}
export function build({wave,tasks='tq,ss',efforts='low,medium,high,xhigh,max',reps='1',outDir=join(root,'runs'),assume,assumeFrom}) {
 if(!wave||!/^[A-Za-z0-9_-]+$/.test(wave)||!Number.isSafeInteger(Number(reps))||Number(reps)<1) throw Error('invalid build arguments');
 const selected=tasks.split(','), levels=efforts.split(','); if(levels.some(e=>!EFFORTS.includes(e))||selected.some(s=>!['tq','ss'].includes(s)&&! /^(tq|ss)\/[A-Za-z0-9_-]+$/.test(s))||new Set(levels).size!==levels.length||new Set(selected).size!==selected.length) throw Error('invalid selection');
 const manifest=buildManifest().filter(t=>selected.includes(t.suite)||selected.includes(t.task_id));
 if(!manifest.length) throw Error('no tasks selected');
 const rows=[];
 for(const task of manifest) for(const effort of levels) for(let rep=1;rep<=Number(reps);rep++) {
  const id=runId({wave,suite:task.suite,slug:task.slug,effort,rep});
  rows.push({custom_id:id,params:{model,max_tokens:32000,output_config:{effort,format:{type:'json_schema',schema}},messages:[{role:'user',content:task.prompt}]},meta:{wave,taskId:task.task_id,suite:task.suite,slug:task.slug,effort,rep,promptSha256:task.prompt_sha256,fixtureSha256:task.fixture_sha256}});
 }
 const estimate=estimates(rows,assumptions({assume,assumeFrom,outDir}));
 const dir=join(outDir,wave); mkdirSync(dir,{recursive:true}); const path=join(dir,'requests.jsonl'); if(existsSync(path)) throw Error('requests already exist');
 writeFileSync(path,rows.map(JSON.stringify).join('\n')+'\n');
 return {count:rows.length,...estimate,path};
}
function ensurePaid(paid,env) {if(!paid||env.LADDER_ALLOW_PAID!=='1') {const e=Error('paid call blocked');e.exitCode=3;throw e;}}
export async function execute(command, options, {client,env=process.env}={}) {
 if(command==='build') return build(options);
 if(!['submit','status','cancel','collect'].includes(command)) throw Error('unknown command');
 ensurePaid(options.paid,env);
 if(!client) {const apiKey=loadKeys(env.LADDER_KEYS_FILE).ANTHROPIC_API_KEY; if(!apiKey) throw Error('missing-key'); const {default:Anthropic}=await import('@anthropic-ai/sdk'); client=new Anthropic({apiKey});}
 const {wave,outDir=join(root,'runs')}=options; if(!wave||!/^[A-Za-z0-9_-]+$/.test(wave)) throw Error('invalid wave');
 const dir=join(outDir,wave), statePath=join(dir,'batch.json'), ledgerPath=options.ledger??join(outDir,'ledger.jsonl');
 if(command==='submit') {
  if(existsSync(statePath)) throw Error('batch already submitted');
  const rows=readLines(join(dir,'requests.jsonl')); if(!rows.length) throw Error('empty batch');
  const cap=Number(options.cap??8); if(!Number.isFinite(cap)||cap<=0||cap>30) throw Error('invalid wave cap');
  const estimate=estimates(rows,assumptions({assume:options.assume,assumeFrom:options.assumeFrom,outDir}));
  if(estimate.realisticUsd*1.25>cap) {const e=Error('wave estimate exceeds cap');e.exitCode=4;throw e;}
  const reservationUsd=Math.max(estimate.realisticUsd*1.25,0.5);
  const ledger=openLedger(ledgerPath); let id;
  try { id=ledger.reserve('batch',reservationUsd,`wave ${wave}`); json(statePath,{reservationId:id,reservationUsd,cap,...estimate,startedAt:new Date().toISOString(),status:'submitting'}); const batch=await client.messages.batches.create({requests:rows.map(({custom_id,params})=>({custom_id,params}))}); json(statePath,{...readJSON(statePath),batchId:batch.id,status:'submitted'}); return {...batch,...estimate,reservationUsd}; } finally {ledger.close();}
 }
 const state=readJSON(statePath); if(!state.batchId) throw Error('submission outcome unknown; reservation retained');
 if(command==='status') return client.messages.batches.retrieve(state.batchId);
 if(command==='cancel') return client.messages.batches.cancel(state.batchId);
 if(state.status==='collected') throw Error('batch already collected');
 const requests=readLines(join(dir,'requests.jsonl')), byId=new Map(requests.map(r=>[r.custom_id,r]));
 const responses=[]; for await(const result of await client.messages.batches.results(state.batchId)) responses.push(result);
 if(responses.length!==requests.length || new Set(responses.map(x=>x.custom_id)).size!==requests.length || responses.some(x=>!byId.has(x.custom_id))) throw Error('batch results incomplete or mismatched');
 const records=[]; let cost=0, unknown=false;
 mkdirSync(join(dir,'code'),{recursive:true});
 for(const response of responses) {
  const r=byId.get(response.custom_id), res=response.result, msg=res.message, usage=msg?.usage??null;
  const source=usage?'batch-usage':'assumed-max'; const usd=usage?costFromUsage(usage,{batch:true}):0; cost+=usd; if(!usage) unknown=true;
  const truncated=msg?.stop_reason==='max_tokens'; let generationError=null, grade={passed:false,passedChecks:0,totalChecks:0,results:[]};
  if(res.type!=='succeeded') generationError=res.type;
  else if(msg.stop_reason==='refusal') generationError='refusal';
  else if(!truncated) {try {const text=msg.content.filter(x=>x.type==='text').map(x=>x.text).join(''); const code=JSON.parse(text).code; if(typeof code!=='string') throw Error('missing code'); writeFileSync(join(dir,'code',`${r.custom_id}.mjs`),code); grade=gradeSingle({suite:r.meta.suite,slug:r.meta.slug,code});} catch {generationError='invalid-output';}}
  records.push({v:1,runId:r.custom_id,taskId:r.meta.taskId,kind:'single',effort:r.meta.effort,rep:r.meta.rep,wave,turn:null,arm:null,parentRunId:null,model,promptSha256:r.meta.promptSha256,fixtureSha256:r.meta.fixtureSha256,startedAt:state.startedAt,durationMs:null,stopReason:msg?.stop_reason??null,truncated,usage,costUsd:usage?usd:null,costSource:source,passed:grade.passed,passedChecks:grade.passedChecks,totalChecks:grade.totalChecks,publicTestsUnmodified:null,shadowRaise:null,effortEvidence:{effort:r.meta.effort,outputTokens:usage?.output_tokens??null},generationError});
 }
 const settledUsd=unknown?Math.max(cost,state.reservationUsd??state.cap):cost;
 const overrun=cost>(state.reservationUsd??state.cap);
 if(overrun) {console.warn(`warning: wave ${wave} overrun: actual cost exceeds reservation`); for(const record of records) record.overrun=true;}
 const ledger=openLedger(ledgerPath); try {
  const settlement={runId:wave,usd:settledUsd,usage:records.map(r=>r.usage),source:unknown?'assumed-max':'batch-usage'};
  try {ledger.settle(state.reservationId,settlement);} catch(e) {
   if(!(e instanceof CapExceededError)) throw e;
   appendFileSync(ledgerPath,JSON.stringify({type:'settle',id:state.reservationId,...settlement})+'\n');
  }
  json(statePath,{...state,status:'collected',overrun}); writeFileSync(join(dir,'results.jsonl'),records.map(JSON.stringify).join('\n')+'\n');
 } finally {ledger.close();}
 return {count:records.length,costUsd:settledUsd,overrun};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {try {const [command,...rest]=process.argv.slice(2); const a=argsOf(rest); const result=await execute(command,{...a,outDir:a['out-dir'],assumeFrom:a['assume-from']}); console.log(JSON.stringify(result));} catch(e) {console.error(e.message);process.exitCode=e.exitCode??1;}}
