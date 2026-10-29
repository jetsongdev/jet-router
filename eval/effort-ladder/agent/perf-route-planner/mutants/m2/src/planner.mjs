import { MinTree } from './tree.mjs';

export function plan(stops, services) {
  const best = new MinTree(stops);
  best.update(0, 0);
  const sorted = [...services].sort((a, b) => a.to - b.to);
  for (const service of sorted) {
    const previous = best.minimum(service.from, service.to);
    if (!Number.isFinite(best.minimum(service.to, service.to + 1))) best.update(service.to, previous + service.cost);
  }
  const answer = best.minimum(stops - 1, stops);
  return Number.isFinite(answer) ? answer : null;
}
