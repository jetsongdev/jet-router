export function retain(record, now, ttl) {
  return !record.deleted || now - record.time < ttl;
}
