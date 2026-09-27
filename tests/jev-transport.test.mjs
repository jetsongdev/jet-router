import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { requestJev } from '../scripts/jev-request.mjs';
import { parseHelperResult } from '../src/providers/jev.js';

const input = { apiKey: 'KEY_CANARY', state: { userPrompt: 'PROMPT_CANARY', currentEffort: 'medium', taskContext: 'CONTEXT_CANARY' } };
const body = () => ({ model: 'jev-test', answers: {
  effort: { type: 'choice', choice: 'low', confidence: 0.8,
    probabilities: { low: 0.8, medium: 0.05, high: 0.05, xhigh: 0.05, keep: 0.05 } },
  contextSufficient: { type: 'noul', noul: 0.95 }, risky: { type: 'noul', noul: 0.02 },
}, raw: 'RESPONSE_CANARY' });

function transport({ code = 200, headers = {}, chunks = [JSON.stringify(body())], hang = false, error = false } = {}) {
  const calls = [];
  const request = (url, options, callback) => {
    const req = new EventEmitter();
    req.destroy = () => { req.destroyed = true; };
    req.end = data => {
      calls.push({ url, options, data, req });
      queueMicrotask(() => {
        if (error) { req.emit('error', new Error('ERROR_CANARY')); return; }
        if (hang) return;
        const res = new PassThrough();
        res.statusCode = code; res.headers = headers;
        calls[0].res = res;
        callback(res);
        for (const chunk of chunks) if (!res.destroyed) res.write(chunk);
        if (!res.destroyed) res.end();
      });
    };
    return req;
  };
  return { request, calls };
}

test('Jev transport fixes destination, verifies TLS, excludes history, and sanitizes output', async () => {
  const t = transport();
  const result = await requestJev(input, t.request);
  assert.equal(result.ok, true); assert.equal(result.decision.choice, 'low');
  assert.equal(result.decision.contextScore, 0.95);
  const call = t.calls[0];
  assert.equal(call.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(call.options.method, 'POST'); assert.equal(call.options.rejectUnauthorized, true);
  assert.equal(call.options.headers.Authorization, 'Bearer KEY_CANARY');
  assert.equal(JSON.parse(call.data).state.taskContext, null);
  assert.equal(call.options.headers['Content-Length'], Buffer.byteLength(call.data));
  assert.ok(!JSON.stringify(result).includes('CANARY'));
});

test('every redirect is rejected without a follow-up, including cross-origin 307/308', async () => {
  for (const code of [301, 302, 303, 307, 308]) {
    const t = transport({ code, headers: { location: 'https://unapproved.invalid/' } });
    assert.deepEqual(await requestJev(input, t.request), { ok: false, reason: 'redirect' });
    assert.equal(t.calls.length, 1); assert.equal(t.calls[0].req.destroyed, true);
    assert.equal(t.calls[0].res.destroyed, true);
  }
});

test('HTTP, malformed, numeric, stream and size errors fail closed with fixed codes', async () => {
  const invalid = body(); invalid.answers.risky.noul = '1';
  for (const [config, reason] of [
    [{ code: 401 }, 'http-error'], [{ code: 500 }, 'http-error'],
    [{ chunks: ['MALFORMED_CANARY'] }, 'invalid-response'],
    [{ chunks: [JSON.stringify(invalid)] }, 'invalid-response'],
    [{ headers: { 'content-length': '65537' } }, 'response-too-large'],
    [{ chunks: [Buffer.alloc(32768), Buffer.alloc(32769)] }, 'response-too-large'],
    [{ error: true }, 'provider-error'],
  ]) {
    const t = transport(config);
    assert.deepEqual(await requestJev(input, t.request), { ok: false, reason });
  }
});

test('absolute timeout destroys a stalled request; bad input never starts transport', async () => {
  const t = transport({ hang: true });
  assert.deepEqual(await requestJev(input, t.request, 10), { ok: false, reason: 'timeout' });
  assert.equal(t.calls[0].req.destroyed, true);
  let calls = 0;
  for (const value of [{}, { ...input, apiKey: 'bad\nkey' }, { ...input, state: {} }]) {
    assert.equal((await requestJev(value, () => { calls++; })).ok, false);
  }
  assert.equal(calls, 0);
});

test('helper protocol rejects untrusted output and preserves only normalized evidence', async () => {
  const result = await requestJev(input, transport().request);
  const parsed = parseHelperResult({ exitCode: 0, stdout: JSON.stringify(result), stderr: 'ERROR_CANARY' });
  assert.equal(parsed.decision.choice, 'low'); assert.ok(!JSON.stringify(parsed).includes('CANARY'));
  for (const value of [
    { exitCode: 1, stdout: 'KEY_CANARY' }, { exitCode: 0, stdout: 'x'.repeat(2049) },
    { exitCode: 0, stdout: JSON.stringify({ ok: false, reason: 'KEY_CANARY' }) },
    { exitCode: 0, stdout: JSON.stringify({ ok: true, decision: { ...result.decision, confidence: 2 } }) },
  ]) assert.ok(parseHelperResult(value).reason);
});

test('real helper CLI handles missing keys, malformed and oversized stdin without leaking canaries', () => {
  for (const text of ['PROMPT_CANARY', JSON.stringify({ state: input.state }), 'x'.repeat(65537)]) {
    const result = spawnSync(process.execPath, ['scripts/jev-request.mjs'], {
      input: text, encoding: 'utf8', timeout: 2000,
      env: { ...process.env, NODE_OPTIONS: '', NODE_DEBUG: '', NODE_DEBUG_NATIVE: '', SSLKEYLOGFILE: '' },
    });
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.ok(!result.stdout.includes('CANARY'));
  }
});

test('trickling responses cannot extend the absolute deadline', async () => {
  let res, req, interval;
  const request = (_url, _options, callback) => {
    req = new EventEmitter(); req.destroy = () => { req.destroyed = true; };
    req.end = () => queueMicrotask(() => {
      res = new PassThrough(); res.statusCode = 200; res.headers = {};
      callback(res);
      interval = setInterval(() => res.write(' '), 2);
    });
    return req;
  };
  try {
    assert.deepEqual(await requestJev(input, request, 20), { ok: false, reason: 'timeout' });
    assert.equal(req.destroyed, true); assert.equal(res.destroyed, true);
  } finally { clearInterval(interval); }
});

test('a model name containing a canary never crosses the helper output boundary', async () => {
  const response = body(); response.model = 'PROMPT_CANARY';
  const result = await requestJev(input, transport({ chunks: [JSON.stringify(response)] }).request);
  assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes('CANARY'));
});
