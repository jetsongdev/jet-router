export function run(logger, context) {
  logger.error(`item ${context.id} failed: ${context.error.message}`);
  return context.id;
}
