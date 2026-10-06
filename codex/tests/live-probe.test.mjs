import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectItems } from '../live-evidence.mjs';
const script = fileURLToPath(new URL('../probe-live.mjs', import.meta.url));
test('live probe defaults to a zero-call plan and requires explicit live opt-in plus key', () => {
  const run = args => spawnSync(process.execPath, [script, ...args], { env: {}, encoding: 'utf8', timeout: 5000 });
  const dry = run([]);
  assert.equal(dry.status, 0);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.maxModelTurns, 2); assert.equal(plan.maxJevCalls, 1);
  assert.equal(plan.costComparison, false); assert.equal(plan.wireObserved, false);
  assert.equal(run(['--unexpected']).status, 1);
  assert.equal(run(['--live', '/tmp/must-not-create-jet-router.json']).status, 1);
});

test('user message lifecycle is not tool use; actual tools and unknown items remain flagged', () => {
  const messages = [{ type: 'userMessage' }, { type: 'reasoning' }, { type: 'agentMessage', text: 'Hello, name!' }];
  assert.deepEqual(inspectItems(messages), { itemTypes: ['userMessage', 'reasoning', 'agentMessage'], outputMatches: true, usedTools: false });
  for (const type of ['commandExecution', 'mcpToolCall', 'webSearch', 'fileChange', 'futureItem']) {
    assert.equal(inspectItems([...messages, { type }]).usedTools, true);
  }
  assert.equal(inspectItems([{ type: 'agentMessage', text: 'Helllo, name!' }]).outputMatches, false);
});
