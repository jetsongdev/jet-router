import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.monthlyOccurrences; eq(f('2023-01-31',1,3,'skip'),['2023-01-31','2023-03-31']);eq(f('2023-01-31',1,3,'clamp'),['2023-01-31','2023-02-28','2023-03-31']); },
 async mod => { const f=mod.monthlyOccurrences; eq(f('2024-01-31',1,3,'clamp').at(-1),'2024-03-31'); },
 async mod => { const f=mod.monthlyOccurrences; eq(f('2000-01-29',1,2,'clamp')[1],'2000-02-29');eq(f('1900-01-29',1,2,'clamp')[1],'1900-02-28');eq(f('2024-01-29',1,2,'clamp')[1],'2024-02-29'); },
 async mod => { const f=mod.monthlyOccurrences; eq(f('2023-11-15',2,3,'skip'),['2023-11-15','2024-01-15','2024-03-15']);eq(f('2020-01-01',25,2,'skip'),['2020-01-01','2022-02-01']); },
 async mod => { const f=mod.monthlyOccurrences; eq(f('2023-01-01',1,0,'skip'),[]);for(const args of [['2023-02-30',1,0,'skip'],['2023-01-01',1,0,'bad']])throws(()=>f(...args),RangeError); },
 async mod => { const f=mod.monthlyOccurrences; eq(f('0001-01-01',1,1,'skip'),['0001-01-01']);eq(f('9999-12-31',1,1,'clamp'),['9999-12-31']); },
 async mod => { const f=mod.monthlyOccurrences; eq(f('9999-11-30',1,2,'skip'),['9999-11-30','9999-12-30']);throws(()=>f('9999-12-01',1,2,'skip'),RangeError); },
 async mod => { const f=mod.monthlyOccurrences; for(const s of ['0000-01-01','2023-02-29','2023-13-01','2023-1-01',' 2023-01-01','2023-01-01 '])throws(()=>f(s,1,1,'skip'),RangeError); },
 async mod => { const f=mod.monthlyOccurrences; for(const n of [0,1201,1.5,Number.MAX_SAFE_INTEGER+1,'1'])throws(()=>f('2023-01-01',n,1,'skip'),RangeError);for(const n of [-1,1201,1.5,Number.MAX_SAFE_INTEGER+1,'1'])throws(()=>f('2023-01-01',1,n,'skip'),RangeError); },
 async mod => { const f=mod.monthlyOccurrences; const a=f('2023-01-31',1,2,'skip');eq(a,['2023-01-31']);eq(a,f('2023-01-31',1,2,'skip')); }
];
