export class DeliveryError extends Error {
  constructor(code, retryable, delay = 50) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.delay = delay;
  }
}

export function fromResponse(response) {
  const status = response.status;
  const code = status === 400 ? 'invalid' : status === 401 || status === 403 ? 'auth' :
    status === 429 ? 'busy' : status === 503 ? 'unavailable' : 'upstream';
  const retryable = code === 'busy' || code === 'unavailable';
  const delay = Number.isFinite(response.retryAfterMs) && response.retryAfterMs >= 0 ? response.retryAfterMs : 50;
  return new DeliveryError(code, retryable, delay);
}
