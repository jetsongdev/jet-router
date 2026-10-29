import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const tq = fileURLToPath(new URL('../../task-quality/grade.mjs',import.meta.url));
export function gradeSingle({suite,slug,code, singleDir = join(root,'single')}) {
 if(!['tq','ss'].includes(suite)||!/^[A-Za-z0-9_-]+$/.test(slug)||typeof code!=='string') throw Error('invalid grade input');
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'ladder-grade-')));
 try {
  const solution=join(dir,'solution.mjs'), runner=join(dir,'runner.mjs');
  writeFileSync(solution,code);
  const checks=realpathSync(suite==='tq'?tq:resolve(singleDir,slug,'checks.mjs'));
  writeFileSync(runner,`try { const mod=await import(${JSON.stringify(pathToFileURL(solution).href)}); const grader=await import(${JSON.stringify(pathToFileURL(checks).href)}); let result; if (${JSON.stringify(suite)}==='tq') { const g=await grader.grade(${JSON.stringify(slug)},mod); result={...g,results:g.checks}; delete result.checks; } else { const results=[]; for(const [index,check] of grader.checks.entries()) { try { await check(mod); results.push({index,passed:true}); } catch(e) { results.push({index,passed:false,error:String(e)}); } } result={passed:results.every(x=>x.passed),passedChecks:results.filter(x=>x.passed).length,totalChecks:results.length,results}; } console.log(JSON.stringify(result)); } catch(e) { console.log(JSON.stringify({passed:false,passedChecks:0,totalChecks:0,results:[],error:String(e)})); }`);
  const p=spawnSync(process.execPath,['--permission',`--allow-fs-read=${dir}`,`--allow-fs-read=${checks}`,runner],{env:{},encoding:'utf8',timeout:5000,maxBuffer:65536});
  try {const result=JSON.parse(p.stdout.trim()); return {...result,passed:p.status===0&&result.passed===true};} catch {return {passed:false,passedChecks:0,totalChecks:0,results:[],error:'grader-timeout-or-invalid-output'};}
 } finally {rmSync(dir,{recursive:true,force:true});}
}
