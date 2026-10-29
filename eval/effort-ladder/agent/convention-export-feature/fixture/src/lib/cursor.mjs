export function encodeCursor(tenant, offset) {
  return Buffer.from(JSON.stringify({ tenant, offset })).toString('base64url');
}

export function decodeCursor(cursor, tenant) {
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (parsed.tenant !== tenant || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) return null;
    return parsed.offset;
  } catch {
    return null;
  }
}
