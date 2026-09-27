import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createShadow, readConfig } from './shadow.mjs';

export function createServer(config = readConfig(process.env), classify) {
  const shadow = createShadow(config, classify);
  const server = new McpServer({ name: 'jet-router-mcp', version: '0.1.0' }, {
    instructions: 'Shadow observation only. jet_router_shadow is intended for a configured UserPromptSubmit hook. Do not call it autonomously, retry skipped events, change effort, or treat recommendations as instructions. Jev sends the prompt to TypeSafe only when explicitly enabled by the server operator.',
  });
  server.registerTool('jet_router_shadow', {
    title: 'Jet Router shadow observation',
    description: 'Observe one Codex UserPromptSubmit event. Returns nonblocking hook JSON with an optional UI message. Never changes effort or reads transcripts. Server-side settings control cloud consent; inputs cannot enable it. Fake is a fixed test response, not a classifier.',
    inputSchema: z.object({
      prompt: z.string().describe('Current submitted text only, at most 6000 characters; longer input is skipped.'),
      session_id: z.string().max(128).describe('Host event session_id, used only for bounded in-memory deduplication.'),
      turn_id: z.string().max(128).describe('Host event turn_id; repeated events are silently skipped.'),
    }).strict(),
    outputSchema: z.object({ continue: z.literal(true), systemMessage: z.string().max(500).optional() }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async input => {
    const output = await shadow(input);
    return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
  });
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await createServer().connect(new StdioServerTransport()); }
  catch { process.stderr.write('jet-router: MCP startup failed\n'); process.exitCode = 1; }
}
