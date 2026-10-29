import {mkdtemp,cp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const base=dirname(fileURLToPath(import.meta.url));
export async function gradeWorkspace(slug, dir) {
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error('invalid slug');
 const task=join(base,slug), meta=JSON.parse(await readFile(join(task,'meta.json'),'utf8'));
 const original=await readFile(join(task,'fixture/test/public.test.mjs'));
 let publicTestsUnmodified=false; try {publicTestsUnmodified=original.equals(await readFile(join(dir,'test/public.test.mjs')))} catch {}
 const {checks}=await import(new URL(`./${slug}/hidden/checks.mjs`,import.meta.url));
 const results=[]; const deadline=Date.now()+meta.hiddenTimeoutMs;
 for(let index=0;index<checks.length;index++) {
  const remaining=deadline-Date.now();
  if(remaining<=0){results.push({index,ok:false,error:'grading timeout'});continue}
  const tmp=await mkdtemp(join(tmpdir(),'agent-grade-'));
  try {await cp(dir,join(tmp,'workspace'),{recursive:true});
   const result=await new Promise(resolve=>{const child=spawn(process.execPath,[join(base,'grade-agent.mjs'),'--worker',slug,String(index),join(tmp,'workspace'),tmp],{stdio:['ignore','pipe','pipe'],detached:true});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},Math.min(remaining,45000));child.on('error',e=>{clearTimeout(timer);resolve({index,ok:false,error:e.message})});child.on('close',(code,signal)=>{clearTimeout(timer);try{process.kill(-child.pid,'SIGKILL')}catch{};if(code===0)resolve({index,ok:true});else resolve({index,ok:false,error:(err||out||signal||`exit ${code}`).slice(0,2000)})})});results.push(result);
  } finally {await rm(tmp,{recursive:true,force:true})}
 }
 const passedChecks=results.filter(r=>r.ok).length;return {passed:publicTestsUnmodified&&passedChecks===checks.length,passedChecks,totalChecks:checks.length,results,publicTestsUnmodified};
}
if(process.argv[2]==='--worker'){
 const [, , ,slug,index,dir,temp]=process.argv;
 const {checks}=await import(new URL(`./${slug}/hidden/checks.mjs`,import.meta.url));
 const {readFile,writeFile,mkdtemp}=await import('node:fs/promises');
 const runNode=(args,{input,timeoutMs=10000,nodeOptions=[]}={})=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[...nodeOptions,...args],{cwd:dir,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,stdout,stderr,signal})});child.stdin.end(input)});
 try {await checks[Number(index)]({dir,runNode,readFile:rel=>readFile(join(dir,rel),'utf8'),writeFile:(rel,text)=>writeFile(join(dir,rel),text),tmpDir:()=>mkdtemp(join(temp,'data-'))});} catch(e){console.error(e.stack||e);process.exitCode=1}
}
