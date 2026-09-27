// Independent CLI comparison, not plugin enforce. No live calls in plan/report.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,rmSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {tasks} from '../eval/task-quality/tasks.mjs';
import {taskPrompt,gradeCode,runProcess} from './run-task-quality.mjs';
import {prepareRoutingRequest,HARNESS_VERSIONS} from '../src/harness.js';
import {classifyJev} from '../mcp/shadow.mjs';
import {parseKeyFile} from './evaluate-jev.mjs';
import {validJevKey} from '../src/providers/jev.js';
const levels=['low','medium','high','xhigh'];
// Pinned explicit IDs only; update against official model-config docs before extending.
const supports={
 'claude-opus-5-5':levels,'claude-opus-5':levels,'claude-sonnet-5':levels,
 'claude-opus-4-8':levels,'claude-opus-4-7':levels,
 'claude-opus-4-6':levels.slice(0,3),'claude-sonnet-4-6':levels.slice(0,3),
};
const schema={type:'object',properties:{code:{type:'string'}},required:['code'],additionalProperties:false};
const sha=x=>createHash('sha256').update(x).digest('hex');
const graderUrl=new URL('../eval/task-quality/grade.mjs',import.meta.url);
const save=(path,data)=>writeFileSync(path,JSON.stringify(data,null,2)+'\n');
export function validateConfig(c){
 assert.ok(supports[c.model]?.includes(c.baseline),'unsupported-model-or-effort');
 assert.ok([1,3].includes(c.rounds),'rounds');
 assert.ok(Array.isArray(c.tasks)&&c.tasks.length>0&&new Set(c.tasks).size===c.tasks.length&&c.tasks.every(id=>tasks.some(t=>t.id===id)),'tasks');
 assert.ok(Number.isFinite(c.maxBudgetUsdPerRun)&&c.maxBudgetUsdPerRun>0&&c.maxBudgetUsdPerRun<=10,'budget');
 return c;
}
export function routingInput(task,c){
 return {host:'claude-code',prompt:taskPrompt(task),cloudConsent:true,
  target:{model:c.model,source:'host',supportedEfforts:supports[c.model]},
  effort:{value:c.baseline,source:'user-reference'},
  event:{sessionId:'claude-quality',turnId:task.id,correlated:true},context:{source:'prompt-only',missingRequired:null}};
}
export function argsFor(c,effort,sessionId){
 assert.ok(supports[c.model]?.includes(effort));
 return ['--safe-mode','--restricted','-p','--no-session-persistence','--session-id',sessionId,
  '--model',c.model,'--effort',effort,'--output-format','stream-json','--verbose',
  '--json-schema',JSON.stringify(schema),'--tools','','--disallowedTools','mcp__*',
  '--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--settings','{"disableAllHooks":true}',
  '--max-turns','2','--max-budget-usd',String(c.maxBudgetUsdPerRun)];
}
export function childEnv(effort,env=process.env){
 const result={...env,CLAUDE_CODE_EFFORT_LEVEL:effort,CLAUDE_CODE_DISABLE_WORKFLOWS:'1'};
 delete result.TYPESAFE_API_KEY;delete result.MAX_THINKING_TOKENS;delete result.CLAUDE_CODE_SIMPLE;
 return result;
}
export function parseResult(stdout,sessionId,model){
 const events=stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const results=events.filter(e=>e.type==='result');assert.equal(results.length,1,'result-count');
 const r=results[0];assert.equal(r.is_error,false,'cli-error');assert.equal(r.subtype,'success','cli-status');
 assert.equal(r.session_id,sessionId,'session-id');
 const models=[...new Set(events.filter(e=>e.type==='assistant').map(e=>e.message?.model).filter(Boolean))];
 assert.ok(models.length>0&&models.every(name=>name===model||new RegExp(`^${model}-[0-9]{8}$`).test(name)),'model-mismatch');
 const toolNames=events.filter(e=>e.type==='assistant').flatMap(e=>e.message?.content??[]).filter(b=>b.type==='tool_use').map(b=>b.name);
 assert.ok(toolNames.every(name=>name==='StructuredOutput'),'unexpected-tool');
 assert.ok(!(r.permission_denials?.length),'permission-denial');
 const u=r.usage;
 for(const field of ['input_tokens','cache_read_input_tokens','cache_creation_input_tokens','output_tokens'])assert.ok(Number.isSafeInteger(u?.[field])&&u[field]>=0,'usage-missing');
 const code=r.structured_output?.code;assert.ok(typeof code==='string'&&code.length>0&&code.length<=65536,'code');
 const reportedCostUsd=Number.isFinite(r.total_cost_usd)&&r.total_cost_usd>=0?r.total_cost_usd:null;
 return {code,codeSha256:sha(code),observedModels:models,usage:{input_tokens:u.input_tokens+u.cache_read_input_tokens+u.cache_creation_input_tokens,
  uncached_input_tokens:u.input_tokens,cached_input_tokens:u.cache_read_input_tokens,cache_write_input_tokens:u.cache_creation_input_tokens,
  output_tokens:u.output_tokens,reasoning_output_tokens:null},reportedCostUsd,numTurns:r.num_turns??null,structuredOutputToolCalls:toolNames.length,usedTools:false};
}
export async function generateClaude(task,c,effort,execute=runProcess){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'jet-router-claude-'))),sessionId=randomUUID();
 const common={task:task.id,model:c.model,requestedEffort:effort,threadId:sessionId,promptSha256:sha(taskPrompt(task)),effortEvidence:'cli-and-child-env; server-effective-effort-unobserved'};
 try{
  const execution=await execute('claude',argsFor(c,effort,sessionId),{cwd:dir,env:childEnv(effort)},taskPrompt(task),180000);
  try{
   assert.equal(execution.code,0);const parsed=parseResult(execution.stdout,sessionId,c.model);
   const grade=gradeCode(task.id,parsed.code);
   return {...common,...parsed,grade,passed:grade.passed,latencyMs:execution.latencyMs};
  }catch{return {...common,passed:false,error:'generation-or-evidence-invalid',latencyMs:execution.latencyMs};}
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function preflight(){
 const check=spawnSync('claude',['--safe-mode','--version'],{encoding:'utf8',timeout:10000});
 const version=check.stdout?.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
 assert.equal(check.status,0,'claude-unavailable');assert.ok(version,'version');
 const [major,minor,patch]=version.slice(1).map(Number);
 assert.ok(major>2||(major===2&&(minor>1||(minor===1&&patch>=283))),'requires-2.1.283');
 return version[0];
}
export function validateRoutes(report){
 const c=validateConfig(report.config);assert.equal(report.complete,true);
 assert.deepEqual(report.routes.map(r=>r.task),c.tasks);
 for(const row of report.routes){
  const choice=row.decision?.choice;
  assert.ok(choice==='keep'||supports[c.model].includes(choice),'invalid-route-choice');
  assert.equal(row.eligible,choice!=='keep'&&levels.indexOf(choice)<levels.indexOf(c.baseline),'invalid-eligibility');
 }
 return c;
}
export async function executePairs(routeReport,generate,onRow=()=>{}){
 const c=validateRoutes(routeReport),selected=routeReport.routes.filter(r=>r.eligible);
 const report={kind:'claude-effort-comparison',routes:routeReport,startedAt:new Date().toISOString(),results:[],complete:false};
 for(let round=0;round<c.rounds;round++)for(const [index,route]of selected.entries()){
  for(const arm of (round+index)%2?['recommended','baseline']:['baseline','recommended']){
   const row=await generate(tasks.find(t=>t.id===route.task),c,arm==='baseline'?c.baseline:route.decision.choice);
   report.results.push({...row,round,arm,order:report.results.length});onRow(report);
   if(row.error)return report;
  }
 }
 report.complete=true;report.finishedAt=new Date().toISOString();onRow(report);return report;
}
export function summarizeClaude(report,regrade=true){
 const routes=report.routes,c=validateRoutes(routes),selected=routes.routes.filter(r=>r.eligible);
 assert.equal(routes.taskSha256,sha(JSON.stringify(c.tasks.map(id=>tasks.find(t=>t.id===id)))));
 assert.equal(routes.graderSha256,sha(readFileSync(graderUrl)));
 const seen=new Set(),cells=new Set();
 for(const [index,row]of report.results.entries()){
  assert.equal(row.order,index);assert.ok(row.threadId&&!seen.has(row.threadId));seen.add(row.threadId);
  const route=selected.find(r=>r.task===row.task);assert.ok(route);
  assert.ok(Number.isInteger(row.round)&&row.round>=0&&row.round<c.rounds&&['baseline','recommended'].includes(row.arm));
  const cell=`${row.task}:${row.round}:${row.arm}`;assert.ok(!cells.has(cell));cells.add(cell);
  assert.equal(row.requestedEffort,row.arm==='baseline'?c.baseline:route.decision.choice);
  assert.equal(row.model,c.model);assert.equal(row.promptSha256,sha(taskPrompt(tasks.find(t=>t.id===row.task))));
  if(row.error)continue;
  assert.equal(row.usedTools,false);assert.equal(row.codeSha256,sha(row.code));
  if(regrade)assert.deepEqual(gradeCode(row.task,row.code),row.grade);
  assert.equal(row.passed,row.grade.passed);
 }
 if(report.complete){assert.equal(report.results.length,selected.length*c.rounds*2);assert.ok(report.results.every(r=>!r.error));}
 const total=(arm,task=null)=>{const rows=report.results.filter(r=>r.arm===arm&&!r.error&&(!task||r.task===task));const sum=key=>rows.reduce((n,r)=>n+r.usage[key],0);
  return {runs:rows.length,passes:rows.filter(r=>r.passed).length,input:sum('input_tokens'),uncachedInput:sum('uncached_input_tokens'),cacheRead:sum('cached_input_tokens'),cacheWrite:sum('cache_write_input_tokens'),output:sum('output_tokens'),latencyMs:rows.reduce((n,r)=>n+r.latencyMs,0),reportedCostUsd:rows.every(r=>r.reportedCostUsd!==null)?rows.reduce((n,r)=>n+r.reportedCostUsd,0):null};};
 const baseline=total('baseline'),recommended=total('recommended');let regressions=0;
 for(const route of selected)for(let round=0;round<c.rounds;round++){
  const pair=report.results.filter(r=>r.task===route.task&&r.round===round);
  if(pair.find(r=>r.arm==='baseline')?.passed&&pair.find(r=>r.arm==='recommended')?.passed===false&&!pair.find(r=>r.arm==='recommended')?.error)regressions++;
 }
 const comparable=report.complete&&selected.length>0;
 return {complete:report.complete,comparable,model:c.model,baselineEffort:c.baseline,baseline,recommended,regressions,
  perTask:selected.map(r=>({task:r.task,effort:r.decision.choice,baseline:total('baseline',r.task),recommended:total('recommended',r.task)})),
  excluded:routes.routes.filter(r=>!r.eligible).map(r=>({task:r.task,choice:r.decision.choice})),
  outputSavingPct:comparable&&baseline.output>0?100*(baseline.output-recommended.output)/baseline.output:null,
  reportedCostSavingPct:comparable&&baseline.reportedCostUsd>0&&recommended.reportedCostUsd!==null?100*(baseline.reportedCostUsd-recommended.reportedCostUsd)/baseline.reportedCostUsd:null,
  actualBilledUsd:null,routerCostUsd:null,failures:report.results.filter(r=>r.error).length};
}
async function main(){
 const [mode,arg,keyPath,out]=process.argv.slice(2);
 if(mode==='plan'||mode==='route'){
  const c=validateConfig(JSON.parse(readFileSync(arg,'utf8'))),version=preflight();
  if(mode==='plan'){console.log(JSON.stringify({liveCalls:0,claudeVersion:version,config:c,maxJevCalls:c.tasks.length,maxClaudeCalls:c.tasks.length*c.rounds*2,maxConfiguredBudgetUsd:c.tasks.length*c.rounds*2*c.maxBudgetUsdPerRun,note:'budget is per-run CLI estimate, not a guaranteed billing cap; account/model access untested'}));return;}
  assert.ok(out&&!existsSync(out));assert.ok(statSync(keyPath).size<=65536);
  const key=parseKeyFile(readFileSync(keyPath,'utf8'));assert.ok(validJevKey(key));mkdirSync(out);
  const report={config:c,claudeVersion:version,versions:HARNESS_VERSIONS,taskSha256:sha(JSON.stringify(c.tasks.map(id=>tasks.find(t=>t.id===id)))),graderSha256:sha(readFileSync(graderUrl)),routes:[],complete:false};
  for(const id of c.tasks){
   const input=routingInput(tasks.find(t=>t.id===id),c),prepared=prepareRoutingRequest(input);assert.equal(prepared.status,'ready');
   const began=performance.now(),result=await classifyJev(input,key),choice=result.decision?.choice;
   report.routes.push({task:id,requestSha256:sha(JSON.stringify(prepared.request)),...result,latencyMs:Math.round(performance.now()-began),eligible:supports[c.model].includes(choice)&&levels.indexOf(choice)<levels.indexOf(c.baseline)});
   save(join(out,'routes.json'),report);assert.ok(choice&&prepared.choices.includes(choice),'routing-failed');
  }
  report.complete=true;save(join(out,'routes.json'),report);console.log(JSON.stringify({complete:true,eligible:report.routes.filter(r=>r.eligible).length}));
 }else if(mode==='run'){
  const routes=JSON.parse(readFileSync(join(arg,'routes.json'),'utf8'));validateRoutes(routes);preflight();
  assert.equal(routes.graderSha256,sha(readFileSync(graderUrl)));assert.equal(routes.taskSha256,sha(JSON.stringify(routes.config.tasks.map(id=>tasks.find(t=>t.id===id)))));
  const path=join(arg,'report.json');assert.ok(!existsSync(path),'output-exists');
  const result=await executePairs(routes,generateClaude,r=>{save(path,r);const row=r.results.at(-1);if(row)console.log(JSON.stringify({task:row.task,round:row.round,arm:row.arm,passed:row.passed,error:row.error,usage:row.usage}));});
  if(!result.complete)process.exitCode=1;
 }else if(mode==='report'){
  const report=JSON.parse(readFileSync(join(arg,'report.json'),'utf8')),s=summarizeClaude(report);save(join(arg,'summary.json'),s);
  const rows=['# Claude effort 비교 결과','',`모델: ${s.model}; 기본 effort: ${s.baselineEffort}. 완료: ${s.complete}; 비교 가능: ${s.comparable}.`,
   '', '| 항목 | 기본 | 추천 |','| --- | ---: | ---: |'];
  for(const key of ['runs','passes','input','uncachedInput','cacheRead','cacheWrite','output','latencyMs','reportedCostUsd'])rows.push(`| ${key} | ${s.baseline[key]??'unknown'} | ${s.recommended[key]??'unknown'} |`);
  rows.push('',`출력 절감률: ${s.outputSavingPct?.toFixed(2)??'N/A'}%; CLI 추정비용 절감률: ${s.reportedCostSavingPct?.toFixed(2)??'N/A'}%; 품질 회귀: ${s.regressions}; 실행/증거 실패: ${s.failures}.`,
   '', '캐시 읽기·쓰기 포함. reportedCostUsd는 CLI 추정값이며 청구액이 아니다. Jev 비용 제외. 추론 토큰 별도 계측 없음. 서버 적용 effort 미확인. 독립 세션이지만 서버 캐시는 공유될 수 있다. 부분 실행은 절감 결론을 내리지 않는다.',
   '',`제외: ${s.excluded.map(r=>`${r.task}=${r.choice}`).join(', ')||'없음'}.`, '', '제품 enforce 검증이 아닌 CLI 명시적 effort 비교다. 같은 이름의 effort라도 모델 간 동일한 추론량을 뜻하지 않는다.');
  rows.push('', '| 과제 | 추천 | 기본 통과 | 추천 통과 | 기본 출력 | 추천 출력 |', '| --- | --- | ---: | ---: | ---: | ---: |');
  for(const t of s.perTask)rows.push(`| ${t.task} | ${t.effort} | ${t.baseline.passes}/${t.baseline.runs} | ${t.recommended.passes}/${t.recommended.runs} | ${t.baseline.output} | ${t.recommended.output} |`);
  writeFileSync(join(arg,'REPORT.md'),rows.join('\n')+'\n');console.log(JSON.stringify(s));
 }else throw new Error('Use: plan CONFIG | route CONFIG KEY_FILE OUT_DIR | run OUT_DIR | report OUT_DIR');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){main().catch(()=>{console.error('claude-quality-stopped: inspect command/config, CLI version, or saved partial report; raw provider output is not logged');process.exitCode=1;});}
