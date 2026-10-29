import { validateConfig } from '../validate.mjs';
import { normalize } from '../response.mjs';

export function createAmber(config, transport) {
  const token = validateConfig(config);
  return {
    async send(text) {
      const response = await transport({ token, text, provider: 'amber' });
      return normalize(response);
    },
  };
}
