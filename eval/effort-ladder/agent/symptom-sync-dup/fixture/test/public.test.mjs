import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sync} from '../src/sync.mjs';
const empty={records:[],fences:[],seen:[]};
test('creates a record',()=>assert.equal(sync(empty,[{key:'k',id:'a',time:1,actor:'x',deleted:false,value:'v'}],{now:1,ttl:10}).records[0].value,'v'));
test('newer update wins',()=>assert.equal(sync(empty,[{key:'k',id:'a',time:1,actor:'x',deleted:false,value:'v'},{key:'l',id:'a',time:2,actor:'x',deleted:false,value:'w'}],{now:2,ttl:10}).records[0].value,'w'));
