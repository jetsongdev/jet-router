import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { tasks } from '../eval/task-quality/tasks.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
const grader=join(root,'eval/task-quality/grade.mjs');
const schema={type:'object',properties:{code:{type:'string'}},required:['code'],additionalProperties:false};
export const taskPrompt=task=>`Implement the following specification as a standalone JavaScript ES module. Return a JSON object with only a code string. Do not call tools, read files, use imports, or write tests. The evaluator will test the exported API separately.\n\n${task.spec}`;
export function runProcess(command,args,options,input='',timeoutMs=180000) {
 return new Promise(resolveResult=>{
  const began=performance.now();let stdout='',stderr='',done=false;
  const grouped=process.platform!=='win32';
  const child=spawn(command,args,{...options,detached:grouped,stdio:['pipe','pipe','pipe']});
  const stop=()=>{try {if(grouped)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}};
  const timer=setTimeout(stop,timeoutMs);
  const finish=code=>{if(done)return;done=true;clearTimeout(timer);resolveResult({code,stdout,stderr,latencyMs:Math.round(performance.now()-began)});};
  child.on('error',()=>finish(-1));child.on('close',finish);
  child.stdout.on('data',c=>{stdout+=c;if(stdout.length>2000000)stop();});
  child.stderr.on('data',c=>{stderr+=c;if(stderr.length>200000)stop();});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export function gradeCode(id,code) {
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'jet-router-grading-')));
 try {
  writeFileSync(join(dir,'solution.mjs'),code);
  const checked=spawnSync(process.execPath,['--permission',`--allow-fs-read=${dir}`,`--allow-fs-read=${grader}`,grader,id,join(dir,'solution.mjs')],{env:{},encoding:'utf8',timeout:5000,maxBuffer:65536});
  let grade;try{grade=JSON.parse(checked.stdout.trim());}catch{grade={passed:false,error:'grader-timeout-or-invalid-output'};}
  return {...grade,passed:checked.status===0&&grade.passed===true};
 } finally {rmSync(dir,{recursive:true,force:true});}
}
export async function generate(task,effort,model='gpt-6-astra') {
 if(!['low','medium','high','xhigh'].includes(effort))throw new Error('effort');
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'jet-router-coding-')));
 try {
  writeFileSync(join(dir,'schema.json'),JSON.stringify(schema));
  const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','-C',dir,'-s','read-only','-m',model,
   '-c',`model_reasoning_effort="${effort}"`,'-c','project_doc_max_bytes=0','--json','--output-schema',join(dir,'schema.json'),'-o',join(dir,'answer.json'),'-'];
  const env={...process.env};delete env.TYPESAFE_API_KEY;
  const execution=await runProcess('codex',args,{cwd:dir,env},taskPrompt(task));
  let events=[];try{events=execution.stdout.split('\n').filter(Boolean).map(s=>JSON.parse(s));}catch{}
  const usage=events.find(e=>e.type==='turn.completed')?.usage??null;
  const threadId=events.find(e=>e.type==='thread.started')?.thread_id??null;
  const usedTools=events.some(e=>e.type==='item.completed' && e.item?.type!=='agent_message' && e.item?.type!=='reasoning');
  let code;try{code=JSON.parse(readFileSync(join(dir,'answer.json'),'utf8')).code;}catch{}
  const common={task:task.id,model,requestedEffort:effort,effortEvidence:'explicit-codex-cli-config; wire-unobserved',promptSha256:hash(taskPrompt(task)),threadId,usage,latencyMs:execution.latencyMs,usedTools};
  if(execution.code!==0||typeof code!=='string'||code.length>65536||!usage||usedTools)return {...common,passed:false,error:'generation-failed'};
  const grade=gradeCode(task.id,code);
  return {...common,code,codeSha256:hash(code),grade,passed:grade.passed};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try {
  const config=JSON.parse(readFileSync(process.argv[2],'utf8'));const output=process.argv[3];
  if(!output||existsSync(output)||!['dev','holdout'].includes(config.split)||![1,2].includes(config.rounds))throw new Error('arguments');
  const selected=tasks.filter(t=>t.split===config.split);
  if(selected.some(t=>!['low','medium','high','xhigh'].includes(config.efforts?.[t.id])))throw new Error('efforts');
  const report={config,startedAt:new Date().toISOString(),taskSha256:hash(JSON.stringify(selected)),graderSha256:hash(readFileSync(grader)),results:[],complete:false};
  mkdirSync(output);
  outer:for(let round=0;round<config.rounds;round++)for(const task of selected){
   const result=await generate(task,config.efforts[task.id]);
   report.results.push({...result,round});
   writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
   process.stdout.write(JSON.stringify({round,task:task.id,effort:result.requestedEffort,passed:result.passed,grade:result.grade,usage:result.usage,latencyMs:result.latencyMs})+'\n');
   if(result.error)break outer;
  }
  report.complete=report.results.length===selected.length*config.rounds&&!report.results.some(r=>r.error);
  report.successes=report.results.filter(r=>r.passed).length;
  report.finishedAt=new Date().toISOString();writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));
  process.exitCode=report.complete?0:1;
 }catch{process.stderr.write('task-quality-run-failed\n');process.exitCode=1;}
}
