import {readFileSync}from'node:fs';
export function summarize(report){
 const results=report.results;
 const sum=key=>results.reduce((n,r)=>n+(r.usage?.[key]??0),0);
 return {complete:report.complete,count:results.length,successes:results.filter(r=>r.passed).length,
  perTask:Object.fromEntries([...new Set(results.map(r=>r.task))].map(id=>[id,results.filter(r=>r.task===id&&r.passed).length])),
  totalLatencyMs:results.reduce((n,r)=>n+r.latencyMs,0),inputTokens:sum('input_tokens'),
  cachedInputTokens:sum('cached_input_tokens'),outputTokens:sum('output_tokens'),reasoningOutputTokens:sum('reasoning_output_tokens'),
  actualBilledUsd:null};
}
export function qualityImproves(previous,candidate){
 return previous.complete&&candidate.complete&&previous.count===candidate.count&&candidate.successes>=previous.successes+1&&
  Object.entries(previous.perTask).every(([id,n])=>(candidate.perTask[id]??-1)>=n);
}
if(process.argv[1]?.endsWith('/summarize-task-quality.mjs')){
 for(const path of process.argv.slice(2))console.log(JSON.stringify({path,...summarize(JSON.parse(readFileSync(path,'utf8')))}));
}
