import assert from 'node:assert/strict';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const get=async c=>(await import(pathToFileURL(join(c.dir,'src/invoice.mjs')).href)).createInvoice;
const line=(id,mills,tax=0,quantity=1)=>({id,quantity,unitMills:mills,taxBasisPoints:tax});
const run=(f,lines,discountCents=0)=>f({customer:'Ada',lines,discountCents});
export const checks=[
 async c=>assert.deepEqual(run(await get(c),[]),{customer:'Ada',lines:[],totalCents:0}),
 async c=>assert.equal(run(await get(c),[line('a',100500)]).totalCents,101),
 async c=>assert.equal(run(await get(c),[line('a',100499)]).totalCents,100),
 async c=>assert.equal(run(await get(c),[line('a',500,0,3)]).totalCents,2),
 async c=>assert.equal(run(await get(c),[line('a',Number.MAX_SAFE_INTEGER,0,100)]).totalCents,900719925474099),
 async c=>assert.equal(run(await get(c),[line('a',1000,5000)]).lines[0].taxCents,1),
 async c=>assert.equal(run(await get(c),[line('a',2000,2500)]).lines[0].taxCents,1),
 async c=>assert.equal(run(await get(c),[line('a',10000,10000)],4).totalCents,12),
 async c=>assert.deepEqual(run(await get(c),[line('b',1000),line('a',1000)],1).lines.map(x=>[x.id,x.discountCents]),[['a',1],['b',0]]),
 async c=>assert.deepEqual(run(await get(c),[line('a',1000),line('b',2000)],1).lines.map(x=>x.discountCents),[0,1]),
 async c=>assert.deepEqual(run(await get(c),[line('a',0),line('b',2000)],1).lines.map(x=>x.discountCents),[0,1]),
 async c=>assert.deepEqual(run(await get(c),[line('a',0),line('b',0)],0).lines.map(x=>x.discountCents),[0,0]),
 async c=>assert.deepEqual(run(await get(c),[line('b',1000),line('a',1000)]).lines.map(x=>x.id),['a','b']),
 async c=>{const f=await get(c),a=[line('b',1000,0),line('a',1000,5000)];assert.deepEqual(run(f,a,1),run(f,[...a].reverse(),1))},
 async c=>{const f=await get(c),input={customer:'A',lines:[line('a',1000)],discountCents:0},before=JSON.stringify(input);f(input);assert.equal(JSON.stringify(input),before)},
 async c=>assert.equal(run(await get(c),[line('a',100000,750),line('b',30000,500)],3).totalCents,135),
];
