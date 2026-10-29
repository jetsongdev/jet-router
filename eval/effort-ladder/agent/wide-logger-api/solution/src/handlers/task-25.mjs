export function run(logger, context) {
  logger.info({ event: 'task.25.accepted', itemId: context.id });
  return context.id;
}
