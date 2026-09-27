import { prepareRoutingRequest } from '../src/harness.js';
import { parseDecision, EFFORTS } from '../src/policy.js';
import { parseHelperResult, validJevKey, PROCESS_ENV, PROCESS_TIMEOUT_MS } from '../src/providers/jev.js';
import { fakeProvider } from '../src/providers/fake.js';
import { summary, status } from '../src/report.js';

export function register(on, options) {
  registerRouter(on, fakeProvider(options.fakeChoice), options);
}

// The injected fake provider keeps lifecycle tests offline.
export function registerRouter(on, classify, options = {}) {
  const provider = options.provider === 'jev' ? 'jev' : 'fake';
  const flight = { busy: false };
  let mode = 'off';
  let locked = false;
  let pending;
  let lastSummary;
  const turns = new Map();
  const submissions = new Set();

  function isActiveTurn(turnId, turn) {
    return turn.valid && turns.get(turnId) === turn && mode === 'shadow' && !locked;
  }

  function invalidate() {
    pending = undefined;
    for (const turn of turns.values()) invalidateTurn(turn);
    turns.clear();
  }

  on('session.start', async ($, e, next) => {
    invalidate();
    mode = 'off';
    locked = false;
    lastSummary = undefined;
    await $.command.register({ name: 'jet-router', description: 'Effort routing observation (no automatic changes)',
      argumentHint: 'status|shadow|off|lock|unlock', immediate: true });
    return next(e);
  });

  on('command.run', { command: 'jet-router' }, ($, e) => {
    const action = e.args.trim() || 'status';
    if (action === 'enforce') return { text: '자동 적용(enforce)은 아직 사용할 수 없습니다. 실제 요청 검증과 평가 기준 승인이 필요합니다.' };
    if (action === 'off' || action === 'shadow') {
      invalidate();
      mode = action;
    } else if (action === 'lock' || action === 'unlock') {
      invalidate();
      locked = action === 'lock';
    } else if (action !== 'status') {
      return { text: '사용법: /jet-router status|shadow|off|lock|unlock' };
    }
    try { $.ui.status(undefined); } catch { /* No interactive surface. */ }
    return { text: status(mode, locked, lastSummary, provider, options.cloudConsent === true) };
  });

  on('prompt.submit', async ($, e, next) => {
    const ambiguous = mode === 'off' || locked || submissions.size > 0 || turns.size > 0 || e.turnId !== undefined || e.wait ||
      !['composer', 'bridge'].includes(e.origin?.kind) || Boolean(e.attachments?.length) ||
      Boolean(e.context?.length) || !e.text.trim() || e.text.length > 6000;
    if (ambiguous) {
      for (const turn of turns.values()) invalidateTurn(turn);
    }
    const ticket = { text: ambiguous ? undefined : e.text, ambiguous };
    submissions.add(ticket);
    pending = ticket;
    try {
      return await next(e);
    } finally {
      // A turn must have consumed this exact submission synchronously through
      // next. Queued/blocked submissions cannot become a later turn's decision.
      if (pending === ticket) pending = undefined;
      submissions.delete(ticket);
    }
  });

  on('turn.start', ($, e, next) => {
    const ticket = pending;
    pending = undefined;
    const valid = mode === 'shadow' && !locked && turns.size === 0 &&
      ticket && !ticket.ambiguous && ticket.text === e.text;
    for (const turn of turns.values()) invalidateTurn(turn);
    turns.clear();
    if (mode === 'shadow' && !locked) turns.set(e.turnId, { valid: Boolean(valid), text: valid ? e.text : '', started: false });
    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    const turn = e.agentId === undefined ? turns.get(e.turnId) : undefined;
    if (!turn || turn.completing) return next(e);
    turn.completing = true;
    turn.valid = false;
    turn.cancel?.();
    try {
      const result = await next(e);
      if (mode === 'shadow' && !locked && turns.get(e.turnId) === turn && turn.record) {
        lastSummary = summary(turn.record, e.reason);
        publish($, lastSummary);
      }
      return result;
    } finally {
      if (turns.get(e.turnId) === turn) turns.delete(e.turnId);
    }
  });

  on('turn.step', async function* ($, e, next) {
    if (mode !== 'shadow' || locked || e.agentId !== undefined) return yield* next(e);
    const turn = turns.get(e.turnId);
    if (!turn || turn.completing) return yield* next(e);
    if (turn.started) {
      if (turn.model !== (e.model ?? null)) invalidateTurn(turn);
      if (turn.record) turn.record.forwarded = safeEffort(e.effort);
      return yield* next(e);
    }
    turn.started = true;
    turn.model = e.model ?? null;
    const effort = safeEffort(e.effort);
    const record = { provider, mode: 'shadow', original: effort,
      recommendation: 'keep', forwarded: effort, reasonCode: 'correlation', latencyMs: null };
    if (turn.valid && e.index === 0 && effort !== 'max' && effort !== 'unsupported') {
      const timer = new AbortController();
      const began = await $.clock.now();
      if (!isActiveTurn(e.turnId, turn)) return yield* next(e);
      const cancelled = new Promise(resolve => { turn.cancel = () => resolve({ reason: 'cancelled' }); });
      let outcome;
      try {
        outcome = await Promise.race([
          Promise.resolve().then(() => {
            if (!isActiveTurn(e.turnId, turn)) return null;
            const state = { userPrompt: turn.text, currentEffort: e.effort, taskContext: null };
            if (provider === 'jev') {
              const routingInput = {
                host: 'claude-code', prompt: turn.text, cloudConsent: options.cloudConsent === true,
                target: { model: e.model ?? null, source: e.model ? 'host' : 'unknown', supportedEfforts: null },
                effort: { value: e.effort, source: 'host' },
                event: { sessionId: null, turnId: e.turnId, correlated: true },
                context: { source: 'prompt-only', missingRequired: null },
              };
              return classifyJev($, routingInput, options, flight, () => isActiveTurn(e.turnId, turn));
            }
            return classify(state);
          }).then(value => ({ value }), () => ({ reason: 'provider-error' })),
          $.clock.sleep(1000, { signal: timer.signal }).then(() => ({ reason: 'timeout' })),
          cancelled,
        ]);
      } finally {
        timer.abort();
        turn.cancel = undefined;
        turn.text = '';
      }
      if (!isActiveTurn(e.turnId, turn)) return yield* next(e);
      Object.assign(record, classificationResult(provider, outcome));
      record.latencyMs = Math.max(0, (await $.clock.now()) - began);
      if (['no-consent', 'missing-key', 'busy', 'invalid-input'].includes(record.reasonCode)) record.latencyMs = null;
      if (!turn.valid) return yield* next(e);
    } else if (e.effort === 'max') record.reasonCode = 'max';
    else if (effort === 'unsupported') record.reasonCode = 'unsupported';
    if (mode === 'shadow' && !locked && turns.get(e.turnId) === turn) turn.record = record;
    // Shadow always delegates the exact original object, including all fields.
    return yield* next(e);
  });
}

