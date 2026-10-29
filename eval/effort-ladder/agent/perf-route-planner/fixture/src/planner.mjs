export function plan(stops, services) {
  const cost = Array(stops).fill(Infinity);
  cost[0] = 0;
  const sorted = [...services].sort((a, b) => a.to - b.to);
  for (const service of sorted) {
    for (let x = service.from; x < service.to; x++) {
      cost[service.to] = Math.min(cost[service.to], cost[x] + service.cost);
    }
  }
  return Number.isFinite(cost[stops - 1]) ? cost[stops - 1] : null;
}
