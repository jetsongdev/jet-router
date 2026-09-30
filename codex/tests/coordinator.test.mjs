import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinator } from '../coordinator.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const turn = (id = 1) => ({ id, method: 'turn/start', params: { threadId: 't', input: [{ type: 'text', text: 'fix' }] } });
function setup(overrides = {}) {
  const calls = [], replies = [];
  let effort = 'medium';
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (overrides.rpc) { const result = await overrides.rpc(method, params); if (result !== undefined) return result; }
    if (method === 'thread/read') return { thread: { model: 'gpt-6-astra', reasoningEffort: effort, status: { type: 'idle' } } };
    if (method === 'turn/start') { effort = params.effort ?? effort; return { turn: { id: 'turn1' } }; }
    if (method === 'thread/settings/update') effort = params.effort;
    return {};
  };
  return { calls, replies, effort: () => effort, coordinator: createCoordinator({ rpc,
    reply: x => replies.push(x), route: overrides.route ?? (async () => 'low') }) };
}
test('first request changes and restores before next queued turn; replies before restore', async () => {
  const gate = deferred(); const s = setup({ rpc: async method => { if (method === 'thread/settings/update') await gate.promise; } });
  const first = s.coordinator.handle(turn());
  while (!s.replies.length) await new Promise(r => setImmediate(r));
  assert.equal(s.effort(), 'low');
  const second = s.coordinator.handle(turn(2));
  assert.equal(s.calls.filter(c => c.method === 'turn/start').length, 1);
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(s.effort(), 'medium');
  assert.equal(s.calls.find(c => c.method === 'turn/start').params.effort, 'low');
});
test('manual setting arriving during restoration wins', async () => {
  const s = setup(); await s.coordinator.handle(turn());
  await s.coordinator.handle({ id: 2, method: 'thread/settings/update', params: { threadId: 't', effort: 'high' } });
  await s.coordinator.handle(turn(3)); assert.equal(s.effort(), 'high');
});
test('restoration failure blocks next turn until explicit manual recovery', async () => {
  let fail = true;
  const s = setup({ rpc: async (method, p) => { if (method === 'thread/settings/update' && p.effort === 'medium' && fail) throw Error(); } });
  await s.coordinator.handle(turn()); await s.coordinator.handle(turn(2));
  assert.match(s.replies.at(-1).error.message, /restore-failed/);
  assert.equal(s.calls.filter(c => c.method === 'turn/start').length, 1);
  fail = false;
  await s.coordinator.handle({ id: 3, method: 'thread/settings/update', params: { threadId: 't', effort: 'high' } });
  await s.coordinator.handle(turn(4)); assert.equal(s.effort(), 'high');
});
test('interrupt during classification cancels submission without changing defaults', async () => {
  const entered = deferred(); const s = setup({ route: ({ signal }) => { entered.resolve(); return new Promise(r => signal.addEventListener('abort', () => r(null))); } });
  const task = s.coordinator.handle(turn()); await entered.promise;
  await s.coordinator.handle({ id: 2, method: 'turn/interrupt', params: { threadId: 't', turnId: 'pending' } });
  await task;
  assert.equal(s.calls.some(c => c.method === 'turn/start'), false);
  assert.match(s.replies.find(r => r.id === 1).error.message, /routing-cancelled/);
});
test('disconnect while classifying prevents any submission', async () => {
  const entered = deferred(); const s = setup({ route: ({ signal }) => { entered.resolve(); return new Promise(r => signal.addEventListener('abort', () => r(null))); } });
  const task = s.coordinator.handle(turn()); await entered.promise; await s.coordinator.close(); await task;
  assert.equal(s.calls.some(c => c.method === 'turn/start'), false);
});
test('rejected start still restores; collaboration mode baseline is retained', async () => {
  const s = setup({ rpc: async method => { if (method === 'turn/start') throw Error(); } });
  const message = turn(); message.params.collaborationMode = { mode: 'default', settings: { model: 'gpt-6-astra', reasoning_effort: 'high', developer_instructions: null } };
  await s.coordinator.handle(message);
  const restore = s.calls.at(-1);
  assert.equal(restore.params.effort, 'high');
  assert.equal(restore.params.collaborationMode.settings.reasoning_effort, 'high');
  assert.equal(message.params.collaborationMode.settings.reasoning_effort, 'high');
});
test('active turn is never reclassified', async () => {
  let classified = false;
  const s = setup({ rpc: async method => method === 'thread/read' ? { thread: { status: { type: 'active', activeFlags: [] }, model: 'gpt-6-astra', reasoningEffort: 'medium' } } : undefined,
    route: async () => { classified = true; return 'low'; } });
  await s.coordinator.handle(turn()); assert.equal(classified, false);
  assert.equal(s.calls.find(c => c.method === 'turn/start').params.effort, undefined);
});
test('manual update during a slow classification discards recommendation', async () => {
  const entered = deferred(); const s = setup({ route: ({ signal }) => { entered.resolve(); return new Promise(r => signal.addEventListener('abort', () => r('low'))); } });
  const task = s.coordinator.handle(turn()); await entered.promise;
  const manual = s.coordinator.handle({ id: 2, method: 'thread/settings/update', params: { threadId: 't', effort: 'high' } });
  await Promise.all([task, manual]);
  assert.equal(s.effort(), 'high'); assert.equal(s.calls.some(c => c.method === 'turn/start'), false);
});
test('manual update queued during slow restoration executes afterwards', async () => {
  const restoring = deferred(), release = deferred();
  const s = setup({ rpc: async (method, p) => { if (method === 'thread/settings/update' && p.effort === 'medium') { restoring.resolve(); await release.promise; } } });
  const task = s.coordinator.handle(turn()); await restoring.promise;
  const manual = s.coordinator.handle({ id: 2, method: 'thread/settings/update', params: { threadId: 't', effort: 'high' } });
  assert.equal(s.effort(), 'low'); release.resolve(); await Promise.all([task, manual]);
  assert.equal(s.effort(), 'high');
});
test('disconnect after submission still attempts restoration', async () => {
  const sent = deferred(), release = deferred();
  const s = setup({ rpc: async method => { if (method === 'turn/start') { sent.resolve(); await release.promise; } } });
  const task = s.coordinator.handle(turn()); await sent.promise;
  const close = s.coordinator.close(); release.resolve(); await Promise.all([task, close]);
  assert.equal(s.calls.at(-1).method, 'thread/settings/update'); assert.equal(s.effort(), 'medium');
});
test('interrupt of submitted turn is forwarded, not swallowed', async () => {
  const sent = deferred(), release = deferred();
  const s = setup({ rpc: async method => { if (method === 'turn/start') { sent.resolve(); await release.promise; } } });
  const task = s.coordinator.handle(turn()); await sent.promise;
  await s.coordinator.handle({ id: 2, method: 'turn/interrupt', params: { threadId: 't', turnId: 'turn1' } });
  assert.equal(s.calls.some(c => c.method === 'turn/interrupt'), true);
  release.resolve(); await task; assert.equal(s.effort(), 'medium');
});
