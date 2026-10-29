export function run(logger, context) {
  logger.info({ event: 'task.37.accepted', itemId: context.id });
  return context.id;
}
