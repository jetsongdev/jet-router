import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
export const checks = {
 ranges: [
  m=>assert.deepEqual(m.parseRanges(' -2..+2, 01, -0, 7 '),[-2,-1,0,1,2,7]),
  m=>{ assert.deepEqual(m.parseRanges('  '),[]); assert.equal(m.parseRanges('1..1000').length,1000); },
  m=>{ for(const s of ['1,','1,,2','2..1','1..1001','1e2','1.5','1 2','9007199254740992','+ 1','1...2']) assert.throws(()=>m.parseRanges(s),RangeError); assert.throws(()=>m.parseRanges(null),TypeError); },
  m=>assert.deepEqual(m.parseRanges('9007199254740990..9007199254740991,-9007199254740991'),[-9007199254740991,9007199254740990,9007199254740991]),
 ],
 'ttl-lru': [
  m=>{let t=0;const c=m.createCache(2,()=>t);c.set('a',1,2);c.set('b',2,5);t=2;assert.equal(c.has('a'),false);assert.equal(c.size,1);c.set('c',3,8);assert.equal(c.get('b'),2);},
  m=>{const c=m.createCache(2,()=>0);c.set('a',undefined,5);c.set('b',2,5);assert.equal(c.has('a'),true);c.get('a');c.set('c',3,5);assert.equal(c.has('b'),false);assert.equal(c.has('a'),true);},
  m=>{const c=m.createCache(2,()=>0);c.set('a',1,5);c.set('b',2,5);c.has('a');c.set('c',3,5);assert.equal(c.has('a'),false);assert.throws(()=>c.set('c',99,-1),RangeError);assert.equal(c.get('c'),3);c.set('c',4,0);assert.equal(c.has('c'),false);},
  m=>{for(const x of [0,-1,1.5,Infinity])assert.throws(()=>m.createCache(x,()=>0),RangeError);const key={};const c=m.createCache(2,()=>0);c.set(key,7,2);c.set(NaN,8,2);assert.equal(c.get(key),7);assert.equal(c.get(NaN),8);},
 ],
 'async-memo': [
  async m=>{let n=0;const d=deferred();const c=m.memoizeAsync(()=>{n++;return d.promise;});const a=c.get('x'),b=c.get('x');assert.equal(a,b);await flush();assert.equal(n,1);d.resolve(undefined);assert.equal(await a,undefined);assert.equal(await c.get('x'),undefined);assert.equal(n,1);},
  async m=>{const e={};let n=0;const c=m.memoizeAsync(()=>{if(++n===1)throw e;return 7;});await assert.rejects(c.get('x'),x=>x===e);assert.equal(await c.get('x'),7);},
  async m=>{let n=0;const old=deferred(),fresh=deferred();const c=m.memoizeAsync(()=>++n===1?old.promise:fresh.promise);const p=c.get('x');await flush();c.invalidate('x');const q=c.get('x');await flush();const rejection=assert.rejects(p,x=>x==='old');old.reject('old');await rejection;assert.equal(c.get('x'),q);fresh.resolve(8);assert.equal(await q,8);assert.equal(n,2);},
  async m=>{let n=0;let c;c=m.memoizeAsync(()=>{n++;if(n===1)c.invalidate('x');return n;});assert.equal(await c.get('x'),1);assert.equal(await c.get('x'),2);c.clear();assert.equal(await c.get('x'),3);},
 ],
 ledger: [
  m=>{const l=m.createLedger({a:10,b:0});assert.deepEqual(l.apply([{id:'1',from:'a',to:'b',amount:7},{id:'1',from:'a',to:'b',amount:7}]),['applied','duplicate']);assert.equal(l.snapshot().a,3);assert.throws(()=>l.apply([{id:'1',from:'a',to:'b',amount:1}]),RangeError);},
  m=>{const l=m.createLedger({a:10,b:0});assert.throws(()=>l.apply([{id:'x',from:'a',to:'b',amount:2},{id:'y',from:'a',to:'b',amount:99}]),RangeError);assert.equal(l.snapshot().a,10);assert.deepEqual(l.apply([{id:'x',from:'a',to:'b',amount:2}]),['applied']);},
  m=>{const initial=JSON.parse('{"__proto__":5,"constructor":0}');const l=m.createLedger(initial);initial.__proto__=0;const tr={id:'x',from:'__proto__',to:'constructor',amount:2};l.apply([tr]);tr.amount=3;assert.equal(Object.getPrototypeOf(l.snapshot()),null);const s=l.snapshot();s.constructor=99;assert.equal(l.snapshot().constructor,2);assert.deepEqual(l.apply([{id:'x',from:'__proto__',to:'constructor',amount:2}]),['duplicate']);},
  m=>{const l=m.createLedger({a:Number.MAX_SAFE_INTEGER,b:1});assert.deepEqual(l.apply([{id:'self',from:'a',to:'a',amount:1}]),['applied']);assert.throws(()=>l.apply([{id:'overflow',from:'b',to:'a',amount:1}]),RangeError);assert.equal(l.snapshot().b,1);assert.throws(()=>l.apply([{id:'zero',from:'a',to:'b',amount:0}]),RangeError);},
 ],
 'keyed-queue': [
  async m=>{const q=m.createKeyedQueue();const d=deferred();const log=[];const a=q('x',()=>{log.push(1);return d.promise;});const b=q('x',()=>{log.push(2);return 2;});const c=q('y',()=>{log.push(3);return 3;});await c;assert.deepEqual(log,[1,3]);d.resolve(1);assert.deepEqual(await Promise.all([a,b]),[1,2]);assert.deepEqual(log,[1,3,2]);},
  async m=>{const q=m.createKeyedQueue();const e={};const a=q('x',()=>{throw e;});const rejection=assert.rejects(a,x=>x===e);const b=q('x',()=>7);await rejection;assert.equal(await b,7);assert.equal(await q('x',()=>8),8);},
  async m=>{const q=m.createKeyedQueue();const log=[];let inner;await q('x',()=>{log.push(1);inner=q('x',()=>log.push(2));});await inner;assert.deepEqual(log,[1,2]);},
 ],
 intervals: [
  m=>assert.deepEqual(m.subtractIntervals([[0,10],[10,20]],[[3,5],[4,8],[12,20]]),[[0,3],[8,12]]),
  m=>{const b=[[1,3],[0,2],[5,5]],c=[[-1,.5],[2.5,4]];assert.deepEqual(m.subtractIntervals(b,c),[[.5,2.5]]);assert.deepEqual(b,[[1,3],[0,2],[5,5]]);assert.deepEqual(c,[[-1,.5],[2.5,4]]);},
  m=>{assert.deepEqual(m.subtractIntervals([],[]),[]);assert.deepEqual(m.subtractIntervals([[0,1]],[[0,1]]),[]);for(const pair of [[2,1],[0,Infinity],[NaN,1],[0]]) assert.throws(()=>m.subtractIntervals([pair],[]),RangeError);const b=[[0,1]];const out=m.subtractIntervals(b,[]);out[0][0]=9;assert.equal(b[0][0],0);},
 ],
};
export async function grade(id,module) {
 const results=[];
 for (const [index,check] of checks[id].entries()) {
  try {await check(module);results.push({index,passed:true});}
  catch {results.push({index,passed:false});}
 }
 return {passed:results.every(x=>x.passed),passedChecks:results.filter(x=>x.passed).length,totalChecks:results.length,checks:results};
}
if(process.argv[2]) {
 try {const m=await import(pathToFileURL(process.argv[3]).href);console.log(JSON.stringify(await grade(process.argv[2],m)));}
 catch {console.log(JSON.stringify({passed:false,error:'load-failed'}));process.exitCode=1;}
}
