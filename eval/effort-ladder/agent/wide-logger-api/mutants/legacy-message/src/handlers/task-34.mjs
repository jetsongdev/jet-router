export function run(logger, context) {
  logger.info({ event: 'task.34.accepted', itemId: context.id });
  return context.id;
}
