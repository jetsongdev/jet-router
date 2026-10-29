import assert from 'node:assert/strict';
const eq=assert.deepStrictEqual, throws=assert.throws;
export const checks = [
 async mod => { const f=mod.headingIndex; eq(f(['# Hello World','## hi','### X9']),[{level:1,title:'Hello World',slug:'hello-world'},{level:2,title:'hi',slug:'hi'},{level:3,title:'X9',slug:'x9'}]); },
 async mod => { const f=mod.headingIndex; eq(f([]),[]);eq(f(['text']),[]); },
 async mod => { const f=mod.headingIndex; eq(f(['# A','# A','# A']).map(x=>x.slug),['a','a-2','a-3']); },
 async mod => { const f=mod.headingIndex; eq(f(['# A','# A 2','# A']).map(x=>x.slug),['a','a-2','a-3']); },
 async mod => { const f=mod.headingIndex; eq(f(['# A','# A','# A 2']).map(x=>x.slug),['a','a-2','a-2-2']); },
 async mod => { const f=mod.headingIndex; eq(f(['# HeLLo  ']),[{level:1,title:'HeLLo',slug:'hello'}]); },
 async mod => { const f=mod.headingIndex; eq(f([' # A','#### A','#\tA','#  A','# A!','#']),[]); },
 async mod => { const f=mod.headingIndex; eq(f(['# 123','## A1 B2']).map(x=>x.slug),['123','a1-b2']); },
 async mod => { const f=mod.headingIndex; for(const x of [null,'# A',[1],['# A',null]])throws(()=>f(x),TypeError); },
 async mod => { const f=mod.headingIndex; const a=Object.freeze(['# A','# A']);eq(f(a),f(a));eq(a,['# A','# A']); }
];
