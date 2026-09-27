import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));

test('real stdio initialize/list/call: hook JSON, dedup, invalid input, no stdout leakage', { timeout: 10000 }, async t => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath],
    env: { JET_ROUTER_MODE: 'shadow', JET_ROUTER_PROVIDER: 'fake', NODE_OPTIONS: '' }, stderr: 'pipe' });
  const client = new Client({ name: 'jet-router-offline-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data; });
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'jet_router_shadow');
  assert.equal(tools[0].inputSchema.additionalProperties, false);
  assert.equal(tools[0].annotations.openWorldHint, true);
  assert.ok(tools[0].outputSchema);
  const args = { prompt: 'prompt-canary', session_id: 's1', turn_id: 't1' };
  const out = await client.callTool({ name: tools[0].name, arguments: args });
  assert.deepEqual(JSON.parse(out.content[0].text), out.structuredContent);
  assert.equal(out.structuredContent.continue, true);
  assert.match(out.structuredContent.systemMessage, /fake/);
  assert.equal(JSON.stringify(out).includes('prompt-canary'), false);
  const duplicate = await client.callTool({ name: tools[0].name, arguments: args });
  assert.deepEqual(duplicate.structuredContent, { continue: true });
  for (const invalid of [{ ...args, consent: true }, { ...args, prompt: 3 }]) {
    const error = await client.callTool({ name: tools[0].name, arguments: invalid });
    assert.equal(error.isError, true);
    assert.equal(JSON.stringify(error).includes('prompt-canary'), false);
  }
  const long = await client.callTool({ name: tools[0].name, arguments: { ...args, prompt: 'x'.repeat(6001), turn_id: 't2' } });
  assert.equal(long.structuredContent.continue, true);
  assert.match(long.structuredContent.systemMessage, /입력 또는/);
  assert.equal(stderr, '');
});
