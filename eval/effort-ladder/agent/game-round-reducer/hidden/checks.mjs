import assert from 'node:assert/strict'; import {join} from 'node:path'; import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url'; const mod=c=>import(pathToFileURL(join(c.dir,'game.mjs')).href); const E=type=>({type});
export const checks=[
 async c=>{const m=await mod(c),a=m.initialState(),b=m.initialState();assert.deepEqual(a,{phase:'ready',score:0,lives:3});assert.notEqual(a,b)},
 async c=>{const m=await mod(c);assert.deepEqual(m.transition(m.transition(m.initialState(),E('start')),E('point')),{phase:'playing',score:1,lives:3})},
 async c=>{const m=await mod(c);let s=m.transition(m.initialState(),E('start'));for(let i=0;i<3;i++)s=m.transition(s,E('hit'));assert.deepEqual(s,{phase:'over',score:0,lives:0})},
 async c=>{const m=await mod(c),s={phase:'over',score:2,lives:0};for(const t of ['point','hit','start'])assert.deepEqual(m.transition(s,E(t)),s)},
 async c=>{const m=await mod(c);assert.deepEqual(m.transition({phase:'over',score:2,lives:0},E('restart')),m.initialState())},
 async c=>{const m=await mod(c);for(const phase of ['ready','playing'])for(const t of ['restart','unknown']){const s={phase,score:0,lives:3};assert.deepEqual(m.transition(s,E(t)),s)}},
 async c=>{const m=await mod(c);for(const t of ['start','unknown']){const s=m.initialState();assert.notEqual(m.transition(s,E(t)),s)}},
 async c=>{const m=await mod(c),s=Object.freeze(m.initialState()),e=Object.freeze(E('start'));assert.equal(m.transition(s,e).phase,'playing')},
 async c=>{const m=await mod(c),g=m.createGame();let s=m.initialState();for(const t of ['start','point','hit']){s=m.transition(s,E(t));assert.deepEqual(g.dispatch(E(t)),s)}const snap=g.snapshot();snap.score=99;assert.deepEqual(g.snapshot(),s)},
 async c=>{const m=await mod(c),a=m.createGame(),b=m.createGame();a.dispatch(E('start'));assert.deepEqual(b.snapshot(),m.initialState());assert.notEqual(a.snapshot(),a.snapshot())}];
