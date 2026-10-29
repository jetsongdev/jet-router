export function run(logger, context) {
  logger.info({ event: 'task.16.accepted', itemId: context.id });
  return context.id;
}
