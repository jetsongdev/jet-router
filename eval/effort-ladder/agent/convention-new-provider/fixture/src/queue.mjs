export async function sendAll(provider, messages) {
  const results = [];
  for (const message of messages) results.push(await provider.send(message));
  return results;
}
