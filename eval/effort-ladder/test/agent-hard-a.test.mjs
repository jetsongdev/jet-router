import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gradeWorkspace} from '../agent/grade-agent.mjs';
const base=join(dirname(fileURLToPath(import.meta.url)),'../agent');
const slugs=['symptom-invoice-drift','symptom-sync-dup','perf-route-planner','perf-window-stats'];
for(const slug of slugs) test(slug,{timeout:600000},async()=>{
 const temp=await mkdtemp(join(tmpdir(),'hard-a-')),task=join(base,slug),workspace=join(temp,'ws');
 async function fresh(overlay){await rm(workspace,{recursive:true,force:true});await cp(join(task,'fixture'),workspace,{recursive:true});if(overlay)await cp(join(task,overlay),workspace,{recursive:true,force:true})}
 try {
  await fresh();let g=await gradeWorkspace(slug,workspace);assert.ok(g.passedChecks<g.totalChecks,'fixture passed');assert.ok(g.totalChecks>=15);
  await fresh('solution');g=await gradeWorkspace(slug,workspace);assert.equal(g.publicTestsUnmodified,true);assert.equal(g.passed,true,JSON.stringify(g.results.filter(x=>!x.ok)));
  const pub=spawnSync(process.execPath,['--test','test/public.test.mjs'],{cwd:workspace,encoding:'utf8',timeout:30000});assert.equal(pub.status,0,pub.stdout+pub.stderr);
  const mutants=await readdir(join(task,'mutants'));assert.ok(mutants.length>=3);for(const mutant of mutants){await fresh('mutants/'+mutant);g=await gradeWorkspace(slug,workspace);assert.ok(g.passedChecks<g.totalChecks,`${mutant} survived`)}
 } finally {await rm(temp,{recursive:true,force:true})}
});
async function files(root){const out=[];for(const e of await readdir(root,{withFileTypes:true})){const p=join(root,e.name);if(e.isDirectory())out.push(...await files(p));else if(e.isFile())out.push(p)}return out}
test('task structure and prompt limits',async()=>{
 for(const slug of slugs){const task=join(base,slug),fixture=await files(join(task,'fixture'));const source=fixture.filter(p=>p.endsWith('.mjs'));const lines=(await Promise.all(source.map(p=>readFile(p,'utf8')))).reduce((n,s)=>n+s.split('\n').length-1,0);assert.ok(fixture.length>=(slug.startsWith('symptom')?15:8)&&fixture.length<=25,`${slug}: ${fixture.length}`);assert.ok(lines<=2500);const prompt=await readFile(join(task,'prompt.txt'),'utf8');const words=prompt.trim().split(/\s+/).length;assert.ok(words>=150&&words<=400,`${slug}: ${words} words`);assert.doesNotMatch(prompt,/(?:^|\n)\s*\d+[.)]\s|\b(?:Exception|Note)\s*:/);const meta=JSON.parse(await readFile(join(task,'meta.json'),'utf8'));assert.deepEqual(meta,{maxTurns:36,hiddenTimeoutMs:180000,budgetUsd:{low:1.5,medium:1.5,high:2,xhigh:3}})}
});


test('invoice rounding and tie-breaking can hide each other',async()=>{
 const task=join(base,'symptom-invoice-drift');
 const temp=await mkdtemp(join(tmpdir(),'invoice-mask-'));
 const workspace=join(temp,'ws');
 const script=`import {createInvoice} from './src/invoice.mjs';
 const input={customer:'A',discountCents:33,lines:[
  {id:'c',quantity:1,unitMills:293500,taxBasisPoints:5000},
  {id:'b',quantity:1,unitMills:126500,taxBasisPoints:0},
  {id:'a',quantity:1,unitMills:7500,taxBasisPoints:10000}]};
 console.log(createInvoice(input).totalCents);`;
 try {
  await cp(join(task,'fixture'),workspace,{recursive:true});
  await writeFile(join(workspace,'probe.mjs'),script);
  const probe=()=>{const r=spawnSync(process.execPath,['probe.mjs'],{cwd:workspace,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);return Number(r.stdout)};
  assert.equal(probe(),539);
  await cp(join(task,'solution/src/rounding.mjs'),join(workspace,'src/rounding.mjs'));
  assert.equal(probe(),540);
  await cp(join(task,'solution'),workspace,{recursive:true,force:true});
  assert.equal(probe(),539);
 } finally {await rm(temp,{recursive:true,force:true})}
});
