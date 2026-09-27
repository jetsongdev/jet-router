import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {tasks} from '../eval/task-quality/tasks.mjs';
import {generate,taskPrompt} from './run-task-quality.mjs';
import {classifyJev} from '../mcp/shadow.mjs';
import {prepareRoutingRequest,HARNESS_VERSIONS} from '../src/harness.js';
import {parseKeyFile} from './evaluate-jev.mjs';
import {validJevKey} from '../src/providers/jev.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const [mode,path,keyPath]=process.argv.slice(2);
const save=(file,data)=>writeFileSync(file,JSON.stringify(data,null,2)+'\n');
try {
 if(mode==='route'){
  if(existsSync(path))throw new Error('exists');
  const key=parseKeyFile(readFileSync(keyPath,'utf8'));if(!validJevKey(key))throw new Error('key');
  const report={baseline:'xhigh',model:'gpt-6-astra',versions:HARNESS_VERSIONS,taskSha256:sha(JSON.stringify(tasks)),graderSha256:sha(readFileSync(new URL('../eval/task-quality/grade.mjs',import.meta.url))),routes:[],complete:false};
  for(const task of tasks){
   const input={host:'codex',prompt:taskPrompt(task),cloudConsent:true,target:{model:report.model,source:'host',supportedEfforts:['low','medium','high','xhigh','max','ultra']},effort:{value:'xhigh',source:'user-reference'},event:{sessionId:'downshift-eval',turnId:task.id,correlated:true},context:{source:'prompt-only',missingRequired:null}};
   const prepared=prepareRoutingRequest(input);if(prepared.status!=='ready')throw new Error('preflight');
   const began=performance.now();const result=await classifyJev(input,key);
   const choice=result.decision?.choice;
   report.routes.push({task:task.id,promptSha256:sha(taskPrompt(task)),requestSha256:sha(JSON.stringify(prepared.request)),latencyMs:Math.round(performance.now()-began),...result,eligible:['low','medium','high'].includes(choice)});
   save(path,report);console.log(JSON.stringify(report.routes.at(-1)));
   if(!choice)throw new Error('routing');
  }
  report.complete=true;save(path,report);
 }else if(mode==='run'){
  const routes=JSON.parse(readFileSync(path,'utf8'));const output=path.replace(/\.json$/,'-runs.json');
  if(!routes.complete||existsSync(output)||routes.taskSha256!==sha(JSON.stringify(tasks)))throw new Error('input');
  const selected=routes.routes.filter(r=>r.eligible);
  if(!selected.length)throw new Error('no-downshift');
  const report={startedAt:new Date().toISOString(),routes,results:[],complete:false};
  for(let round=0;round<3;round++)for(const [index,route]of selected.entries()){
   for(const arm of (round+index)%2?['recommended','baseline']:['baseline','recommended']){
    const effort=arm==='baseline'?'xhigh':route.decision.choice;
    const result=await generate(tasks.find(t=>t.id===route.task),effort);
    report.results.push({round,arm,order:report.results.length,...result});save(output,report);
    console.log(JSON.stringify({task:route.task,round,arm,effort,passed:result.passed,usage:result.usage,latencyMs:result.latencyMs,error:result.error}));
    if(result.error)throw new Error('generation');
   }
  }
  report.complete=true;report.finishedAt=new Date().toISOString();save(output,report);
 }else throw new Error('mode');
}catch{console.error('downshift-experiment-stopped');process.exitCode=1;}
