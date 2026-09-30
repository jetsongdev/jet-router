// Smoke-test evidence only; unknown item types are not assumed to be harmless.
export function inspectItems(items) {
  const itemTypes = items.map(item => item.type);
  const output = items.filter(item => item.type === 'agentMessage').map(item => item.text).join('\n');
  return { itemTypes,
    outputMatches: output.includes('Hello,') && !output.includes('Helllo'),
    usedTools: itemTypes.some(type => !['userMessage', 'agentMessage', 'reasoning'].includes(type)) };
}
