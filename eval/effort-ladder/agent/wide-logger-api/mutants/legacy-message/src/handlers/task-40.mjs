export function run(logger, context) {
  logger.info({ event: 'task.40.accepted', itemId: context.id });
  return context.id;
}
