import { openSync, closeSync, unlinkSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export class CapExceededError extends Error {}
export const DEFAULT_CAPS = {pilot:5,batch:30,agent:85,boost:20,turn2:15};
export function openLedger(path, caps = DEFAULT_CAPS) {
 caps = {...DEFAULT_CAPS,...caps};
 const lock = `${path}.lock`;
 const fd = openSync(lock,'wx');
 let closed = false;
 const reservations = new Map(), spent = Object.fromEntries(Object.keys(DEFAULT_CAPS).map(k=>[k,0]));
 const apply = e => {
  if(e.type === 'reserve') reservations.set(e.id,e);
  else if(e.type === 'release') { if(!reservations.has(e.id)) throw Error('unknown reservation'); reservations.delete(e.id); }
  else if(e.type === 'settle') { const r=reservations.get(e.id); if(!r) throw Error('unknown reservation'); spent[r.segment]+=e.usd; reservations.delete(e.id); }
  else throw Error('invalid ledger event');
 };
 try { if(existsSync(path)) for(const line of readFileSync(path,'utf8').split('\n').filter(Boolean)) apply(JSON.parse(line)); }
 catch(e) { closeSync(fd); unlinkSync(lock); throw e; }
 const write = e => {if(closed) throw Error('ledger closed'); appendFileSync(path,JSON.stringify(e)+'\n'); apply(e);};
 const totals = () => {
  const segments = {};
  for(const segment of Object.keys(DEFAULT_CAPS)) {
   const reserved=[...reservations.values()].filter(r=>r.segment===segment).reduce((n,r)=>n+r.usd,0);
   segments[segment]={spent:spent[segment],reserved,cap:caps[segment],remaining:caps[segment]-spent[segment]-reserved};
  }
  const all=Object.entries(segments).filter(([k])=>k!=='turn2').map(([,v])=>v);
  const total={spent:all.reduce((n,x)=>n+x.spent,0),reserved:all.reduce((n,x)=>n+x.reserved,0),cap:140};
  total.remaining=total.cap-total.spent-total.reserved;
  return {segments,total};
 };
 const amount = n => {if(!Number.isFinite(n)||n<0) throw Error('invalid amount');};
 return {
  reserve(segment,usd,note) { amount(usd); if(!Object.hasOwn(spent,segment)) throw Error('invalid segment'); const t=totals(); if(usd>t.segments[segment].remaining+1e-9 || (segment!=='turn2' && usd>t.total.remaining+1e-9)) throw new CapExceededError('cap exceeded'); const id=randomUUID(); write({type:'reserve',id,segment,usd,note}); return id; },
  settle(id,{runId,usd,usage,source}) {amount(usd); if(!['batch-usage','sdk-total_cost_usd','assumed-max'].includes(source)) throw Error('invalid source'); const r=reservations.get(id); if(!r) throw Error('unknown reservation'); const t=totals(); if(usd>r.usd+t.segments[r.segment].remaining+1e-9 || (r.segment!=='turn2' && usd>r.usd+t.total.remaining+1e-9)) throw new CapExceededError('cap exceeded'); write({type:'settle',id,runId,usd,usage,source});},
  release(id) {if(!reservations.has(id)) throw Error('unknown reservation'); write({type:'release',id});}, totals,
  close() {if(!closed){closed=true;closeSync(fd);unlinkSync(lock);}}
 };
}
