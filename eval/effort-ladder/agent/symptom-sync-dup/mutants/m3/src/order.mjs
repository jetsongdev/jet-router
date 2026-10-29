export function compare(a, b) {
  if (a.time !== b.time) return a.time - b.time;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  if (a.deleted !== b.deleted) return a.deleted ? -1 : 1;
  const av = a.deleted ? '' : a.value;
  const bv = b.deleted ? '' : b.value;
  return av < bv ? -1 : av > bv ? 1 : 0;
}
