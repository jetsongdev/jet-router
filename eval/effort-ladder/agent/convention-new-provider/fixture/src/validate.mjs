export function validateConfig(config) {
  if (!config || typeof config.token !== 'string' || !config.token.trim()) {
    throw new TypeError('token must be a nonempty string');
  }
  return config.token;
}
