import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.legalNeighbors; eq(f([[0,0,0],[0,0,0],[0,0,0]],1,1),[[0,1],[1,2],[2,1],[1,0]]); },
 async mod => { const f=mod.legalNeighbors; eq(f([[0,0],[0,0]],0,0),[[0,1],[1,0]]); },
 async mod => { const f=mod.legalNeighbors; eq(f([[0,1,0],[0,0,1],[0,0,0]],1,1),[[2,1],[1,0]]); },
 async mod => { const f=mod.legalNeighbors; eq(f([[1,0]],0,0),[]); },
 async mod => { const f=mod.legalNeighbors; eq(f([[0]],0,0),[]);eq(f([[0,0,0]],0,1),[[0,2],[0,0]]);eq(f([[0],[0],[0]],1,0),[[0,0],[2,0]]); },
 async mod => { const f=mod.legalNeighbors; for(const b of [[],[[]],[[0],[0,0]]])throws(()=>f(b,0,0),RangeError); },
 async mod => { const f=mod.legalNeighbors; for(const x of [2,null,'0'])throws(()=>f([[0,0],[0,x]],0,0),RangeError); },
 async mod => { const f=mod.legalNeighbors; for(const [r,c] of [[-1,0],[0,2],[.5,0],['0',0]])throws(()=>f([[0,0]],r,c),RangeError); },
 async mod => { const f=mod.legalNeighbors; const b=Object.freeze([Object.freeze([0,0]),Object.freeze([0,0])]);f(b,0,0);eq(b,[[0,0],[0,0]]); },
 async mod => { const f=mod.legalNeighbors; const b=[[0,0],[0,0]],a=f(b,0,0);a[0][0]=99;eq(f(b,0,0),[[0,1],[1,0]]);eq(b,[[0,0],[0,0]]); }
];
