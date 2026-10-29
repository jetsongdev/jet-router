import assert from 'node:assert/strict'; import {join} from 'node:path'; import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
async function run(c,text,args=['0','10'],options={}){const d=await c.tmpDir(),file=join(d,'events');await writeFile(file,text);return c.runNode(['aggregate.mjs',file,...args],options)}const row=(user,time,bytes)=>JSON.stringify({user,time,bytes});async function good(c,text,args,expected){const r=await run(c,text,args);assert.equal(r.code,0);assert.equal(r.stdout,JSON.stringify(expected)+'\n')}async function bad(c,text,args=['0','10']){const r=await run(c,text,args);assert.equal(r.code,2);assert.equal(r.stdout,'')}
export const checks=[
 c=>good(c,[row('z',1,2),row('a',2,3),row('z',3,4)].join('\n'),['0','10'],[{user:'a',count:1,bytes:3},{user:'z',count:2,bytes:6}]),
 c=>good(c,[row('a',4,1),row('a',5,2),row('a',9,4),row('a',10,8)].join('\n'),['5','10'],[{user:'a',count:2,bytes:6}]),
 async c=>{await good(c,row('a',5,1),['5','5'],[]);await good(c,'',['0','1'],[])},
 c=>good(c,'  \r\n'+row(' a',1,0)+'\r\n'+row('a',1,1)+'\r\n',['0','2'],[{user:' a',count:1,bytes:0},{user:'a',count:1,bytes:1}]),
 async c=>{for(const s of ['not json','{"user":"a","time":99}'])await bad(c,s)},
 async c=>{for(const x of [{user:'',time:1,bytes:1},{user:'a',time:-1,bytes:1},{user:'a',time:1.5,bytes:1},{user:'a',time:1,bytes:-1},{user:'a',time:1,bytes:1.5},{user:'a',time:1,bytes:9007199254740992}])await bad(c,JSON.stringify(x))},
 async c=>{for(const args of [[],['0'],['0','1','2'],['+1','2'],['1.0','2'],['-1','2'],['2','1']])await bad(c,'',args)},
 c=>bad(c,[row('a',1,Number.MAX_SAFE_INTEGER),row('a',1,1)].join('\n')),
 c=>good(c,[row('a',1,Number.MAX_SAFE_INTEGER),row('a',1,0)].join('\n'),['0','2'],[{user:'a',count:2,bytes:Number.MAX_SAFE_INTEGER}]),
 async c=>{const rows=[],map=new Map();for(let i=0;i<1000;i++){const user='u'+(i%13),time=i%20,bytes=i%7;rows.push(row(user,time,bytes));if(time>=3&&time<12){const x=map.get(user)||{user,count:0,bytes:0};x.count++;x.bytes+=bytes;map.set(user,x)}}await good(c,rows.join('\n'),['3','12'],[...map.values()].sort((a,b)=>a.user<b.user?-1:a.user>b.user?1:0))},
 async c=>{const d=await c.tmpDir(),file=join(d,'million.jsonl');const {open}=await import('node:fs/promises');const f=await open(file,'w');try{const chunk=(row('a',1,2)+'\n').repeat(10000);for(let i=0;i<100;i++)await f.write(chunk)}finally{await f.close()}const r=await c.runNode(['aggregate.mjs',file,'0','2'],{nodeOptions:['--max-old-space-size=64'],timeoutMs:30000});assert.equal(r.code,0,r.stderr);assert.equal(r.stdout,JSON.stringify([{user:'a',count:1000000,bytes:2000000}])+'\n')}];
