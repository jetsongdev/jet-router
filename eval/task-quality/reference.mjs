// Hand-written fixtures calibrate the grader; never sent to a task model.
export function parseRanges(text){
 if(typeof text!=='string')throw new TypeError();if(!text.trim())return [];
 const values=new Set();for(const piece of text.split(',')){
  const m=piece.trim().match(/^([+-]?\d+)(?:\s*\.\.\s*([+-]?\d+))?$/);if(!m)throw new RangeError();
  const a=Number(m[1]),b=m[2]===undefined?a:Number(m[2]);
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||b<a||b-a>=1000)throw new RangeError();
  for(let x=a;x<=b;x++)values.add(x===0?0:x);
 }return [...values].sort((a,b)=>a-b);
}
export function createCache(capacity,now){
 if(!Number.isSafeInteger(capacity)||capacity<=0)throw new RangeError();const map=new Map();
 const purge=()=>{const t=now();for(const [k,v]of map)if(t>=v.exp)map.delete(k);};
 return {set(k,v,ttl){if(!Number.isFinite(ttl)||ttl<0)throw new RangeError();purge();map.delete(k);if(!ttl)return;map.set(k,{v,exp:now()+ttl});while(map.size>capacity)map.delete(map.keys().next().value);},get(k){purge();if(!map.has(k))return;const e=map.get(k);map.delete(k);map.set(k,e);return e.v;},has(k){purge();return map.has(k);},get size(){purge();return map.size;}};
}
export function memoizeAsync(fn){
 const cache=new Map();return {get(k){if(cache.has(k))return cache.get(k);let yes,no;const p=new Promise((a,b)=>{yes=a;no=b;});cache.set(k,p);
  Promise.resolve().then(()=>fn(k)).then(yes,e=>{if(cache.get(k)===p)cache.delete(k);no(e);});return p;},invalidate(k){cache.delete(k);},clear(){cache.clear();}};
}
export function createLedger(initial){
 let balances=new Map(Object.entries(initial)),seen=new Map();for(const v of balances.values())if(!Number.isSafeInteger(v)||v<0)throw new RangeError();
 return {snapshot(){return Object.assign(Object.create(null),Object.fromEntries(balances));},apply(batch){
  if(!Array.isArray(batch))throw new RangeError();const b=new Map(balances),s=new Map(seen),out=[];
  for(const t of batch){if(!t||typeof t.id!=='string'||!t.id||!b.has(t.from)||!b.has(t.to)||!Number.isSafeInteger(t.amount)||t.amount<=0)throw new RangeError();
   const record=JSON.stringify([t.from,t.to,t.amount]);if(s.has(t.id)){if(s.get(t.id)!==record)throw new RangeError();out.push('duplicate');continue;}
   if(b.get(t.from)<t.amount)throw new RangeError();if(t.from!==t.to){if(!Number.isSafeInteger(b.get(t.to)+t.amount))throw new RangeError();b.set(t.from,b.get(t.from)-t.amount);b.set(t.to,b.get(t.to)+t.amount);}
   s.set(t.id,record);out.push('applied');
  }balances=b;seen=s;return out;
 }};
}
export function createKeyedQueue(){const tails=new Map();return (key,task)=>{const previous=tails.get(key)||Promise.resolve();const p=previous.then(task);const tail=p.then(()=>{},()=>{});tails.set(key,tail);tail.then(()=>{if(tails.get(key)===tail)tails.delete(key);});return p;};}
export function subtractIntervals(base,cuts){
 const norm=rows=>{const a=rows.map(x=>{if(!Array.isArray(x)||x.length!==2||!x.every(Number.isFinite)||x[0]>x[1])throw new RangeError();return [...x];}).filter(x=>x[0]<x[1]).sort((a,b)=>a[0]-b[0]);const out=[];for(const x of a){const last=out.at(-1);if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push(x);}return out;};
 const b=norm(base),c=norm(cuts),out=[];for(const [a,z]of b){let p=a;for(const [l,r]of c){if(r<=p)continue;if(l>=z)break;if(l>p)out.push([p,l]);p=Math.max(p,r);if(p>=z)break;}if(p<z)out.push([p,z]);}return out;
}
