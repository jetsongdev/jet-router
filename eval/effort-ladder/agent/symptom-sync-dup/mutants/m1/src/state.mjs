export function ordered(values, field) {
  return [...values].sort((a, b) => a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0);
}
export function copyOperation(op) {
  const { id, time, actor, deleted } = op;
  return deleted ? { id, time, actor, deleted } : { id, time, actor, deleted, value: op.value };
}
