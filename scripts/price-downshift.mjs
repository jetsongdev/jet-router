import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function cost(rows,rates,cacheFraction=null){
 assert.ok(cacheFraction===null||(Number.isFinite(cacheFraction)&&cacheFraction>=0&&cacheFraction<=1));
 const parts={uncachedInput:0,cachedInput:0,output:0};
 for(const row of rows){
  const u=row.usage;
  // This experiment reports zero cache writes. Do not guess accounting for other runs.
  assert.equal(u.cache_write_input_tokens,0);
  assert.ok(u.input_tokens>=u.cached_input_tokens&&u.cached_input_tokens>=0);
  const cached=cacheFraction===null?u.cached_input_tokens:u.input_tokens*cacheFraction;
  parts.uncachedInput+=(u.input_tokens-cached)*rates.input/1e6;
  parts.cachedInput+=cached*rates.cachedInput/1e6;
  parts.output+=u.output_tokens*rates.output/1e6;
 }
 return {...parts,total:parts.uncachedInput+parts.cachedInput+parts.output};
}
export function price(report,pricing){
 assert.equal(report.complete,true);assert.equal(report.routes.model,pricing.model);
 assert.ok(report.results.every(r=>r.usage.input_tokens<=pricing.longContextThreshold));
 const baseline=report.results.filter(r=>r.arm==='baseline'),recommended=report.results.filter(r=>r.arm==='recommended');
 assert.equal(baseline.length,recommended.length);assert.ok(baseline.length>0);
 const total=key=>report.results.reduce((n,r)=>n+r.usage[key],0);
 const pooled=total('cached_input_tokens')/total('input_tokens');
 const scenarios=[['observed-cache',null],['equal-cache-pooled',pooled],['equal-cache-zero',0],['equal-cache-90pct',.9]].map(([name,fraction])=>{
  const b=cost(baseline,pricing.apiPerMillion,fraction),r=cost(recommended,pricing.apiPerMillion,fraction);
  return {name,cacheFraction:fraction,baselineUsd:b,recommendedUsd:r,savedUsd:b.total-r.total,
   savingPct:100*(b.total-r.total)/b.total,
   baselineCredits:cost(baseline,pricing.codexPerMillion,fraction).total,
   recommendedCredits:cost(recommended,pricing.codexPerMillion,fraction).total,
   savingPerTaskUsd:(b.total-r.total)/baseline.length,
   breakEvenRouterUsdPerTask:Math.max(0,(b.total-r.total)/baseline.length)};
 });
 const perTask=[...new Set(baseline.map(r=>r.task))].map(task=>{
  const b=baseline.filter(r=>r.task===task),r=recommended.filter(r=>r.task===task);
  const compare=fraction=>{const base=cost(b,pricing.apiPerMillion,fraction).total,rec=cost(r,pricing.apiPerMillion,fraction).total;return {baselineUsd:base,recommendedUsd:rec,savingPct:100*(base-rec)/base};};
  return {task,observed:compare(null),equalCache:compare(pooled)};
 });
 return {pricing,perTask,pairs:baseline.length,pooledCacheFraction:pooled,scenarios,actualBilledUsd:null,routerCostUsd:null,
  note:'Router break-even assumes all paired tests pass and one routing call per task. It is a ceiling, not measured Jev cost. No retries or repair included.'};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const result=price(JSON.parse(readFileSync(process.argv[2],'utf8')),JSON.parse(readFileSync(process.argv[3],'utf8')));
 writeFileSync(process.argv[4],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
