import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from '../src/index.mjs';
const clock = { sleep: async () => {} };

test('existing provider works', async () => {
  const p = createProvider('amber', { token: 'abc' }, { clock, transport: async () => ({ status: 200, id: 'a' }) });
  assert.deepEqual(await p.send('hello'), { id: 'a' });
});

test('pulsar success', async () => {
  const p = createProvider('pulsar', { token: 'abc' }, { clock, transport: async () => ({ status: 200, id: 'b' }) });
  assert.deepEqual(await p.send('hello'), { id: 'b' });
});

test('pulsar payload', async () => {
  let payload;
  const p = createProvider('pulsar', { token: 'abc' }, { clock, transport: async p => { payload = p; return { status: 200, id: 'b' }; } });
  await p.send('hello');
  assert.equal(payload.message, 'hello');
});
