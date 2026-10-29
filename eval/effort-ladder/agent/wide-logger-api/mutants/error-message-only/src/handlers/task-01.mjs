export function run(logger, context) {
  logger.info({ event: 'task.01.accepted', itemId: context.id });
  return context.id;
}
