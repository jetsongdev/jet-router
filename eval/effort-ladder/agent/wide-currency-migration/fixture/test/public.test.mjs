import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../src/index.mjs';

test('first calculator', async () => {
  assert.deepEqual(await quote(1, { amount: 10, rateBps: 1000 }), { amount: 10, fee: 1, tag: 'calc-01' });
});

test('second calculator', async () => {
  assert.deepEqual(await quote(2, { amount: 20, rateBps: 500 }), { amount: 20, fee: 1, tag: 'calc-02' });
});

test('zero fee', async () => {
  assert.equal((await quote(3, { amount: 2, rateBps: 0 })).fee, 0);
});
