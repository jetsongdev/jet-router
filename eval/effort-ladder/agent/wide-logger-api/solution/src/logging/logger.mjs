export function createLogger(sink, levels = ['info', 'error', 'debug']) {
  const enabled = new Set(levels);
  return {
    enabled: level => enabled.has(level),
    info: fields => sink('info', fields),
    error: fields => sink('error', fields),
    debug: fields => sink('debug', fields),
  };
}

export const defaultLogger = createLogger((level, fields) => {
  console[level](fields);
});
