import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.lineWinner; eq(f([['A','A','A'],[null,null,null]],3),'A');eq(f([['B',null],['B',null],['B',null]],3),'B'); },
 async mod => { const f=mod.lineWinner; eq(f([['A',null,null],[null,'A',null],[null,null,'A'],[null,null,null]],3),'A');eq(f([[null,null,'B'],[null,'B',null],['B',null,null]],3),'B'); },
 async mod => { const f=mod.lineWinner; eq(f([['A','A','A','A']],3),'A'); },
 async mod => { const f=mod.lineWinner; eq(f([['A',null,'A'],[null,'B',null]],3),null); },
 async mod => { const f=mod.lineWinner; eq(f([['A','A'],['B','B']],2),'both');eq(f([['B','B'],['A','A']],2),'both'); },
 async mod => { const f=mod.lineWinner; eq(f([['A',null]],1),'A');eq(f([['A','B']],1),'both');eq(f([[null]],1),null); },
 async mod => { const f=mod.lineWinner; eq(f([['A','A','A','A']],4),'A');eq(f([['B'],['B'],['B']],3),'B'); },
 async mod => { const f=mod.lineWinner; for(const b of [[],[[]],Array.from({length:13},()=>[null]),[Array(13).fill(null)],[[null],[null,null]],[[null,'X']]])throws(()=>f(b,1),RangeError); },
 async mod => { const f=mod.lineWinner; for(const k of [0,3,1.5,'1'])throws(()=>f([[null,null]],k),RangeError); },
 async mod => { const f=mod.lineWinner; throws(()=>f([['A','A'],[null,'X']],2),RangeError);const b=Object.freeze([Object.freeze(['A','A'])]);eq(f(b,2),'A');eq(b,[['A','A']]); }
];
