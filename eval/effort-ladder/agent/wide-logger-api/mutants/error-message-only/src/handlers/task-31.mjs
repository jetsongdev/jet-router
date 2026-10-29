export function run(logger, context) {
  logger.info({ event: 'task.31.accepted', itemId: context.id });
  return context.id;
}
