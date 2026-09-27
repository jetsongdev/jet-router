import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { prepareRoutingRequest } from '../src/harness.js';
import { validJevKey } from '../src/providers/jev.js';
import { buildJevRequest, inspectJevResponse } from '../src/providers/jev-contract.js';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const LIMIT = 65536;
const fail = reason => ({ ok: false, reason });

// Transport injection is for offline tests only; the CLI always uses HTTPS to ENDPOINT.
export async function requestJev(input, request = https.request, timeoutMs = 3000) {
  if (!validJevKey(input?.apiKey)) return fail('missing-key');
  let body, choices, allowRoundedSum = false;
  try {
    // Accept facts, never caller-supplied questions. No legacy fallback on skips.
    const hasRoutingInput = Object.hasOwn(input, 'routingInput');
    if (hasRoutingInput && Object.hasOwn(input, 'state')) return fail('invalid-input');
    let payload;
    if (hasRoutingInput) {
      const prepared = prepareRoutingRequest(input.routingInput);
      if (prepared.status !== 'ready') return fail('invalid-input');
      payload = prepared.request;
      allowRoundedSum = true; // Shared harness is shadow-only; legacy evaluations stay strict.
    } else {
      payload = buildJevRequest(input.state);
    }
    choices = Object.keys(payload.questions.effort.criteria);
    body = JSON.stringify(payload);
  } catch { return fail('invalid-input'); }
  if (Buffer.byteLength(body) > LIMIT) return fail('invalid-input');
  return new Promise(resolveResult => {
    let req, response, done = false;
    const agent = new https.Agent({ rejectUnauthorized: true, proxyEnv: {} });
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      response?.destroy();
      req?.destroy();
      agent.destroy();
      resolveResult(result);
    };
    // Absolute deadline, including DNS/TLS and a response that keeps trickling.
    const timer = setTimeout(() => finish(fail('timeout')), timeoutMs);
    try {
      req = request(ENDPOINT, { method: 'POST', agent, rejectUnauthorized: true, headers: {
        Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body), Accept: 'application/json',
      } }, res => {
        response = res;
        res.on('error', () => finish(fail('provider-error')));
        if (done) { res.destroy(); return; }
        if (res.statusCode >= 300 && res.statusCode < 400) { finish(fail('redirect')); return; }
        if (!(res.statusCode >= 200 && res.statusCode < 300)) { finish(fail('http-error')); return; }
        if (Number(res.headers['content-length']) > LIMIT) { finish(fail('response-too-large')); return; }
        let bytes = 0;
        const chunks = [];
        res.on('data', chunk => {
          if (done) return;
          bytes += chunk.length;
          if (bytes > LIMIT) { finish(fail('response-too-large')); return; }
          chunks.push(chunk);
        });
        res.on('aborted', () => finish(fail('provider-error')));
        res.on('end', () => {
          if (done) return;
          const inspected = inspectJevResponse(Buffer.concat(chunks).toString('utf8'), choices, { allowRoundedSum });
          const decision = inspected.decision;
          finish(decision ? { ok: true, decision: { provider: 'jev', choice: decision.choice,
            confidence: decision.confidence, selectedProbability: decision.selectedProbability, contextScore: decision.contextScore, riskScore: decision.riskScore }, ...(inspected.warning ? { warning: inspected.warning } : {}) }
            : { ...fail('invalid-response'), diagnostic: inspected.error });
        });
      });
      req.on('error', () => finish(fail('provider-error')));
      req.end(body);
    } catch { finish(fail('provider-error')); }
  });
}

async function readInput(stream) {
  const timer = setTimeout(() => stream.destroy(new Error('input-timeout')), 1000);
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > LIMIT) throw new Error('input-too-large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}

export async function main(stdin, stdout) {
  let result;
  try { result = await requestJev(await readInput(stdin)); }
  catch { result = fail('invalid-input'); }
  stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // Sensitive stdin and provider bodies are never printed, including failures.
  await main(process.stdin, process.stdout);
}