function classificationResult(provider, outcome) {
  const decision = provider === 'jev' ? outcome.value?.decision : parseDecision(outcome.value);
  let reasonCode = outcome.reason;
  if (reasonCode == null && provider === 'jev') reasonCode = outcome.value?.reason;
  if (reasonCode == null) {
    if (!decision) reasonCode = 'invalid-response';
    else if (provider === 'jev') reasonCode = 'unevaluated';
    else reasonCode = decision.contextSufficient ? 'shadow' : 'context';
  }
  return { recommendation: decision?.choice ?? 'keep', reasonCode };
}

function safeEffort(value) {
  return EFFORTS.includes(value) ? value : 'unsupported';
}

function invalidateTurn(turn) {
  turn.valid = false;
  turn.record = undefined;
  turn.text = '';
  turn.cancel?.();
}

function publish($, text) {
  // Provider strings, prompts, errors, IDs and API keys never enter the UI.
  try { $.ui.log(text); } catch { /* Display is optional. */ }
}

async function classifyJev($, routingInput, options, flight, active) {
  if (options.cloudConsent !== true) return { reason: 'no-consent' };
  if (!validJevKey(options.jevApiKey)) return { reason: 'missing-key' };
  const prepared = prepareRoutingRequest(routingInput);
  if (prepared.status !== 'ready') return { reason: 'invalid-input' };
  if (!active()) return { reason: 'cancelled' };
  if (flight.busy) return { reason: 'busy' };
  flight.busy = true;
  try {
    const result = await $.process.run(['node', `${$.plugin.root}/scripts/jev-request.mjs`], {
      cwd: $.plugin.root,
      stdin: JSON.stringify({ apiKey: options.jevApiKey, routingInput }),
      timeoutMs: PROCESS_TIMEOUT_MS,
      env: { ...PROCESS_ENV },
    });
    return parseHelperResult(result, prepared.choices);
  } catch { return { reason: 'provider-error' }; }
  finally { flight.busy = false; }
}
