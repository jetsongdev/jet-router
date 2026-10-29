import { encodeCursor, decodeCursor } from './cursor.mjs';

export function page(rows, query = {}, tenant) {
  const limit = query.limit === undefined ? 2 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  const offset = query.cursor === undefined ? 0 : decodeCursor(query.cursor, tenant);
  if (offset === null) return null;
  const slice = rows.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    rows: slice,
    nextCursor: nextOffset < rows.length ? encodeCursor(tenant, nextOffset) : null,
  };
}
