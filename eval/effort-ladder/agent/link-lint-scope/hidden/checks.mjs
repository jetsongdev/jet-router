import assert from 'node:assert/strict'; import {join} from 'node:path'; import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
async function run(c,text){await c.writeFile('input.md',text);return c.runNode(['lint.mjs','input.md'])} async function eq(c,text,code,out){const r=await run(c,text);assert.deepEqual([r.code,r.stdout,r.stderr],[code,out,''])}
export const checks=[
 c=>eq(c,'[a](http://x)\n[b](/x)',1,'1: insecure link\n2: root-relative link\n'),
 c=>eq(c,'[a](https://x) [b](foo) [c](#x)',0,''),
 c=>eq(c,'[a](/x) [b](http://x) [c](/y)',1,'1: root-relative link\n1: insecure link\n1: root-relative link\n'),
 c=>eq(c,'```\n[a](http://x)\n```\n[b](/x)',1,'4: root-relative link\n'),
 c=>eq(c,'  ```js\n[a](/x)\n  ``` close\n[b](/x)',1,'4: root-relative link\n'),
 c=>eq(c,'```\n[a](/x)',0,''),
 c=>eq(c,'ok\r\n[a](/x)\r\n[b](http://x)',1,'2: root-relative link\n3: insecure link\n'),
 c=>eq(c,'[](http://x) [a]() [a](http://x',0,''),
 c=>eq(c,'nothing',0,''),
 async c=>{for(const args of [[],['missing'],['a','b']]){const r=await c.runNode(['lint.mjs',...args]);assert.equal(r.code,2);assert.equal(r.stdout,'')}}];
