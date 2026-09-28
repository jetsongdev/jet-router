import { describe, expect, mock, test, tier } from 'claude-code/testing';

tier('user');

describe('installed Claude function-hook contract (no model or network)', () => {
  test('loads the plugin, defaults off, and forwards shadow requests unchanged', async ($, on) => {
    mock.clock(on);
    const requests: unknown[] = [];
    const logs: string[] = [];
    const engine = $;
    let processes = 0;
    on('process.run', ($, e) => {
      processes++;
      expect(e.argv[0]).toBe('node');
      expect(e.argv[1].endsWith('/scripts/jev-request.mjs')).toBe(true);
      expect(JSON.stringify(e.argv)).not.toContain('CANARY');
      expect(e.init?.timeoutMs).toBe(4000);
      expect(JSON.parse(e.init?.stdin ?? '{}').routingInput.prompt).toBe('RUNTIME_CANARY');
      return { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, decision: {
        provider: 'jev', choice: 'low', confidence: 0.8, contextScore: 0.9, riskScore: 0.1,
      } }), stderr: '' } };
    });
    on('session.start', ($, e) => ({ cwd: e.cwd }));
    on('command.register', ($, e) => ({ value: { command: e.name } }));
    on('ui.status', () => ({ value: undefined }));
    on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined }; });
    on('turn.start', ($, e) => ({ turnId: e.turnId }));
    on('turn.complete', ($, e) => {
      expect(logs).toHaveLength(0);
      return { text: e.answer };
    });
    on('prompt.submit', async ($, e) => {
      await engine.turn.start({ turnId: 'runtime-turn', text: e.text });
      return { text: e.text, origin: e.origin };
    });
    on('turn.step', async function* ($, e) {
      requests.push(e);
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null };
    });
    await $.session.start({ cwd: '/offline-no-sdd', surface: 'terminal', isInteractive: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('[jet-router] 세션 시작 · 꺼짐(off)');
    logs.length = 0;
    const command = (args: string) => $.command.run({ command: 'jet-router', args, origin: { kind: 'composer' } });
    const initialStatus = (await command('status')).text;
    expect(initialStatus).toContain('꺼짐(off)');
    const jev = initialStatus?.includes('분류기: Jev');
    await command('shadow');
    await $.prompt.submit({ text: 'RUNTIME_CANARY', origin: { kind: 'composer' }, wait: false });
    const input = { turnId: 'runtime-turn', index: 0, model: 'claude-opus-5-5', effort: 'high' as const, messageCount: 1 };
    const stream = $.turn.step(input);
    for await (const chunk of stream) void chunk;
    await stream.result;
    expect(requests).toEqual([input]);
    expect(logs).toHaveLength(0);
    const completed = await $.turn.complete({ turnId: 'runtime-turn', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' });
    expect(completed.text).toBe('done');
    expect(logs).toHaveLength(1);
    expect(processes).toBe(jev ? 1 : 0);
    expect(logs[0]).toContain(jev ? '[jet-router] Jev.shadow(): high → low' : '[jet-router] fake.shadow(): high 유지(고정값)');
    expect(logs[0]).toContain(' · 0ms');
    expect(logs.join('')).not.toContain('RUNTIME_CANARY');
    // enforce rewrites effort for the downstream request of this turn only.
    expect((await command('enforce')).text).toContain('적용(enforce)');
    logs.length = 0;
    await $.prompt.submit({ text: 'RUNTIME_CANARY', origin: { kind: 'composer' }, wait: false });
    const enforced = $.turn.step(input);
    for await (const chunk of enforced) void chunk;
    await enforced.result;
    expect(requests).toHaveLength(2);
    expect((requests[1] as { effort: string }).effort).toBe(jev ? 'low' : 'high');
    await $.turn.complete({ turnId: 'runtime-turn', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' });
    expect(logs[0]).toContain(jev ? '[jet-router] Jev.enforce(): high → low 적용' : '[jet-router] fake.enforce(): high 유지(고정값)');
    expect(processes).toBe(jev ? 2 : 0);
  });
});
