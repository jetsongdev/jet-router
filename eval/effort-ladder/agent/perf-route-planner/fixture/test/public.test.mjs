import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan} from '../src/planner.mjs';
test('direct',()=>assert.equal(plan(3,[{from:0,to:2,cost:4}]),4));
test('transfer',()=>assert.equal(plan(3,[{from:0,to:1,cost:2},{from:1,to:2,cost:3}]),5));
