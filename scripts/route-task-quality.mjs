import {readFileSync,writeFileSync,existsSync,rmSync,statSync} from 'node:fs';
import {tasks} from '../eval/task-quality/tasks.mjs';
import {taskPrompt} from './run-task-quality.mjs';
import {adapter,hash} from './research-quality.mjs';
import {parseKeyFile} from './evaluate-jev.mjs';
import {validJevKey} from '../src/providers/jev.js';
let instance;
try {
 const [configPath,keyPath,output]=process.argv.slice(2);
 if(!output||existsSync(output)||statSync(keyPath).size>65536)throw new Error('arguments');
 const config=JSON.parse(readFileSync(configPath,'utf8'));const key=parseKeyFile(readFileSync(keyPath,'utf8'));
 if(!validJevKey(key)||!['dev','holdout'].includes(config.split)||typeof config.addition!=='string')throw new Error('input');
 instance=await adapter(config.addition);
 const rows=[],efforts={};
 for(const task of tasks.filter(t=>t.split===config.split)) {
  const input={host:'codex',prompt:taskPrompt(task),cloudConsent:true,
   target:{model:'gpt-6-astra',source:'host',supportedEfforts:['low','medium','high','xhigh','max','ultra']},
   effort:{value:'medium',source:'user-reference'},event:{sessionId:'task-quality',turnId:task.id,correlated:true},context:{source:'prompt-only',missingRequired:false}};
  const result=await instance.run(input,key);rows.push({id:task.id,requestSha256:hash(instance.prepare(input).request),...result});
  if(!result.decision)break;
  efforts[task.id]=result.decision.choice==='keep'?'medium':result.decision.choice;
 }
 const complete=rows.every(r=>r.decision)&&rows.length===tasks.filter(t=>t.split===config.split).length;
 writeFileSync(output,JSON.stringify({split:config.split,rounds:2,efforts,routing:rows,complete,config},null,2),{flag:'wx'});
 console.log(JSON.stringify({complete,efforts}));process.exitCode=complete?0:1;
} catch {console.error('task-routing-failed');process.exitCode=1;}
finally{if(instance)rmSync(instance.dir,{recursive:true,force:true});}
