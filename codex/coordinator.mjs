// One client owns one backend. Serialize mutations; tool/approval replies and
// interrupt remain independent so a pending approval cannot deadlock the queue.
export function createCoordinator({ rpc, reply, route, catalog = new Map(), notice = () => {}, blocked = new Set() }) {
  let queue = Promise.resolve(), pending, closed = false, sequence = 0;
  const failure = (id, message) => reply({ id, error: { code: -32000, message } });
  const restore = async (threadId, effort, collaborationMode) => {
    try {
      await rpc('thread/settings/update', { threadId, effort, ...(collaborationMode ? { collaborationMode } : {}) });
      return true;
    } catch {
      blocked.add(threadId);
      notice(`restore-failed: expected ${effort}; verify thread effort before resuming`);
      return false;
    }
  };
  async function run(message) {
    const { id, method, params = {} } = message;
    if (closed) return;
    if (method !== 'turn/start') {
      const result = await rpc(method, params);
      reply({ id, result });
      // Only an explicit acknowledged user setting recovers a poisoned thread.
      if (method === 'thread/settings/update' && typeof params.effort === 'string') blocked.delete(params.threadId);
      return;
    }
    if (blocked.has(params.threadId)) throw new Error('restore-failed: set thread effort explicitly before another turn');
    const controller = new AbortController();
    pending = { threadId: params.threadId, controller };
    let original, chosen, sent = false;
    try {
      const { thread } = await rpc('thread/read', { threadId: params.threadId, includeTurns: false });
      const settings = params.collaborationMode?.settings;
      original = settings?.reasoning_effort ?? params.effort ?? thread.reasoningEffort;
      const model = settings?.model ?? params.model ?? thread.model;
      // Only a loaded idle thread is eligible; active input may steer a task.
      chosen = thread.status?.type === 'idle' ? await route({ params, effort: original,
        model, supported: catalog.get(model), requestId: ++sequence, signal: controller.signal }) : null;
      if (controller.signal.aborted || closed) throw new Error('routing-cancelled: prompt was not submitted');
      const outgoing = structuredClone(params);
      if (chosen) {
        outgoing.effort = chosen;
        if (outgoing.collaborationMode?.settings) outgoing.collaborationMode.settings.reasoning_effort = chosen;
      }
      sent = true;
      pending.sent = true;
      const result = await rpc(method, outgoing);
      // Forward promptly: delaying this response until restoration can confuse TUI.
      reply({ id, result });
      if (chosen) notice(`Jev.enforce(): ${original} → ${chosen} (experimental)`);
    } finally {
      pending = undefined;
      // Even a rejected/lost turn/start response may have changed backend state.
      if (sent && chosen) await restore(params.threadId, original, params.collaborationMode);
    }
  }
  return {
    handle(message) {
      const { method, params = {}, id } = message;
      if (pending && !pending.sent && params.threadId === pending.threadId &&
          ['turn/interrupt', 'thread/settings/update', 'turn/settings/update'].includes(method)) {
        pending.controller.abort();
        if (method === 'turn/interrupt') { reply({ id, result: {} }); return Promise.resolve(); }
      }
      if (method === 'turn/interrupt') {
        return rpc(method, params).then(result => reply({ id, result }), () => failure(id, 'interrupt-failed'));
      }
      const task = queue.then(() => run(message));
      queue = task.catch(() => {});
      return task.catch(error => error.rpcError ? reply({ id, error: error.rpcError }) : failure(id,
        error.message.startsWith('restore-failed') || error.message.startsWith('routing-cancelled') ? error.message : 'backend-request-failed'));
    },
    close() { closed = true; pending?.controller.abort(); return queue; },
  };
}
