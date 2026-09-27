import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { discoverCodexModels, parseModelPage } from '../codex-models.mjs';

const row = (model = 'gpt-example', efforts = ['low', 'medium']) => ({ model, supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort })) });
function fakeLaunch(replies) {
  const requests = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.kill = () => { child.killed = true; };
  child.stdin = new Writable({ write(chunk, _encoding, done) {
    const request = JSON.parse(chunk.toString()); requests.push(request);
    if (request.id) queueMicrotask(() => {
      const result = replies.shift();
      if (result !== undefined) child.stdout.write(`${JSON.stringify({ id: request.id, ...result })}\n`);
    });
    done();
  } });
  return { child, requests, launch: (command, args) => {
    assert.equal(command, 'codex'); assert.deepEqual(args, ['app-server', '--stdio']); return child;
  } };
}

test('startup discovery initializes, paginates and closes without any task requests', async () => {
  const fake = fakeLaunch([{ result: {} }, { result: { data: [row()], nextCursor: 'next' } },
    { result: { data: [row('another', ['high'])], nextCursor: null } }]);
  const catalog = await discoverCodexModels(fake);
  assert.deepEqual([...catalog], [['gpt-example', ['low', 'medium']], ['another', ['high']]]);
  assert.deepEqual(fake.requests.map(r => r.method), ['initialize', 'initialized', 'model/list', 'model/list']);
  assert.equal(fake.requests[3].params.cursor, 'next');
  assert.equal(fake.child.killed, true);
});

test('failed, duplicate or malformed catalogs are discarded entirely', async () => {
  for (const replies of [
    [{ error: { message: 'secret' } }],
    [{ result: {} }, { result: { data: [row('bad model')] } }],
    [{ result: {} }, { result: { data: [row(), row()] } }],
    [{ result: {} }, { result: { data: [row()], nextCursor: 'x' } }, { result: { data: [], nextCursor: 'x' } }],
  ]) {
    const fake = fakeLaunch(replies);
    assert.equal(await discoverCodexModels(fake), null);
    assert.equal(fake.child.killed, true);
  }
  assert.equal(await discoverCodexModels({ launch() { throw new Error('not installed'); } }), null);
  for (const value of [null, {}, { data: [row('x', [])] }, { data: [row('x', ['low', 'low'])] }]) {
    assert.throws(() => parseModelPage(value));
  }
});

test('discovery deadline kills a silent process', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fake = fakeLaunch([]);
  const result = discoverCodexModels(fake);
  t.mock.timers.tick(4000);
  assert.equal(await result, null);
  assert.equal(fake.child.killed, true);
});
