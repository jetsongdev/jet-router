import assert from 'node:assert/strict';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const get=async c=>(await import(pathToFileURL(join(c.dir,'src/planner.mjs')).href)).plan;
const s=(from,to,cost)=>({from,to,cost});
export const checks=[
 async c=>assert.equal((await get(c))(1,[]),0),
 async c=>assert.equal((await get(c))(4,[]),null),
 async c=>assert.equal((await get(c))(3,[s(0,2,4)]),4),
 async c=>assert.equal((await get(c))(4,[s(0,1,2),s(1,3,5)]),7),
 async c=>assert.equal((await get(c))(6,[s(0,3,5),s(1,5,2)]),7),
 async c=>assert.equal((await get(c))(6,[s(0,3,5),s(2,5,2)]),7),
 async c=>assert.equal((await get(c))(6,[s(0,3,5),s(1,2,0),s(2,5,2)]),7),
 async c=>assert.equal((await get(c))(5,[s(0,3,1),s(1,2,1),s(2,4,1)]),2),
 async c=>assert.equal((await get(c))(5,[s(0,3,1),s(0,2,10),s(2,4,1)]),2),
 async c=>assert.equal((await get(c))(5,[s(0,3,1),s(0,2,10),s(1,2,0),s(2,4,1)]),2),
 async c=>assert.equal((await get(c))(4,[s(0,2,9),s(0,2,3),s(2,3,1)]),4),
 async c=>assert.equal((await get(c))(4,[s(2,3,1),s(0,2,3),s(0,2,9)]),4),
 async c=>assert.equal((await get(c))(3,[s(0,1,0),s(1,2,0)]),0),
 async c=>assert.equal((await get(c))(4,[s(1,2,0),s(2,3,0),s(0,2,8)]),8),
 async c=>{const f=await get(c),a=[s(0,2,5),s(0,1,2)],before=JSON.stringify(a);f(3,a);assert.equal(JSON.stringify(a),before)},
 async c=>{await c.writeFile('perf-check.mjs',`import {plan} from './src/planner.mjs';const n=200000;const s=Array.from({length:n-1},(_,i)=>({from:0,to:i+1,cost:1}));const start=performance.now();const result=plan(n,s);console.log(JSON.stringify({result,elapsed:performance.now()-start}));`);const run=await c.runNode(['perf-check.mjs'],{timeoutMs:1800});assert.equal(run.code,0,run.stderr||'performance timeout');const result=JSON.parse(run.stdout);assert.equal(result.result,1);assert.ok(result.elapsed<1000,`plan took ${result.elapsed}ms`)},
 async c=>{const plan=await get(c);let seed=19;const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);for(let t=0;t<90;t++){const n=3+rand(20);const routes=Array.from({length:40},()=>{const from=rand(n-1);return s(from,from+1+rand(n-from-1),rand(20))});const best=Array(n).fill(Infinity);best[0]=0;for(const route of [...routes].sort((a,b)=>a.to-b.to))for(let i=route.from;i<route.to;i++)best[route.to]=Math.min(best[route.to],best[i]+route.cost);assert.equal(plan(n,routes),Number.isFinite(best[n-1])?best[n-1]:null)}},
];
