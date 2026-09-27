import { parseDecision } from '../src/policy.js';
import { fakeProvider } from '../src/providers/fake.js';
import { summary, status } from '../src/report.js';

export function register(on, options) {
  registerRouter(on, fakeProvider(options.fakeChoice));
}

// The injected provider is for offline tests. Runtime exposes only the fake.
export function registerRouter(on, classify) {
  let mode = 'off';
  let locked = false;
  let pending;
  let lastSummary;
  const turns = new Map();

  function invalidate() {
    pending = undefined;
    for (const turn of turns.values()) {
      turn.valid = false;
      turn.cancel?.();
    }
    turns.clear();
  }

  on('session.start', async ($, e, next) => {
    invalidate();
    mode = 'off';
    locked = false;
    lastSummary = undefined;
    await $.command.register({ name: 'jet-router', description: 'Offline effort routing preview',
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
    return { text: status(mode, locked, lastSummary) };
  });

  on('prompt.submit', async ($, e, next) => {
    if (mode === 'off' || locked) return next(e);
    const ambiguous = pending !== undefined || turns.size > 0 || e.turnId !== undefined || e.wait ||
      !['composer', 'bridge'].includes(e.origin?.kind) || Boolean(e.attachments?.length) ||
      Boolean(e.context?.length) || !e.text.trim() || e.text.length > 6000;
    if (ambiguous) {
      for (const turn of turns.values()) { turn.valid = false; turn.record = undefined; turn.cancel?.(); }
    }
    const ticket = { text: ambiguous ? undefined : e.text, ambiguous };
    pending = ticket;
    try {
      return await next(e);
    } finally {
      // A turn must have consumed this exact submission synchronously through
      // next. Queued/blocked submissions cannot become a later turn's decision.
      if (pending === ticket) pending = undefined;
    }
  });

  on('turn.start', ($, e, next) => {
    const ticket = pending;
    pending = undefined;
    const valid = mode === 'shadow' && !locked && turns.size === 0 &&
      ticket && !ticket.ambiguous && ticket.text === e.text;
    for (const turn of turns.values()) { turn.valid = false; turn.cancel?.(); }
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
      if (turn.record) turn.record.forwarded = safeEffort(e.effort);
      return yield* next(e);
    }
    turn.started = true;
    const record = { provider: 'fake', mode: 'shadow', original: safeEffort(e.effort),
      recommendation: 'keep', forwarded: safeEffort(e.effort), reasonCode: 'correlation', latencyMs: null };
    if (turn.valid && e.index === 0 && e.effort !== 'max' && safeEffort(e.effort) !== 'unsupported') {
      const timer = new AbortController();
      const began = await $.clock.now();
      if (!turn.valid || turns.get(e.turnId) !== turn || mode !== 'shadow' || locked) return yield* next(e);
      const cancelled = new Promise(resolve => { turn.cancel = () => resolve({ reason: 'cancelled' }); });
      let outcome;
      try {
        outcome = await Promise.race([
          Promise.resolve().then(() => turn.valid && mode === 'shadow' && !locked
            ? classify({ userPrompt: turn.text, currentEffort: e.effort, taskContext: null }) : null)
            .then(value => ({ value }), () => ({ reason: 'provider-error' })),
          $.clock.sleep(1000, { signal: timer.signal }).then(() => ({ reason: 'timeout' })),
          cancelled,
        ]);
      } finally {
        timer.abort();
        turn.cancel = undefined;
        turn.text = '';
      }
      if (!turn.valid || turns.get(e.turnId) !== turn || mode !== 'shadow' || locked) return yield* next(e);
      const parsed = parseDecision(outcome.value);
      record.recommendation = parsed?.choice ?? 'keep';
      record.reasonCode = outcome.reason ?? (parsed ? (parsed.contextSufficient ? 'shadow' : 'context') : 'invalid-response');
      record.latencyMs = Math.max(0, (await $.clock.now()) - began);
    } else if (e.effort === 'max') record.reasonCode = 'max';
    else if (safeEffort(e.effort) === 'unsupported') record.reasonCode = 'unsupported';
    if (mode === 'shadow' && !locked && turns.get(e.turnId) === turn) turn.record = record;
    // Shadow always delegates the exact original object, including all fields.
    return yield* next(e);
  });
}

function safeEffort(value) {
  return ['low', 'medium', 'high', 'xhigh', 'max'].includes(value) ? value : 'unsupported';
}

function publish($, text) {
  // Provider strings, prompts, errors, IDs and API keys never enter the UI.
  try { $.ui.log(text); } catch { /* Display is optional. */ }
}
