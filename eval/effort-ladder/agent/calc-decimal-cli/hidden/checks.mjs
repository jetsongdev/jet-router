import assert from 'node:assert/strict'; import {join} from 'node:path'; import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
const run=(c,...a)=>c.runNode(['calc.mjs',...a]);
async function good(c,op,a,b,out){const r=await run(c,op,a,b);assert.deepEqual([r.code,r.stdout,r.stderr],[0,out+'\n',''])}
async function bad(c,...a){const r=await run(c,...a);assert.deepEqual([r.code,r.stdout,r.stderr],[2,'','invalid input\n'])}
export const checks=[
 c=>Promise.all([good(c,'add','3','-8','-5'),good(c,'add','-3','-8','-11')]),
 c=>Promise.all([good(c,'sub','1','2','-1'),good(c,'sub','2','2','0')]),
 c=>Promise.all([good(c,'mul','-3','2','-6'),good(c,'mul','4','0','0')]),
 c=>good(c,'mul','999999999999999999999999999999','9','8999999999999999999999999999991'),
 c=>Promise.all([good(c,'add','+001','-000','1'),good(c,'mul','-000','1','0')]),
 c=>bad(c,'add','1'.repeat(31),'1'),
 async c=>{for(const a of ['1.0','1e2',' 1','+',''])await bad(c,'add',a,'1')},
 async c=>{for(const a of [['div','1','2'],['add','1'],['add','1','2','3']])await bad(c,...a)},
 c=>bad(c,'bad','1','2')];
