import { appendFileSync } from 'node:fs';
import { createServer } from '../../server.mjs';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

const mark = text => {
  process.stderr.write(`${text}\n`);
  if (process.argv[2]) appendFileSync(process.argv[2], `${text}\n`);
};

// Offline provider only; stderr markers synchronize the test without sleeps.
let calls = 0;
const decision = { provider: 'jev', choice: 'low', confidence: .8, selectedProbability: .9, contextScore: .8, riskScore: .1 };
await createServer({ mode: 'shadow', provider: 'jev', consent: true, referenceEffort: 'medium', apiKey: 'fixture-key' },
  async (_input, _key, signal) => {
    if (++calls === 1) {
      mark('started');
      await new Promise(resolve => {
        signal.addEventListener('abort', () => { mark('aborted'); resolve(); }, { once: true });
      });
    }
    return { decision };
  }).connect(new StdioServerTransport());
