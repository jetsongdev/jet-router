import { CHOICES } from '../policy.js';

// A deterministic fixture, not a task classifier. No I/O or prompt inspection.
export function fakeProvider(choice = 'keep') {
  const selected = CHOICES.includes(choice) ? choice : 'keep';
  return async () => ({ choice: selected, contextSufficient: selected !== 'keep', risky: false });
}
