export function register(on, options) {
  let firstTurn;
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e);
    const probe = await $.process.run(['python3', `${$.plugin.root}/probe.py`, 'arm'], { cwd: $.plugin.root, timeoutMs: 3000 });
    const arm = probe.stdout.trim();
    firstTurn ??= e.turnId;
    const started = e.turnId !== firstTurn || e.index >= 2;
    const change = arm === 'B1-L0' || arm === 'B1-N0' || ((arm === 'B1-L' || arm === 'B1-N') && started);
    const effort = change ? (arm.startsWith('B1-N') ? 42 : 'high') : e.effort;
    const record = { turnId: e.turnId, index: e.index, incoming: e.effort ?? null, forwarded: effort ?? null };
    try {
      const result = yield* next({ ...e, effort });
      record.next = 'returned';
      return result;
    } catch (err) {
      record.next = 'threw';
      record.error = String(err?.message ?? err);
      throw err;
    } finally {
      await $.process.run(['python3', `${$.plugin.root}/probe.py`, 'log'], { cwd: $.plugin.root, stdin: JSON.stringify(record), timeoutMs: 3000 });
    }
  });
}
