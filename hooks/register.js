import { prepareRoutingRequest } from '../src/harness.js';
import { parseDecision, EFFORTS } from '../src/policy.js';
import { parseHelperResult, validJevKey, PROCESS_ENV, PROCESS_TIMEOUT_MS } from '../src/providers/jev.js';
import { fakeProvider } from '../src/providers/fake.js';
import { summary, status, sessionNotice } from '../src/report.js';
import { usageRecord } from '../src/usage.js';

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
  // A user submission that was queued and has not started its turn yet.
  let queuedUser = false;
  let lastSummary;
  let project = null;
  const turns = new Map();
  const submissions = new Set();

  // shadow and enforce share classification; only enforce rewrites effort.
  function routing() {
    return (mode === 'shadow' || mode === 'enforce') && !locked;
  }

  function isActiveTurn(turnId, turn) {
    return turn.valid && turns.get(turnId) === turn && routing();
  }

  function invalidate() {
    pending = undefined;
    queuedUser = false;
    for (const turn of turns.values()) invalidateTurn(turn);
    turns.clear();
  }

  on('session.start', async ($, e, next) => {
    invalidate();
    mode = startMode(options, provider);
    locked = false;
    lastSummary = undefined;
    project = typeof e.cwd === 'string' ? e.cwd : null;
    await $.command.register({ name: 'jet-router', description: 'Effort routing: observe (shadow) or apply per turn (enforce)',
      argumentHint: 'status|shadow|enforce|off|lock|unlock', immediate: true });
    publish($, sessionNotice(mode, provider, options.defaultMode === 'shadow'));
    return next(e);
  });

  on('command.run', { command: 'jet-router' }, ($, e) => {
    const action = e.args.trim() || 'status';
    if (action === 'off' || action === 'shadow' || action === 'enforce') {
      invalidate();
      mode = action;
    } else if (action === 'lock' || action === 'unlock') {
      invalidate();
      locked = action === 'lock';
    } else if (action !== 'status') {
      return { text: '사용법: /jet-router status|shadow|enforce|off|lock|unlock' };
    }
    try { $.ui.status(undefined); } catch { /* No interactive surface. */ }
    return { text: status(mode, locked, lastSummary, provider, options.cloudConsent === true) };
  });

  on('prompt.submit', async ($, e, next) => {
    const user = ['composer', 'bridge'].includes(e.origin?.kind);
    const reason = skipReason(e, user);
    const ambiguous = mode === 'off' || locked || reason !== undefined;
    if (ambiguous) {
      for (const turn of turns.values()) invalidateTurn(turn);
    }
    const ticket = { text: ambiguous ? undefined : e.text, ambiguous, user, reason,
      command: e.text.trimStart().startsWith('/') };
    submissions.add(ticket);
    pending = ticket;
    try {
      return await next(e);
    } finally {
      // A turn must have consumed this exact submission synchronously through
      // next. Queued/blocked submissions cannot become a later turn's decision.
      if (pending === ticket) {
        pending = undefined;
        if (user) queuedUser = true;
      }
      submissions.delete(ticket);
    }
  });

  // Why a submission cannot be classified; undefined when it can.
  function skipReason(e, user) {
    if (submissions.size > 0 || turns.size > 0 || e.turnId !== undefined || e.wait) return 'overlap';
    if (!user) return 'origin';
    if (e.attachments?.length) return 'attachment';
    if (e.context?.length) return 'hidden-context';
    if (!e.text.trim()) return 'empty';
    if (e.text.length > 6000) return 'too-long';
    return undefined;
  }

  on('turn.start', ($, e, next) => {
    const ticket = pending;
    pending = undefined;
    const valid = routing() && turns.size === 0 &&
      ticket && !ticket.ambiguous && ticket.text === e.text;
    // Turns opened by subagent reports or task notifications stay tracked for
    // overlap checks but never produce a summary: nobody typed them.
    const silent = ticket ? !ticket.user : !queuedUser;
    // Skills and commands expand the typed text before the turn starts.
    let reason = 'queued';
    if (ticket) reason = ticket.reason ?? (ticket.ambiguous ? 'correlation'
      : turns.size > 0 ? 'overlap' : ticket.command ? 'command' : 'rewritten');
    queuedUser = false;
    for (const turn of turns.values()) invalidateTurn(turn);
    turns.clear();
    if (routing()) {
      turns.set(e.turnId, { valid: Boolean(valid), silent, reason, text: valid ? e.text : '', started: false });
    }
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
      if (routing() && turns.get(e.turnId) === turn && turn.record) {
        lastSummary = summary(turn.record, e.reason);
        publish($, lastSummary);
        if (options.usageLog === true) {
          await recordUsage($, usageRecord({ project, model: turn.model, record: turn.record,
            outcome: e.reason, durationMs: e.durationMs, usage: e.usage }));
        }
      }
      return result;
    } finally {
      if (turns.get(e.turnId) === turn) turns.delete(e.turnId);
    }
  });

  on('turn.step', async function* ($, e, next) {
    if (!routing() || e.agentId !== undefined) return yield* next(e);
    const turn = turns.get(e.turnId);
    if (!turn || turn.completing || turn.silent) return yield* next(e);
    if (turn.started) {
      if (turn.model !== (e.model ?? null)) invalidateTurn(turn);
      if (turn.record) turn.record.forwarded = safeEffort(e.effort);
      if (turn.applied && e.effort !== turn.requested) {
        // The user changed effort mid-turn; their choice wins for the rest of it.
        turn.applied = undefined;
        if (turn.record) turn.record.yielded = true;
      }
      return yield* next(turn.applied ? { ...e, effort: turn.applied } : e);
    }
    turn.started = true;
    turn.model = e.model ?? null;
    const effort = safeEffort(e.effort);
    const record = { provider, mode, original: effort,
      recommendation: 'keep', forwarded: effort, reasonCode: turn.valid ? 'correlation' : turn.reason, latencyMs: null };
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
    if (!routing() || turns.get(e.turnId) !== turn) return yield* next(e);
    turn.record = record;
    if (mode === 'enforce' && applicable(record)) {
      record.applied = record.recommendation;
      turn.applied = record.recommendation;
      turn.requested = e.effort;
      return yield* next({ ...e, effort: turn.applied });
    }
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
  const probability = provider === 'jev' ? decision?.selectedProbability : undefined;
  return { recommendation: decision?.choice ?? 'keep', reasonCode, ...(probability !== undefined ? { probability } : {}) };
}

// Only a validated, different effort is applied; keep, skips, max and
// unsupported efforts leave the request unchanged.
function applicable(record) {
  return ['unevaluated', 'shadow'].includes(record.reasonCode) && record.recommendation !== 'keep' &&
    EFFORTS.includes(record.recommendation) && record.recommendation !== 'max' &&
    EFFORTS.includes(record.original) && record.original !== 'max' && record.recommendation !== record.original;
}

function safeEffort(value) {
  return EFFORTS.includes(value) ? value : 'unsupported';
}

function invalidateTurn(turn) {
  turn.valid = false;
  turn.applied = undefined;
  turn.record = undefined;
  turn.text = '';
  turn.cancel?.();
}

// Jev never starts in shadow: a default would send prompts from every session.
function startMode(options, provider) {
  return options.defaultMode === 'shadow' && provider === 'fake' ? 'shadow' : 'off';
}

// Local token log for savings reports; a failure never affects the session.
async function recordUsage($, record) {
  try {
    await $.process.run(['node', `${$.plugin.root}/scripts/usage.mjs`, 'record'], {
      cwd: $.plugin.root, stdin: JSON.stringify(record), timeoutMs: 3000, env: { ...PROCESS_ENV },
    });
  } catch { /* Logging is optional. */ }
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
