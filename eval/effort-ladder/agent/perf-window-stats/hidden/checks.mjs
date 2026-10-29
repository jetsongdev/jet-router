import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const get=async c=>(await import(pathToFileURL(join(c.dir,'src/window.mjs')).href)).windowStats;
const end=(fn,events,width=10,percentile=.5)=>fn(events,{width,percentile}).at(-1);
export const checks=[
 async c=>assert.deepEqual((await get(c))([],{width:1,percentile:0}),[]),
 async c=>assert.deepEqual(end(await get(c),[{time:1,value:3}]),{watermark:1,count:1,value:3}),
 async c=>assert.equal(end(await get(c),[{time:1,value:10},{time:2,value:20}],10,.5).value,10),
 async c=>assert.equal(end(await get(c),[{time:1,value:4},{time:2,value:-3},{time:3,value:8}],10,0).value,-3),
 async c=>assert.equal(end(await get(c),[{time:1,value:4},{time:2,value:-3},{time:3,value:8}],10,1).value,8),
 async c=>assert.equal(end(await get(c),[{time:1,value:3},{time:2,value:3},{time:3,value:8}],10,.6).value,3),
 async c=>assert.deepEqual(end(await get(c),[{time:1,value:1},{time:11,value:9}]),{watermark:11,count:1,value:9}),
 async c=>assert.deepEqual(end(await get(c),[{time:11,value:9},{time:1,value:1}]),{watermark:11,count:1,value:9}),
 async c=>assert.deepEqual(end(await get(c),[{time:11,value:9},{time:0,value:1}]),{watermark:11,count:1,value:9}),
 async c=>assert.deepEqual(end(await get(c),[{time:11,value:9},{time:2,value:1}]),{watermark:11,count:2,value:1}),
 async c=>assert.deepEqual(end(await get(c),[{time:4,value:9},{time:4,value:1}]),{watermark:4,count:2,value:1}),
 async c=>assert.deepEqual(end(await get(c),[{time:1,value:1},{time:9,value:2},{time:20,value:3}]),{watermark:20,count:1,value:3}),
 async c=>assert.deepEqual(end(await get(c),[{time:11,value:9},{time:3,value:2},{time:20,value:3}]),{watermark:20,count:2,value:3}),
 async c=>assert.equal(end(await get(c),[{time:1,value:1},{time:2,value:2},{time:3,value:3},{time:4,value:4}],10,.76).value,4),
 async c=>{const f=await get(c),e=[{time:2,value:1},{time:1,value:3}],o={width:3,percentile:.5},before=JSON.stringify([e,o]);f(e,o);assert.equal(JSON.stringify([e,o]),before)},
 async c=>{await c.writeFile('perf-check.mjs', `import {windowStats} from './src/window.mjs';
const e=Array.from({length:200000},(_,i)=>({time:i,value:(i*37)%1009}));
const start=performance.now();const out=windowStats(e,{width:100000,percentile:.5});
console.log(JSON.stringify({elapsed:performance.now()-start,length:out.length,last:out.at(-1)}));`);
 const run=await c.runNode(['perf-check.mjs'],{timeoutMs:1800});assert.equal(run.code,0,run.stderr||'performance timeout');const result=JSON.parse(run.stdout);assert.equal(result.length,200000);assert.deepEqual(result.last,{watermark:199999,count:100000,value:504});assert.ok(result.elapsed<1000,`replay took ${result.elapsed}ms`)},
 async c=>{const f=await get(c);let seed=23;const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);for(let t=0;t<30;t++){const events=Array.from({length:120},()=>({time:rand(100),value:rand(15)-7}));const width=1+rand(25),percentile=rand(11)/10;let watermark=-Infinity,active=[];const expected=events.map(event=>{watermark=Math.max(watermark,event.time);active=active.filter(x=>x.time>watermark-width);if(event.time>watermark-width)active.push(event);const values=active.map(x=>x.value).sort((a,b)=>a-b);return {watermark,count:values.length,value:values.length?values[Math.max(1,Math.ceil(percentile*values.length))-1]:null}});assert.deepEqual(f(events,{width,percentile}),expected)}},
];
