export function run(logger, context) {
  logger.info(`item ${context.id} accepted`);
  return context.id;
}
