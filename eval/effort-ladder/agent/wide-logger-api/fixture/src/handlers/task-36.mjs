export function run(logger, context) {
  logger.debug(`item ${context.id} inspected: ${context.detail()}`);
  return context.id;
}
