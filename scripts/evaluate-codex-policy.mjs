import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { cases, routingInput, supported } from '../eval/codex-policy-cases.mjs';
import { prepareRoutingRequest, HARNESS_VERSIONS } from '../src/harness.js';
import { parseHelperBody, validJevKey } from '../src/providers/jev.js';
import { classifyJev } from '../mcp/shadow.mjs';
import { createRouter } from '../codex/router.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function plan() {
  return { kind: 'codex-policy-pilot', ...HARNESS_VERSIONS, corpusSha256: hash(cases),
    maxCalls: cases.length, retries: 0, realModelCalls: 0, enforceApproved: false,
    items: cases.map(item => ({ id: item.id, baseline: item.currentEffort, expected: item.expected,
      requestSha256: hash(prepareRoutingRequest(routingInput(item)).request) })) };
}

export async function evaluate(apiKey, classify = classifyJev) {
  const report = { ...plan(), mode: 'live', startedAt: new Date().toISOString(), attempted: 0, results: [] };
  for (const item of cases) {
    report.attempted++;
    const input = routingInput(item);
    let result;
    try { result = await classify(input, apiKey, AbortSignal.timeout(4000)); }
    catch { result = { reason: 'provider-error' }; }
    const checked = parseHelperBody(result?.decision ? { ok: true, decision: result.decision }
      : { ok: false, reason: result?.reason, diagnostic: result?.diagnostic }, prepareRoutingRequest(input).choices);
    if (!checked.decision) { report.results.push({ id: item.id, ...checked }); break; }
    const route = createRouter({ mode: 'enforce', consent: true, apiKey: 'offline-replay' }, async () => checked);
    const candidate = await route({ params: { threadId: input.event.sessionId, input: [{ type: 'text', text: item.userPrompt }] },
      model: input.target.model, effort: item.currentEffort, supported, requestId: item.id, signal: new AbortController().signal });
    const { choice } = checked.decision;
    // Counterfactual equivalent of Claude's Jev applicable() for these validated, supported inputs.
    // This is not a Claude runtime test and does not authorize that policy for Codex.
    const choiceOnly = choice === 'keep' || choice === item.currentEffort ? null : choice;
    const holds = ['missing-context', 'long-context', 'production-risk'].includes(item.id);
    const acceptable = value => holds ? value === null : item.expected.includes(value ?? item.currentEffort);
    report.results.push({ id: item.id, ...checked, codexCandidate: candidate, choiceOnlyCandidate: choiceOnly,
      recommendationExpected: item.expected.includes(choice), codexExpected: acceptable(candidate),
      choiceOnlyExpected: acceptable(choiceOnly) });
  }
  report.completed = report.results.length === cases.length && report.results.every(row => row.decision);
  return report;
}

export async function main(args, env, write) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
    write(JSON.stringify({ ...plan(), mode: 'dry-run', attempted: 0 }, null, 2)); return 0;
  }
  if (args.length !== 1 || args[0] !== '--live') { write('usage: evaluate-codex-policy.mjs [--dry-run | --live]'); return 1; }
  if (!validJevKey(env.TYPESAFE_API_KEY)) { write('missing-key'); return 1; }
  const report = await evaluate(env.TYPESAFE_API_KEY);
  write(JSON.stringify(report, null, 2));
  return report.completed ? 0 : 1; // Collection success, not policy or quality approval.
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2), process.env, text => process.stdout.write(`${text}\n`));
}
