import { loadKeys } from '../lib/keys.mjs';
const result = { file: 'ok', ANTHROPIC_API_KEY: 'missing', TYPESAFE_API_KEY: 'missing' };
try {
  const keys = loadKeys();
  for (const name of ['ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY']) result[name] = Object.hasOwn(keys, name) ? (keys[name] ? 'set' : 'empty') : 'missing';
} catch (error) { result.file = error.code; }
console.log(JSON.stringify(result));
