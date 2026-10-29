import { createHmac, randomBytes } from 'node:crypto';

export function bashNonzeroHint(content) {
  const texts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter(block => block.type === 'text').map(block => block.text) : [];
  return texts.some(text => typeof text === 'string' && /\bexit(?:ed with)? code\s*[:=]?\s*[1-9]\d*\b/i.test(text));
}

export function createShadowRaise({ rule = 'v0' } = {}) {
  const key = randomBytes(32), steps = new Set(), calls = new Map(), edits = new Map();
  let toolStreak = 0, testStreak = 0;
  let observedSteps = null, maxConsecutiveToolFailures = null, maxConsecutiveTestFailures = null, maxSameFileEdits = null;
  let atStep = null, reasons = [];
  const check = () => {
    if (atStep !== null) return;
    const found = [];
    if (observedSteps >= 8) found.push('steps');
    if (maxConsecutiveToolFailures >= 3) found.push('tool_failures');
    if (maxConsecutiveTestFailures >= 2) found.push('test_failures');
    if (maxSameFileEdits >= 4) found.push('same_file_edits');
    if (found.length) { atStep = observedSteps; reasons = found; }
  };
  return {
    observe(event) {
      if (event.parent_tool_use_id != null) return;
      if (event.type === 'assistant') {
        if (event.message?.id) { steps.add(event.message.id); observedSteps = steps.size; check(); }
        for (const block of event.message?.content ?? []) {
          if (block.type !== 'tool_use' || calls.has(block.id)) continue;
          const isTest = block.name === 'Bash' && typeof block.input?.command === 'string' && /\b(?:test|jest|vitest|pytest)\b|\bnode\s+--test\b|\bnpm\s+test\b/i.test(block.input.command);
          calls.set(block.id, { isTest });
          if (['Edit', 'Write'].includes(block.name) && typeof block.input?.file_path === 'string') {
            const hash = createHmac('sha256', key).update(block.input.file_path).digest('hex');
            const count = (edits.get(hash) ?? 0) + 1; edits.set(hash, count);
            maxSameFileEdits = Math.max(maxSameFileEdits ?? 0, count); check();
          }
        }
      } else if (event.type === 'user' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type !== 'tool_result') continue;
          const call = calls.get(block.tool_use_id);
          if (!call) continue;
          calls.delete(block.tool_use_id);
          toolStreak = block.is_error ? toolStreak + 1 : 0;
          maxConsecutiveToolFailures = Math.max(maxConsecutiveToolFailures ?? 0, toolStreak);
          if (call.isTest) { testStreak = (block.is_error || (rule === 'v0b' && bashNonzeroHint(block.content))) ? testStreak + 1 : 0; maxConsecutiveTestFailures = Math.max(maxConsecutiveTestFailures ?? 0, testStreak); }
          check();
        }
      }
    },
    result() { return { status: atStep === null ? 'not_triggered' : 'triggered', atStep, reasons: [...reasons], observedSteps, maxConsecutiveToolFailures, maxConsecutiveTestFailures, maxSameFileEdits, applyAt: 'next_input', rule }; }
  };
}
