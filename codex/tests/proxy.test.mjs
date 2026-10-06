import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { WebSocket } from 'ws';
import { startProxy } from '../proxy.mjs';

// Fake backend, real local WebSocket: advance deadlines without wall-clock sleeps.
test('slow thread bootstrap survives 15s; normal RPC and bootstrap still have bounded deadlines', { timeout: 5000 }, async t => {
  const requests = new EventEmitter();
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = null; child.signalCode = null;
  child.stdin = new Writable({ write(chunk, _, done) {
    const message = JSON.parse(chunk);
    requests.emit(message.method, message);
    if (message.method === 'initialize' || message.method === 'model/list') {
      child.stdout.write(JSON.stringify({ id: message.id, result: message.method === 'model/list' ? { data: [], nextCursor: null } : {} }) + '\n');
    }
    done();
  } });
  child.kill = () => { child.signalCode = 'SIGTERM'; child.emit('exit', null, 'SIGTERM'); };
  const proxy = await startProxy({ config: { mode: 'off' }, launch: () => child });
  const ws = new WebSocket(`ws+unix://${proxy.socketPath}:/`);
  const messages = [];
  ws.on('message', bytes => messages.push(JSON.parse(bytes)));
  const send = (id, method) => ws.send(JSON.stringify({ id, method, params: {} }));
  try {
    await once(ws, 'open');
    const ready = once(ws, 'message'); send(1, 'initialize'); await ready;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const pending = once(requests, 'thread/start'); send(2, 'thread/start');
    const [start] = await pending;
    t.mock.timers.tick(15001);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.some(message => message.id === 2), false);
    const answered = once(ws, 'message');
    child.stdout.write(JSON.stringify({ id: start.id, result: { thread: { id: 'fixture' } } }) + '\n');
    await answered;
    assert.equal(messages.find(message => message.id === 2).result.thread.id, 'fixture');
    const read = once(requests, 'thread/read'); send(3, 'thread/read'); await read;
    const timedOut = once(ws, 'message'); t.mock.timers.tick(15000); await timedOut;
    assert.equal(messages.find(message => message.id === 3).error.message, 'backend-request-failed');
    const slow = once(requests, 'thread/start'); send(4, 'thread/start'); await slow;
    const bounded = once(ws, 'message'); t.mock.timers.tick(60000); await bounded;
    assert.equal(messages.find(message => message.id === 4).error.message, 'backend-request-failed');
  } finally {
    t.mock.timers.reset(); ws.close(); await proxy.close();
  }
});
