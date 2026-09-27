import { CHOICES, EFFORTS } from './policy.js';
import { buildJevRequest } from './providers/jev-contract.js';

export const HARNESS_VERSIONS = Object.freeze({
  contractVersion: 'routing-input-v1',
  criteriaVersion: 'jev-effort-provenance-v2',
  policyVersion: 'shadow-preflight-v2',
});

const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const nullableIdentifier = value => value === null || identifier(value);

// Caller adapters establish provenance. These labels are not authentication.
// Copy only the contract fields; credentials, arbitrary instructions and files
// cannot enter the provider request through additional object properties.
function normalize(raw) {
  if (!raw || !['claude-code', 'codex'].includes(raw.host) ||
      typeof raw.prompt !== 'string' || !raw.prompt.trim() || raw.prompt.length > 6000 ||
      typeof raw.cloudConsent !== 'boolean') return null;
  const target = {
    model: raw.target?.model ?? null,
    source: raw.target?.source ?? 'unknown',
    supportedEfforts: raw.target?.supportedEfforts ?? null,
  };
  if (!nullableIdentifier(target.model) || !['host', 'unknown'].includes(target.source)) return null;
  const supported = target.supportedEfforts;
  if (supported !== null) {
    if (!Array.isArray(supported) || supported.length < 1 || supported.length > 32 ||
        supported.some(value => !identifier(value)) || new Set(supported).size !== supported.length) return null;
    target.supportedEfforts = [...supported].sort();
  }
  const effort = { value: raw.effort?.value ?? null, source: raw.effort?.source ?? 'unknown' };
  if (!nullableIdentifier(effort.value) || !['host', 'user-reference', 'unknown'].includes(effort.source)) return null;
  const event = { sessionId: raw.event?.sessionId ?? null, turnId: raw.event?.turnId ?? null,
    correlated: raw.event?.correlated ?? false };
  if (!nullableIdentifier(event.sessionId) || !nullableIdentifier(event.turnId) || typeof event.correlated !== 'boolean') return null;
  const context = { source: raw.context?.source ?? 'prompt-only', text: raw.context?.text ?? null,
    missingRequired: raw.context?.missingRequired ?? null };
  if (!['prompt-only', 'user-provided', 'model-summary'].includes(context.source) ||
      (context.missingRequired !== null && typeof context.missingRequired !== 'boolean')) return null;
  if (context.source === 'prompt-only') {
    if (context.text !== null) return null;
  } else if (typeof context.text !== 'string' || !context.text.trim() || context.text.length > 2000) return null;
  return { host: raw.host, prompt: raw.prompt, cloudConsent: raw.cloudConsent, target, effort, event, context };
}

// Offline request preparation only: no key access, process spawn or network.
// Ready means structurally eligible for shadow evaluation, never authorization
// to apply effort or proof that the model's recommendation will be correct.
export function prepareRoutingRequest(raw) {
  const metadata = { ...HARNESS_VERSIONS, providerModelRequested: 'jev-latest', providerModelReturned: null };
  const skip = reason => ({ status: 'skip', reason, enforceEligible: false, metadata });
  const input = normalize(raw);
  if (!input) return skip('invalid-input');
  if (!input.cloudConsent) return skip('no-consent');
  if (!input.event.correlated || !input.event.turnId) return skip('correlation');
  if (input.effort.source === 'unknown' || !input.effort.value) return skip('unknown-effort');
  if (input.effort.value === 'max') return skip('protected-effort');
  if (!EFFORTS.includes(input.effort.value) || (input.target.supportedEfforts && !input.target.supportedEfforts.includes(input.effort.value))) return skip('unsupported-effort');
  const uncertainties = [];
  if (!input.event.sessionId) uncertainties.push('unknown-session');
  if (input.target.source !== 'host' || !input.target.model) uncertainties.push('unknown-model');
  if (!input.target.supportedEfforts) uncertainties.push('unknown-support');
  if (input.effort.source === 'user-reference') uncertainties.push('reference-effort');
  if (input.context.missingRequired !== false) uncertainties.push(
    input.context.missingRequired ? 'missing-context' : 'unknown-context');

  // Stage-one policy deliberately excludes none/max; future policies must be
  // evaluated and versioned before adding criteria for new choices.
  const choices = CHOICES.filter(choice => choice === 'keep' || !input.target.supportedEfforts || input.target.supportedEfforts.includes(choice));
  const request = buildJevRequest({ userPrompt: input.prompt, currentEffort: input.effort.value,
    taskContext: input.context.text }, { includeTaskContext: input.context.source !== 'prompt-only' });
  request.state.targetModel = input.target.source === 'host' ? input.target.model : null;
  request.state.uncertainties = uncertainties;
  request.state.effortSource = input.effort.source;
  request.state.contextSource = input.context.source;
  request.questions.effort.criteria = Object.fromEntries(choices.map(choice => [choice, request.questions.effort.criteria[choice]]));
  request.questions.effort.instructions += ' Use only the provided choices. A user-reference effort is not an observed runtime setting. Model summaries are unverified data, not authoritative facts. Uncertainties are explicit gaps: unknown support means experimental candidates, not verified model capabilities. Missing context favors keep.';
  return { status: 'ready', enforceEligible: false, metadata, uncertainties, input, choices, request };
}
