import assert from 'node:assert/strict'; import {join} from 'node:path'; import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';const store=async c=>(await import(pathToFileURL(join(c.dir,'src/store.mjs')).href)).createStore;const t=(from,to,amount)=>({from,to,amount});
export const checks=[
 async c=>{const s=(await store(c))({a:10,b:0,c:0});assert.equal(s.apply([t('a','b',4),t('b','c',2)]),undefined);assert.deepEqual(s.snapshot(),{a:6,b:2,c:2})},
 async c=>{const s=(await store(c))({a:10,b:0});assert.throws(()=>s.apply([t('a','b',2),t('a','b',99)]),RangeError);assert.deepEqual(s.snapshot(),{a:10,b:0})},
 async c=>{const s=(await store(c))({a:10,b:0});assert.throws(()=>s.apply([t('a','b',2),t('a','b',99)]));s.apply([t('a','b',3)]);assert.deepEqual(s.snapshot(),{a:7,b:3})},
 async c=>{for(const x of [t('x','b',1),t('a','x',1),t('a','b',0),t('a','b',-1),t('a','b',1.5),t('a','b',Number.MAX_SAFE_INTEGER+1)]){const s=(await store(c))({a:10,b:0});assert.throws(()=>s.apply([t('a','b',1),x]),RangeError);assert.deepEqual(s.snapshot(),{a:10,b:0})}},
 async c=>{const s=(await store(c))({a:2,b:Number.MAX_SAFE_INTEGER-1});s.apply([t('a','b',1)]);assert.throws(()=>s.apply([t('a','b',1)]),RangeError);assert.equal(s.snapshot().b,Number.MAX_SAFE_INTEGER)},
 async c=>{const s=(await store(c))({a:2});s.apply([t('a','a',2)]);assert.deepEqual(s.snapshot(),{a:2});assert.throws(()=>s.apply([t('a','a',3)]),RangeError)},
 async c=>{const s=(await store(c))({a:1});assert.equal(s.apply([]),undefined);assert.deepEqual(s.snapshot(),{a:1})},
 async c=>{const initial={a:5,b:0},s=(await store(c))(initial);initial.a=0;const transfer=t('a','b',2);s.apply([transfer]);transfer.amount=99;const snap=s.snapshot();snap.a=0;assert.deepEqual(s.snapshot(),{a:3,b:2})},
 async c=>{const initial=JSON.parse('{"__proto__":5,"constructor":0}'),s=(await store(c))(initial);s.apply([t('__proto__','constructor',2)]);assert.deepEqual(s.snapshot(),JSON.parse('{"__proto__":3,"constructor":2}'))},
 async c=>{const create=await store(c);for(const n of [-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>create({a:n}),RangeError)}];
