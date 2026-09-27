import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {tasks} from '../eval/task-quality/tasks.mjs';
import {taskPrompt} from '../scripts/run-task-quality.mjs';
import {validateConfig,routingInput,argsFor,childEnv,parseResult,generateClaude,executePairs,summarizeClaude,validateRoutes} from '../scripts/claude-quality.mjs';
const config={model:'claude-opus-5-5',baseline:'xhigh',tasks:['ranges'],rounds:3,maxBudgetUsdPerRun:1};
const hash=x=>createHash('sha256').update(x).digest('hex');
const code="export function parseRanges(text){if(typeof text!=='string')throw new TypeError();if(!text.trim())return [];const out=new Set();for(const item of text.split(',')){const match=/^\\s*([+-]?\\d+)\\s*(?:\\.\\.\\s*([+-]?\\d+)\\s*)?$/.exec(item);if(!match)throw new RangeError();const a=Number(match[1]),b=Number(match[2]??match[1]);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a>b||b-a>=1000)throw new RangeError();for(let i=a;;i++){out.add(i===0?0:i);if(i===b)break;}}return [...out].sort((a,b)=>a-b);}";
function stream(id,options={}){
 return [{type:'assistant',message:{model:config.model,content:options.content??[]}},
 {type:'result',subtype:'success',is_error:false,session_id:id,num_turns:1,structured_output:{code},usage:{input_tokens:100,cache_read_input_tokens:800,cache_creation_input_tokens:200,output_tokens:50},total_cost_usd:.02,...options.result}].map(e=>JSON.stringify(e)).join('\n');
}
function routes(){return {config,complete:true,taskSha256:hash(JSON.stringify([tasks[0]])),graderSha256:hash(readFileSync(new URL('../eval/task-quality/grade.mjs',import.meta.url))),routes:[{task:'ranges',eligible:true,decision:{choice:'medium'}}]};}
test('model effort support rejects aliases and xhigh for older models before billing',()=>{
 assert.equal(validateConfig(config),config);
 for(const change of [{model:'opus'},{model:'claude-opus-4-6'},{rounds:10},{tasks:['unknown']},{tasks:['ranges','ranges']},{maxBudgetUsdPerRun:0}])assert.throws(()=>validateConfig({...config,...change}));
 assert.doesNotThrow(()=>validateConfig({...config,model:'claude-opus-4-6',baseline:'high'}));
 assert.equal(routingInput(tasks[0],config).effort.source,'user-reference');
});
test('CLI isolation keeps authentication, disables tools/customizations and aligns env effort',()=>{
 const args=argsFor(config,'medium','id');assert.ok(args.includes('--safe-mode'));assert.ok(args.includes('--restricted'));
 assert.equal(args[args.indexOf('--tools')+1],'');assert.ok(args.includes('--no-session-persistence'));
 assert.ok(!args.includes('--resume')&&!args.includes('--continue')&&!args.includes('--bare'));
 const parent={CLAUDE_CODE_EFFORT_LEVEL:'max',TYPESAFE_API_KEY:'secret',ANTHROPIC_API_KEY:'auth',MAX_THINKING_TOKENS:'1'};
 const env=childEnv('medium',parent);assert.equal(env.CLAUDE_CODE_EFFORT_LEVEL,'medium');assert.equal(env.ANTHROPIC_API_KEY,'auth');assert.ok(!('TYPESAFE_API_KEY'in env));assert.ok(!('MAX_THINKING_TOKENS'in env));assert.equal(parent.CLAUDE_CODE_EFFORT_LEVEL,'max');
});
test('Claude input includes uncached + read + write without fabricated reasoning',()=>{
 const r=parseResult(stream('id'),'id',config.model);assert.equal(r.usage.input_tokens,1100);assert.equal(r.usage.cached_input_tokens,800);assert.equal(r.usage.cache_write_input_tokens,200);assert.equal(r.usage.reasoning_output_tokens,null);assert.equal(r.reportedCostUsd,.02);
 assert.equal(parseResult(stream('id',{result:{total_cost_usd:undefined}}),'id',config.model).reportedCostUsd,null);
});
test('wrong session/model, tools, missing usage, quota and budget failures are rejected',()=>{
 assert.throws(()=>parseResult(stream('wrong'),'id',config.model));
 assert.throws(()=>parseResult(stream('id'),'id','claude-sonnet-5'));
 assert.throws(()=>parseResult(stream('id',{content:[{type:'tool_use',name:'Bash'}]}),'id',config.model));
 for(const result of [{usage:{}},{is_error:true},{subtype:'error_max_budget_usd'},{permission_denials:[{}]},{structured_output:{code:7}}])assert.throws(()=>parseResult(stream('id',{result}),'id',config.model));
 assert.equal(parseResult(stream('id',{content:[{type:'tool_use',name:'StructuredOutput'}]}),'id',config.model).structuredOutputToolCalls,1);
});
test('mock end-to-end uses fresh IDs/directories, grades saved code and verifies paired evidence',async()=>{
 const dirs=[],ids=[];
 const execute=async(command,args,options,input)=>{
  assert.equal(command,'claude');assert.equal(input,taskPrompt(tasks[0]));
  assert.ok(existsSync(options.cwd));dirs.push(options.cwd);
  const id=args[args.indexOf('--session-id')+1];ids.push(id);
  return {code:0,stdout:stream(id),latencyMs:10};
 };
 const report=await executePairs(routes(),(t,c,e)=>generateClaude(t,c,e,execute));
 assert.equal(report.complete,true);assert.equal(report.results.length,6);
 assert.deepEqual(report.results.map(r=>r.arm),['baseline','recommended','recommended','baseline','baseline','recommended']);
 assert.equal(new Set(ids).size,6);assert.equal(new Set(dirs).size,6);assert.ok(dirs.every(dir=>!existsSync(dir)));
 const summary=summarizeClaude(report);assert.equal(summary.baseline.passes,3);assert.equal(summary.recommended.passes,3);assert.equal(summary.regressions,0);assert.equal(summary.outputSavingPct,0);
 const artifact=mkdtempSync(join(tmpdir(),'claude-report-test-'));
 try{
  writeFileSync(join(artifact,'report.json'),JSON.stringify(report));
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/claude-quality.mjs',import.meta.url)),'report',artifact],{encoding:'utf8',timeout:10000});
  assert.equal(cli.status,0,cli.stderr);assert.ok(readFileSync(join(artifact,'REPORT.md'),'utf8').includes('ranges'));
  assert.equal(JSON.parse(readFileSync(join(artifact,'summary.json'),'utf8')).baseline.passes,3);
 }finally{rmSync(artifact,{recursive:true,force:true});}
 const changed=structuredClone(report);changed.results[0].code+=' ';assert.throws(()=>summarizeClaude(changed));
 const duplicate=structuredClone(report);duplicate.results[1].threadId=duplicate.results[0].threadId;assert.throws(()=>summarizeClaude(duplicate));
});
test('failed process stops immediately without retry or savings claim; partial report survives',async()=>{
 let calls=0,saved;
 const report=await executePairs(routes(),(t,c,e)=>generateClaude(t,c,e,async()=>{calls++;return {code:1,stdout:'secret stderr is never copied',latencyMs:3};}),r=>{saved=structuredClone(r);});
 assert.equal(calls,1);assert.equal(saved.results.length,1);assert.equal(report.complete,false);
 const summary=summarizeClaude(report);assert.equal(summary.comparable,false);assert.equal(summary.outputSavingPct,null);assert.equal(summary.failures,1);
 assert.ok(!JSON.stringify(report).includes('secret'));
});
test('no lower recommendation creates no generation calls and no spurious 100% saving',async()=>{
 const r=routes();r.routes[0]={task:'ranges',eligible:false,decision:{choice:'keep'}};
 const report=await executePairs(r,()=>{throw new Error('must not call');});
 assert.equal(report.results.length,0);assert.equal(summarizeClaude(report).outputSavingPct,null);
});

test('route decisions cannot mislabel a keep or an unsupported effort as a downshift',()=>{
 for(const choice of ['keep','xhigh','max','ultra']){const r=routes();r.routes[0].decision.choice=choice;assert.throws(()=>validateRoutes(r));}
 const incomplete=routes();incomplete.complete=false;assert.throws(()=>validateRoutes(incomplete));
});
