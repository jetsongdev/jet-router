import assert from 'node:assert/strict';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const get=async c=>(await import(pathToFileURL(join(c.dir,'src/sync.mjs')).href)).sync;
const empty=()=>({records:[],fences:[],seen:[]});
const op=(key,id,time,actor='a',value='v')=>({key,id,time,actor,deleted:false,value});
const del=(key,id,time,actor='a')=>({key,id,time,actor,deleted:true});
const apply=(f,state,ops,now=10,ttl=10)=>f(state,ops,{now,ttl});
export const checks=[
 async c=>assert.deepEqual(apply(await get(c),empty(),[]),empty()),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1)]).records[0].value,'v'),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1),op('l','x',2,'a','new')]).records[0].value,'new'),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',2,'a','new'),op('l','x',1)]).records[0].value,'new'),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1,'z','Z'),op('l','x',1,'a','A')]).records[0].value,'Z'),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1,'a','A'),op('l','x',1,'z','Z')]).records[0].value,'Z'),
 async c=>assert.equal(apply(await get(c),empty(),[del('k','x',1),op('l','x',1)]).records[0].deleted,true),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1),del('l','x',1)]).records[0].deleted,true),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1,'a','a'),op('l','x',1,'a','z')]).records[0].value,'z'),
 async c=>assert.equal(apply(await get(c),empty(),[op('k','x',1),op('k','x',2,'a','changed')]).records[0].value,'v'),
 async c=>{const f=await get(c),s=apply(f,empty(),[op('k','x',1)]);assert.equal(apply(f,s,[op('k','y',2)]).records.length,1)},
 async c=>assert.equal(apply(await get(c),empty(),[del('k','x',1)],10,10).records.length,1),
 async c=>{const s=apply(await get(c),empty(),[del('k','x',1)],11,10);assert.equal(s.records.length,0);assert.equal(s.fences.length,1)},
 async c=>{const f=await get(c),s=apply(f,empty(),[del('k','x',1)],11,10);assert.equal(apply(f,s,[op('l','x',0)],11,10).records.length,0)},
 async c=>{const f=await get(c),s=apply(f,empty(),[del('k','x',1)],11,10);assert.equal(apply(f,s,[op('l','x',2,'a','new')],11,10).records[0].value,'new')},
 async c=>{const f=await get(c),s=apply(f,empty(),[del('k','x',1)],10,10);assert.equal(apply(f,s,[],11,10).records.length,0)},
 async c=>{const s=apply(await get(c),empty(),[op('z','b',1),op('a','a',1)]);assert.deepEqual(s.records.map(x=>x.id),['a','b']);assert.deepEqual(s.seen,['a','z'])},
 async c=>{const f=await get(c),state=empty(),ops=[op('k','x',1)],before=JSON.stringify([state,ops]);apply(f,state,ops);assert.equal(JSON.stringify([state,ops]),before)},
];
