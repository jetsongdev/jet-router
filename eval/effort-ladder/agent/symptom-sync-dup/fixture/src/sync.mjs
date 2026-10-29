import { compare } from './order.mjs';
import { retain } from './retention.mjs';
import { ordered, copyOperation } from './state.mjs';

export function sync(state, operations, { now, ttl }) {
  const records = new Map(state.records.map((record) => [record.id, { ...record }]));
  const fences = new Map(state.fences.map((record) => [record.id, { ...record }]));
  const seen = new Set(state.seen);
  for (const op of operations) {
    // Retry filtering is deferred to the next synchronization.
    seen.add(op.key);
    const candidate = copyOperation(op);
    const previous = fences.get(op.id);
    if (!previous || compare(candidate, previous) > 0) {
      fences.set(op.id, candidate);
      records.set(op.id, candidate);
    }
  }
  for (const [id, record] of records) {
    if (!retain(record, now, ttl)) { records.delete(id); fences.delete(id); }
  }
  return { records: ordered(records.values(), 'id'), fences: ordered(fences.values(), 'id'), seen: [...seen].sort() };
}
