import { fromResponse } from './errors.mjs';

export function normalize(response) {
  if ((response.status === 200 || response.status === 201) &&
      typeof response.id === 'string' && response.id.length > 0) return { id: response.id };
  throw fromResponse(response);
}
