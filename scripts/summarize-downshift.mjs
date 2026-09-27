import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {tasks} from '../eval/task-quality/tasks.mjs';
import {gradeCode,taskPrompt} from './run-task-quality.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function totals(rows){
 const sum=key=>rows.reduce((n,r)=>n+r.usage[key],0);
 return {runs:rows.length,passes:rows.filter(r=>r.passed).length,input:sum('input_tokens'),cachedInput:sum('cached_input_tokens'),output:sum('output_tokens'),reasoning:sum('reasoning_output_tokens'),latencyMs:rows.reduce((n,r)=>n+r.latencyMs,0)};
}
export function signFlip(differences){
 assert.ok(differences.length>0&&differences.length<=16);
 const observed=differences.reduce((a,b)=>a+b,0);let extreme=0;
 for(let mask=0;mask<2**differences.length;mask++){
  const statistic=differences.reduce((sum,d,i)=>sum+((mask>>i)&1?d:-d),0);
  if(statistic>=observed-1e-9)extreme++;
 }
 return extreme/2**differences.length;
}
export function summarize(report){
 assert.equal(report.complete,true);assert.equal(report.routes.complete,true);
 const eligible=report.routes.routes.filter(r=>r.eligible);assert.ok(eligible.length>0);
 assert.equal(report.results.length,eligible.length*6);
 const sessions=new Set(),pairs=[];
 const perTask=eligible.map(route=>{
  const rows=report.results.filter(r=>r.task===route.task);assert.equal(rows.length,6);
  for(let round=0;round<3;round++){
   const pair=rows.filter(r=>r.round===round);assert.equal(pair.length,2);
   const baseline=pair.find(r=>r.arm==='baseline'),recommended=pair.find(r=>r.arm==='recommended');assert.ok(baseline&&recommended);
   for(const row of pair){
    assert.ok(row.threadId&&!sessions.has(row.threadId));sessions.add(row.threadId);
    assert.equal(row.usedTools,false);assert.ok(!row.error);assert.equal(row.model,report.routes.model);
    assert.equal(row.requestedEffort,row.arm==='baseline'?report.routes.baseline:route.decision.choice);
    assert.equal(row.passed,row.grade.passed);
    for(const key of ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens'])assert.ok(Number.isFinite(row.usage[key])&&row.usage[key]>=0);
    assert.ok(row.usage.cached_input_tokens<=row.usage.input_tokens);
   }
   assert.equal(baseline.promptSha256,recommended.promptSha256);
   pairs.push({task:route.task,round,baselinePassed:baseline.passed,recommendedPassed:recommended.passed,outputSaved:baseline.usage.output_tokens-recommended.usage.output_tokens,regression:baseline.passed&&!recommended.passed});
  }
  const baseline=totals(rows.filter(r=>r.arm==='baseline')),recommended=totals(rows.filter(r=>r.arm==='recommended'));
  return {task:route.task,effort:route.decision.choice,baseline,recommended,outputSaved:baseline.output-recommended.output,outputReductionPct:100*(baseline.output-recommended.output)/baseline.output};
 });
 const baseline=totals(report.results.filter(r=>r.arm==='baseline')),recommended=totals(report.results.filter(r=>r.arm==='recommended'));
 const outputReductionPct=100*(baseline.output-recommended.output)/baseline.output;
 const regressions=pairs.filter(p=>p.regression).length;
 return {baseline,recommended,perTask,pairs,regressions,outputReductionPct,
  nominalInputPlusOutputReductionPct:100*((baseline.input+baseline.output)-(recommended.input+recommended.output))/(baseline.input+baseline.output),
  taskLevelOneSidedSignFlipP:signFlip(perTask.map(t=>t.outputSaved/3)),
  positiveSavingPairs:pairs.filter(p=>p.outputSaved>0).length,
  usefulPilotSignal:outputReductionPct>=10&&regressions===0&&baseline.passes===baseline.runs&&recommended.passes===recommended.runs,
  exclusions:report.routes.routes.filter(r=>!r.eligible).map(r=>({task:r.task,choice:r.decision?.choice??null,reason:r.reason??'not-a-strict-downshift'})),
  routerLatencyMs:report.routes.routes.map(r=>r.latencyMs),routerTokens:null,actualBilledUsd:null};
}
export function verify(report){
 assert.equal(report.routes.taskSha256,sha(JSON.stringify(tasks)));
 assert.equal(report.routes.graderSha256,sha(readFileSync(new URL('../eval/task-quality/grade.mjs',import.meta.url))));
 for(const [index,row] of report.results.entries()){
  assert.equal(row.order,index);
  const task=tasks.find(t=>t.id===row.task);assert.ok(task);
  assert.equal(row.promptSha256,sha(taskPrompt(task)));assert.equal(row.codeSha256,sha(row.code));
  assert.deepEqual(gradeCode(row.task,row.code),row.grade);
 }
 return summarize(report);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
 const summary=verify(report);writeFileSync(process.argv[3],JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary));
}
