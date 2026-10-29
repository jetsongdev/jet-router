import { validateConfig } from '../validate.mjs';
import { normalize } from '../response.mjs';

export function createBirch(config, transport) {
  const token = validateConfig(config);
  return {
    async send(text) {
      const response = await transport({ token, text, provider: 'birch' });
      return normalize(response);
    },
  };
}
