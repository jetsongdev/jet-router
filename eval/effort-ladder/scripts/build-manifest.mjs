import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tasks } from '../../task-quality/tasks.mjs';
import { sha256, taskId } from '../lib/ids.mjs';
import { prompt } from '../lib/single-prompt.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function files(dir) {return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(d=>d.isDirectory()?files(join(dir,d.name)):d.isFile()?[join(dir,d.name)]:[]);}
export function buildManifest(base=root) {
 const rows=tasks.map(t=>({task_id:taskId('tq',t.id),suite:'tq',slug:t.id,kind:'single',prompt:prompt(t.spec),prompt_sha256:sha256(prompt(t.spec)),fixture_sha256:null}));
 for(const [suite,folder,name,kind] of [['ss','single','spec.txt','single'],['ag','agent','prompt.txt','agent']]) {
  const dir=join(base,folder); if(!existsSync(dir)){console.warn(`warning: ${folder} missing`);continue;}
  for(const entry of readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
   const path=join(dir,entry.name,name), fixture=join(dir,entry.name,'fixture');
   if(!existsSync(path)||(suite==='ag'&&!existsSync(fixture))) {console.warn(`warning: incomplete ${suite}/${entry.name}`);continue;}
   const raw=readFileSync(path,'utf8'); const p=suite==='ss'?prompt(raw):raw;
   const digest=suite==='ag'?sha256(JSON.stringify(files(fixture).map(f=>[relative(fixture,f).split('\\').join('/'),sha256(readFileSync(f))]))):null;
   rows.push({task_id:taskId(suite,entry.name),suite,slug:entry.name,kind,prompt:p,prompt_sha256:sha256(p),fixture_sha256:digest});
  }
 }
 return rows;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) writeFileSync(join(root,'tasks-manifest.json'),JSON.stringify(buildManifest(),null,2)+'\n');
