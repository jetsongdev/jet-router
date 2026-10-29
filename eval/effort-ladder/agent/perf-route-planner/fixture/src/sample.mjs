export function chain(stops, cost = 1) {
  return Array.from({length: stops - 1}, (_, i) => ({from:i, to:i+1, cost}));
}
