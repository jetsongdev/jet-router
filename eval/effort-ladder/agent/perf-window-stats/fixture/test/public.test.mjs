import {test} from 'node:test';
import assert from 'node:assert/strict';
import {windowStats} from '../src/window.mjs';
test('one measurement',()=>assert.deepEqual(windowStats([{time:1,value:4}],{width:10,percentile:.5}),[{watermark:1,count:1,value:4}]));
test('several measurements',()=>assert.equal(windowStats([{time:1,value:4},{time:2,value:2},{time:3,value:9}],{width:10,percentile:.5}).at(-1).value,4));
