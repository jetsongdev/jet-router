import test from 'node:test';
import assert from 'node:assert/strict';
import { grade,checks } from '../eval/task-quality/grade.mjs';
import * as reference from '../eval/task-quality/reference.mjs';
import {taskPrompt} from '../scripts/run-task-quality.mjs';
import {tasks} from '../eval/task-quality/tasks.mjs';
for(const id of Object.keys(checks))test(`independent grader accepts reference and rejects missing API: ${id}`,async()=>{
 assert.equal((await grade(id,reference)).passed,true);
 assert.equal((await grade(id,{})).passed,false);
});
test('task model sees public specification, not hidden checks or reference code',()=>{
 for(const task of tasks){const prompt=taskPrompt(task);assert.ok(prompt.includes(task.spec));assert.ok(!prompt.includes('reference.mjs'));assert.ok(!prompt.includes('assert.'));}
});
test('permission-isolated grader resolves macOS temporary directory aliases',async()=>{
 const {gradeCode}=await import('../scripts/run-task-quality.mjs');
 const {readFileSync}=await import('node:fs');
 assert.equal(gradeCode('ranges',readFileSync(new URL('../eval/task-quality/reference.mjs',import.meta.url),'utf8')).passed,true);
 assert.equal(gradeCode('ranges','export function parseRanges(){return [];}').passed,false);
});
test('withheld checks reject plausible boundary and stale-state bugs',async()=>{
 const {gradeCode}=await import('../scripts/run-task-quality.mjs');
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../eval/task-quality/reference.mjs',import.meta.url),'utf8');
 const mutations=[
  ['ranges','b-a>=1000','b-a>1000'],
  ['ttl-lru','t>=v.exp','t>v.exp'],
  ['async-memo','if(cache.get(k)===p)cache.delete(k);','cache.delete(k);'],
  ['ledger',"if(t.from!==t.to){",'if(true){'],
  ['keyed-queue','const p=previous.then(task);','const p=Promise.resolve().then(task);'],
  ['intervals','if(l>p)out.push([p,l]);','if(l>p)out.push([p,l+0.1]);'],
 ];
 for(const [id,before,after]of mutations){assert.ok(source.includes(before));assert.equal(gradeCode(id,source.replace(before,after)).passed,false,id);}
});
test('actual quality gate rejects ties and task-specific regressions',async()=>{
 const {qualityImproves}=await import('../scripts/summarize-task-quality.mjs');
 const base={complete:true,count:8,successes:6,perTask:{a:2,b:2,c:1,d:1}};
 assert.equal(qualityImproves(base,{...base,successes:7,perTask:{...base.perTask,c:2}}),true);
 assert.equal(qualityImproves(base,{...base}),false);
 assert.equal(qualityImproves(base,{...base,successes:7,perTask:{a:1,b:2,c:2,d:2}}),false);
 assert.equal(qualityImproves(base,{...base,complete:false,successes:8}),false);
});
test('generation deadline closes the owned process group',async()=>{
 const {runProcess}=await import('../scripts/run-task-quality.mjs');
 const result=await runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{},'',30);
 assert.notEqual(result.code,0);assert.ok(result.latencyMs<2000);
});
