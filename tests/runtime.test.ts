import { describe, expect, mock, test, tier } from 'claude-code/testing';

tier('user');

describe('installed Claude function-hook contract (no model or network)', () => {
  test('loads the plugin, defaults off, and forwards shadow requests unchanged', async ($, on) => {
    mock.clock(on);
    const requests: unknown[] = [];
    const logs: string[] = [];
    const engine = $;
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
    const command = (args: string) => $.command.run({ command: 'jet-router', args, origin: { kind: 'composer' } });
    expect((await command('status')).text).toContain('꺼짐(off)');
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
    expect(logs[0]).toContain('[jet-router] 관찰 · fake(테스트)');
    expect(logs[0]).toContain('high 유지 · 추천 보류(맥락 부족)');
    expect(logs[0]).toContain('분류 0ms');
    expect(logs.join('')).not.toContain('RUNTIME_CANARY');
    expect((await command('enforce')).text).toContain('아직 사용할 수 없습니다');
  });
});
