export function summarize(results) {
  return { snapshots: results.length, nonempty: results.filter((x) => x.count > 0).length };
}
export function lastValue(results) { return results.at(-1)?.value ?? null; }
