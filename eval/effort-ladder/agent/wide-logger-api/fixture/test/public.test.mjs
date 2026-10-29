import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/index.mjs';

test('returns the item id', async () => {
  assert.equal(await createService().run(1, { id: 'one' }), 'one');
});

test('unknown task', async () => {
  await assert.rejects(createService().run(99, { id: 'x' }), RangeError);
});

test('another accepted task', async () => {
  assert.equal(await createService().run(4, { id: 'two' }), 'two');
});
