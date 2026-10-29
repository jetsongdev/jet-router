import { createAmber } from './providers/amber.mjs';
import { createBirch } from './providers/birch.mjs';
import { createCedar } from './providers/cedar.mjs';
import { deliver } from './retry.mjs';

const providers = { amber: createAmber, birch: createBirch, cedar: createCedar };

export function createProvider(name, config, dependencies) {
  if (!Object.hasOwn(providers, name)) throw new RangeError('unknown provider');
  const adapter = providers[name](config, dependencies.transport);
  return { send: message => deliver(() => adapter.send(message), dependencies.clock) };
}
