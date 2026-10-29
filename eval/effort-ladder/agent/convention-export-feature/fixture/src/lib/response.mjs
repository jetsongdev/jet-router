export function json(body, status = 200) {
  return { status, body, headers: { 'content-type': 'application/json' } };
}
