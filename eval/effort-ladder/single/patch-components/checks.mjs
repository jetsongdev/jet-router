import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.mergePatches; eq(f(['a','b'],[],[]),[{type:'ok',lines:['a','b']}]);eq(f([],[],[]),[]); },
 async mod => { const f=mod.mergePatches; eq(f(['a','b','c','d'],[{start:1,end:2,lines:['L']}],[{start:3,end:4,lines:['R']}]),[{type:'ok',lines:['a','L','c','R']}]); },
 async mod => { const f=mod.mergePatches; eq(f(['a'],[{start:0,end:0,lines:['L']}],[{start:0,end:0,lines:['R']}]),[{type:'conflict',start:0,end:0,left:['L'],right:['R']},{type:'ok',lines:['a']}]); },
 async mod => { const f=mod.mergePatches; eq(f(['a','b'],[{start:0,end:1,lines:['L']}],[{start:0,end:0,lines:['R']}]),[{type:'conflict',start:0,end:1,left:['L'],right:['R','a']},{type:'ok',lines:['b']}]);eq(f(['a','b'],[{start:0,end:1,lines:['L']}],[{start:1,end:1,lines:['R']}]),[{type:'ok',lines:['L','R','b']}]); },
 async mod => { const f=mod.mergePatches; eq(f(['a','b'],[{start:0,end:1,lines:['L']}],[{start:1,end:2,lines:['R']}]),[{type:'ok',lines:['L','R']}]); },
 async mod => { const f=mod.mergePatches; eq(f(['a','b','c','d','e'],[{start:1,end:4,lines:['L']}],[{start:0,end:2,lines:['X']},{start:3,end:5,lines:['Y']}]),[{type:'conflict',start:0,end:5,left:['a','L','e'],right:['X','c','Y']}]); },
 async mod => { const f=mod.mergePatches; eq(f(['a'],[{start:0,end:1,lines:['x']}],[{start:0,end:1,lines:['x']}]),[{type:'conflict',start:0,end:1,left:['x'],right:['x']}]);eq(f(['a'],[{start:0,end:1,lines:[]}],[{start:0,end:1,lines:[]}]),[{type:'conflict',start:0,end:1,left:[],right:[]}]); },
 async mod => { const f=mod.mergePatches; eq(f(['a','b','c','d','e'],[{start:0,end:1,lines:['L']},{start:4,end:5,lines:['Z']}],[{start:0,end:1,lines:['R']},{start:4,end:5,lines:['Q']}]),[{type:'conflict',start:0,end:1,left:['L'],right:['R']},{type:'ok',lines:['b','c','d']},{type:'conflict',start:4,end:5,left:['Z'],right:['Q']}]); },
 async mod => { const f=mod.mergePatches; for(const side of [[{start:1,end:1,lines:[]},{start:0,end:0,lines:[]}],[{start:0,end:0,lines:[]},{start:0,end:0,lines:[]}],[{start:0,end:2,lines:[]}],[{start:0,end:1,lines:[1]}]])throws(()=>f(['a'],side,[]),RangeError); },
 async mod => { const f=mod.mergePatches; const b=Object.freeze(['a','b']),l=Object.freeze([Object.freeze({start:0,end:1,lines:Object.freeze(['L'])})]),r=Object.freeze([Object.freeze({start:0,end:1,lines:Object.freeze(['R'])})]);const a=f(b,l,r);a[0].left.push('x');a[0].right.push('y');a[1].lines.push('z');eq(f(b,l,r),[{type:'conflict',start:0,end:1,left:['L'],right:['R']},{type:'ok',lines:['b']}]);eq(b,['a','b']);eq(l[0].lines,['L']); }
];
