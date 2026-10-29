import { validateConfig } from '../validate.mjs';
import { normalize } from '../response.mjs';

export function createPulsar(config, transport) {
  const token = config.token;
  return {
    async send(message) {
      const response = await transport({ apiKey: token, message, channel: 'pulsar' });
      return normalize(response);
    },
  };
}
