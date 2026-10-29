import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,cp,rm,writeFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {gradeWorkspace} from '../agent/grade-agent.mjs';
const base=join(dirname(fileURLToPath(import.meta.url)),'../agent');const tasks=['site-route-repair','calc-decimal-cli','link-lint-scope','game-round-reducer','log-window-aggregate','batch-rollback-debug'];
for(const slug of tasks)test(slug,{timeout:600000},async()=>{const temp=await mkdtemp(join(tmpdir(),'agent-test-'));const task=join(base,slug),workspace=join(temp,'ws');async function fresh(overlay){await rm(workspace,{recursive:true,force:true});await cp(join(task,'fixture'),workspace,{recursive:true});if(overlay)await cp(join(task,overlay),workspace,{recursive:true,force:true})}try{
 await fresh();let grade=await gradeWorkspace(slug,workspace);assert.ok(grade.passedChecks<grade.totalChecks,'fixture must fail a hidden check');
 await fresh('solution');grade=await gradeWorkspace(slug,workspace);assert.equal(grade.passed,true,JSON.stringify(grade.results.filter(x=>!x.ok)));const pub=spawnSync(process.execPath,['--test','test/public.test.mjs'],{cwd:workspace,encoding:'utf8',timeout:30000});assert.equal(pub.status,0,pub.stdout+pub.stderr);
 const mutants=await readdir(join(task,'mutants'));assert.ok(mutants.length>=3);for(const mutant of mutants){await fresh('mutants/'+mutant);grade=await gradeWorkspace(slug,workspace);assert.ok(grade.passedChecks<grade.totalChecks,`${mutant} survived`)}
 await fresh('solution');await writeFile(join(workspace,'test/public.test.mjs'),'// altered\n');grade=await gradeWorkspace(slug,workspace);assert.equal(grade.publicTestsUnmodified,false);assert.equal(grade.passed,false);
 }finally{await rm(temp,{recursive:true,force:true})}});

test('site reading order supports built-in file APIs and detects reverse order', {timeout:120000}, async()=>{
 const temp=await mkdtemp(join(tmpdir(),'site-order-test-'));
 const task=join(base,'site-route-repair'), workspace=join(temp,'workspace');
 try {
  await cp(join(task,'fixture'),workspace,{recursive:true});
  await cp(join(task,'solution'),workspace,{recursive:true,force:true});
  const postPath=join(workspace,'src/posts.mjs');
  const original=await (await import('node:fs/promises')).readFile(postPath,'utf8');
  const variants=[
   ["import { readFileSync } from 'fs';", "const text = readFileSync(path, 'utf8');"],
   ["import { createReadStream } from 'node:fs';", "let text = ''; for await (const chunk of createReadStream(path, {encoding:'utf8'})) text += chunk;"],
   ["import { readFile } from 'fs'; import { promisify } from 'node:util';", "const text = await promisify(readFile)(path, 'utf8');"],
   ["import { open } from 'fs/promises';", "const h = await open(path); let text; try { text = await h.readFile('utf8'); } finally { await h.close(); }"],
   ["import { openSync, readFileSync, closeSync } from 'node:fs';", "const fd=openSync(path,'r'); let text; try { text=readFileSync(fd,'utf8'); } finally { closeSync(fd); }"],
   ["import { openSync, readSync, closeSync } from 'node:fs';", "const fd=openSync(path,'r'); let text=''; try { const b=Buffer.alloc(128); let n; while((n=readSync(fd,b,0,b.length,null))) text+=b.toString('utf8',0,n); } finally { closeSync(fd); }"],
   ["import { open } from 'node:fs/promises';", "const h=await open(path); let text=''; try { for await (const chunk of h.createReadStream({encoding:'utf8'})) text+=chunk; } finally { await h.close(); }"],
   ["import { openSync, createReadStream } from 'fs';", "const fd=openSync(path,'r'); let text=''; for await (const chunk of createReadStream(null,{fd,encoding:'utf8'})) text+=chunk;"],
   ["import { open, read, close } from 'node:fs'; import { promisify } from 'node:util';", "const fd=await promisify(open)(path,'r'); let text=''; try { const b=Buffer.alloc(128); let n; while((n=(await promisify(read)(fd,b,0,b.length,null)).bytesRead)) text+=b.toString('utf8',0,n); } finally { await promisify(close)(fd); }"],
  ];
  const run=()=>spawnSync(process.execPath,[join(base,'grade-agent.mjs'),'--worker','site-route-repair','9',workspace,temp],{encoding:'utf8',timeout:20000});
  for(const [imp,read] of variants){await writeFile(postPath,original.replace("import { readFile } from 'node:fs/promises';",imp).replace("const text = await readFile(path, 'utf8');",read));const r=run();assert.equal(r.status,0,`${imp}\n${r.stderr}`)}
  await writeFile(postPath,original);
  const buildPath=join(workspace,'build.mjs');const build=await (await import('node:fs/promises')).readFile(buildPath,'utf8');await writeFile(buildPath,build.replace('.sort();','.sort().reverse();'));const reversed=run();assert.notEqual(reversed.status,0,'reverse order must fail');assert.match(reversed.stderr,/AssertionError/);
 } finally {await rm(temp,{recursive:true,force:true})}
});

test('site escaping accepts equivalent numeric character references', {timeout:120000}, async()=>{
 const temp=await mkdtemp(join(tmpdir(),'site-escape-test-'));const task=join(base,'site-route-repair'), workspace=join(temp,'workspace');
 try {await cp(join(task,'fixture'),workspace,{recursive:true});await cp(join(task,'solution'),workspace,{recursive:true,force:true});const render=join(workspace,'src/render.mjs');const original=await (await import('node:fs/promises')).readFile(render,'utf8');for(const entity of ['&#39;','&#039;','&#x27;','&#X0027;','&apos;']){await writeFile(render,original.replace('&#39;',entity));const r=spawnSync(process.execPath,[join(base,'grade-agent.mjs'),'--worker','site-route-repair','2',workspace,temp],{encoding:'utf8',timeout:20000});assert.equal(r.status,0,`${entity}\n${r.stderr}`)}}finally{await rm(temp,{recursive:true,force:true})}
});
