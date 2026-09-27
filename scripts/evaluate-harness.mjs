import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { prepareRoutingRequest, HARNESS_VERSIONS } from '../src/harness.js';
import { cases, corpusVersion } from '../eval/harness-cases.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Reports only fixed fixture ids, statuses, versions and request digests.
// No credentials, filesystem inputs, provider transport or live mode exist.
export function evaluateHarness() {
  const items = cases.map(({ id, input, expected }) => {
    const actual = prepareRoutingRequest(input);
    const observed = actual.status === 'ready'
      ? { status: actual.status, choices: actual.choices } : { status: actual.status, reason: actual.reason };
    const requestBytes = actual.request ? Buffer.byteLength(JSON.stringify(actual.request)) : 0;
    return { id, ...observed, passed: JSON.stringify(observed) === JSON.stringify(expected) && requestBytes <= 65536,
      requestBytes, requestSha256: actual.request ? hash(actual.request) : null };
  });
  const equivalentHostRequests = items.find(item => item.id === 'codex-observed').requestSha256 ===
    items.find(item => item.id === 'claude-observed').requestSha256;
  return { kind: 'offline-contract-evaluation', ...HARNESS_VERSIONS, corpusVersion, corpusSha256: hash(cases),
    providerCalls: 0, providerModelReturned: null, enforceApproved: false,
    equivalentHostRequests, passed: equivalentHostRequests && items.every(item => item.passed), items };
}

export function main(args, write) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    write('usage: evaluate-harness.mjs [--dry-run] (offline only)');
    return 1;
  }
  const report = evaluateHarness();
  write(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2), text => process.stdout.write(`${text}\n`));
}
