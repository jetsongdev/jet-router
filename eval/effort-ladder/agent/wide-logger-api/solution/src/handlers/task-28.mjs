export function run(logger, context) {
  logger.info({ event: 'task.28.accepted', itemId: context.id });
  return context.id;
}
