import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.parseFields; eq(f('---\na: one\nb-2: two\n---\nx\ny'),{fields:[['a','one'],['b-2','two']],body:'x\ny'}); },
 async mod => { const f=mod.parseFields; eq(f('x\r\ny'),{fields:[],body:'x\r\ny'}); },
 async mod => { const f=mod.parseFields; eq(f('---\n---'),{fields:[],body:''});eq(f('---\n---\n'),{fields:[],body:''}); },
 async mod => { const f=mod.parseFields; eq(f('---\r\na: x\r\n---\r\none\r\ntwo\r\n'),{fields:[['a','x']],body:'one\ntwo\n'}); },
 async mod => { const f=mod.parseFields; eq(f('---\na:  x  \nb: \n---'),{fields:[['a',' x  '],['b','']],body:''}); },
 async mod => { const f=mod.parseFields; for(const s of ['---','---\na: x','---\nbody'])throws(()=>f(s),RangeError); },
 async mod => { const f=mod.parseFields; for(const s of ['A: x','a:x','','a_: x'])throws(()=>f('---\n'+s+'\n---'),RangeError); },
 async mod => { const f=mod.parseFields; throws(()=>f('---\na: x\na: y\n---'),RangeError);eq(f('---\na: x\naa: y\n---').fields,[['a','x'],['aa','y']]); },
 async mod => { const f=mod.parseFields; throws(()=>f('---\n---\r'),RangeError);eq(f('---\na: x\r\n---\nbody\r').body,'body\r');throws(()=>f('---\na: x\n---\r'),RangeError); },
 async mod => { const f=mod.parseFields; throws(()=>f(null),TypeError);const a=f('---\na: x\n---'),b=f('---\na: x\n---');a.fields[0][1]='z';eq(b.fields,[['a','x']]); }
];
