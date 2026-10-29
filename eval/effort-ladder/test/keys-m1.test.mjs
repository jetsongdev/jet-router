import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadKeys } from '../lib/keys.mjs';
import { runM1 } from '../scripts/m1-jev.mjs';
import { sha256 } from '../lib/ids.mjs';

const canary = 'canary-secret-never-print-84752';
const valid = (choice = 'low', probability = 0.7) => ({ ok: true, decision: { choice, selectedProbability: probability, confidence: 0.8, contextScore: 0.5, riskScore: 0.2 } });
test('keys file checks, parsing, and check CLI never reveal values', () => {
 const dir = mkdtempSync(join(tmpdir(), 'keys-test-')), path = join(dir, 'keys');
 try {
  assert.throws(() => loadKeys(path), { code: 'missing' });
  writeFileSync(path, `export ANTHROPIC_API_KEY="${canary}" # comment\nTYPESAFE_API_KEY=''\nOTHER=${canary}\n`, { mode: 0o600 });
  assert.deepEqual(loadKeys(path), { ANTHROPIC_API_KEY: canary, TYPESAFE_API_KEY: '' });
  const cli = spawnSync(process.execPath, ['scripts/keys-check.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { LADDER_KEYS_FILE: path } });
  assert.equal(cli.status, 0); assert.deepEqual(JSON.parse(cli.stdout), {file:'ok', ANTHROPIC_API_KEY:'set', TYPESAFE_API_KEY:'empty'}); assert.ok(!(cli.stdout + cli.stderr).includes(canary));
  chmodSync(path, 0o644); assert.throws(() => loadKeys(path), { code: 'insecure-mode' });
  chmodSync(path, 0o600); writeFileSync(path, 'x'.repeat(65537)); assert.throws(() => loadKeys(path), { code: 'too-large' });
  writeFileSync(path, `ANTHROPIC_API_KEY=${canary}\nANTHROPIC_API_KEY=${canary}\n`); assert.deepEqual(loadKeys(path), {});
  assert.throws(() => loadKeys(new URL('../CONTRACT.md', import.meta.url).pathname), {code:'inside-repository'});
 } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('38 mock decisions, gate, resume, only-failed and key secrecy', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'm1-test-')), out = join(dir, 'out.jsonl'); let calls = 0;
 const request = async ({apiKey, routingInput}, timeout) => { assert.equal(apiKey, canary); assert.equal(timeout, 10000); assert.equal(routingInput.context.source, 'prompt-only'); calls++; if (calls === 1) return {ok:false, reason:'timeout'}; return valid(calls === 2 ? 'low' : 'low', calls === 2 ? 0.699 : 0.7); };
 try {
  const a = await runM1({outputPath:out, gapMs:0, timeoutMs:10000}, {request, apiKey:canary}); assert.equal(calls,38); assert.equal(a.success,37); assert.equal(a.failures.timeout,1);
  let rows = readFileSync(out,'utf8').trim().split('\n').map(JSON.parse); assert.equal(rows[1].applied,'high'); assert.equal(rows[2].applied,'low'); assert.ok(!JSON.stringify({a,rows}).includes(canary));
  calls=0; const b=await runM1({outputPath:out, onlyFailed:true, gapMs:0, timeoutMs:10000}, {request: async () => {calls++; return valid('keep');}, apiKey:canary}); assert.equal(calls,1); assert.equal(b.success,38);
  calls=0; await runM1({outputPath:out, gapMs:0}, {request:async()=>{calls++;return valid();}, apiKey:canary}); assert.equal(calls,0);
  assert.ok(!readFileSync(out,'utf8').includes(canary));
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('cap, hash validation and unpaid CLI', async () => {
 const dir=mkdtempSync(join(tmpdir(),'m1-test-')), out=join(dir,'out'), manifest=join(dir,'manifest'); let calls=0;
 try {
  const r=await runM1({outputPath:out,maxCalls:3,gapMs:0}, {request:async()=>{calls++;return valid();}}); assert.equal(calls,3); assert.equal(r.capped,true);
  writeFileSync(manifest,JSON.stringify([{task_id:'x',prompt:'changed',prompt_sha256:sha256('original')}]));
  await assert.rejects(runM1({manifestPath:manifest,outputPath:out},{request:async()=>{calls++;}}),/hash mismatch/); assert.equal(calls,3);
  const cli=spawnSync(process.execPath,['scripts/m1-jev.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{}}); assert.equal(cli.status,3); assert.match(cli.stderr,/paid call blocked/); assert.ok(!(cli.stdout+cli.stderr).includes(canary));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
