export function compare(a, b) {
  if (a.time !== b.time) return a.time - b.time;
  return 0;
}
