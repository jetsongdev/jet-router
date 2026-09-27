import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,signFlip,totals} from '../scripts/summarize-downshift.mjs';
function fixture(){
 const results=[];
 for(let round=0;round<3;round++)for(const arm of ['baseline','recommended'])results.push({task:'test',round,arm,threadId:`${round}-${arm}`,model:'gpt-6-astra',requestedEffort:arm==='baseline'?'xhigh':'medium',usedTools:false,promptSha256:'same',passed:true,grade:{passed:true},latencyMs:100,usage:{input_tokens:1000,cached_input_tokens:500,output_tokens:arm==='baseline'?100:50,reasoning_output_tokens:30}});
 return {complete:true,routes:{complete:true,baseline:'xhigh',model:'gpt-6-astra',routes:[{task:'test',eligible:true,decision:{choice:'medium'},latencyMs:200}]},results};
}
test('token savings keep reasoning separate and disclose total-context dilution',()=>{
 const result=summarize(fixture());assert.equal(result.outputReductionPct,50);assert.equal(result.nominalInputPlusOutputReductionPct,100*150/3300);assert.equal(result.usefulPilotSignal,true);assert.equal(result.routerTokens,null);assert.equal(totals(fixture().results).output,450);
});
test('cheaper output cannot qualify when it loses a passing solution',()=>{
 const report=fixture();report.results[1].passed=false;report.results[1].grade.passed=false;
 const result=summarize(report);assert.equal(result.regressions,1);assert.equal(result.usefulPilotSignal,false);
});
test('unpaired or reused session evidence is rejected',()=>{
 const report=fixture();report.results[1].threadId=report.results[0].threadId;assert.throws(()=>summarize(report));
 const missing=fixture();missing.results.pop();assert.throws(()=>summarize(missing));
});
test('task-level sign test cannot turn four positive tasks into p below .05',()=>{
 assert.equal(signFlip([1,2,3,4]),1/16);assert.equal(signFlip([0,0]),1);assert.equal(signFlip([-1,-2]),1);
});
import {cost,price} from '../scripts/price-downshift.mjs';
test('rate-card estimate discounts cached input and never adds reasoning twice',()=>{
 const rows=[{usage:{input_tokens:1000,cached_input_tokens:800,cache_write_input_tokens:0,output_tokens:100,reasoning_output_tokens:80}}];
 const rates={input:10,cachedInput:1,output:50};
 assert.ok(Math.abs(cost(rows,rates).total-.0078)<1e-12);
 assert.ok(Math.abs(cost(rows,rates,0).total-.015)<1e-12);
 assert.ok(Math.abs(cost(rows,rates,1).total-.006)<1e-12);
 rows[0].usage.cache_write_input_tokens=10;assert.throws(()=>cost(rows,rates));
});
test('unequal cache may reverse observed cost savings; equal-cache keeps that separate',()=>{
 const report=fixture();for(const r of report.results){r.usage.cache_write_input_tokens=0;r.usage.cached_input_tokens=r.arm==='baseline'?1000:0;}
 const result=price(report,{model:'gpt-6-astra',longContextThreshold:272000,apiPerMillion:{input:10,cachedInput:1,output:50},codexPerMillion:{input:250,cachedInput:25,output:1250}});
 assert.ok(result.scenarios[0].savingPct<0);assert.ok(result.scenarios[1].savingPct>0);assert.equal(result.actualBilledUsd,null);
 assert.ok(Math.abs(result.scenarios[0].baselineCredits-result.scenarios[0].baselineUsd.total*25)<1e-12);
});
