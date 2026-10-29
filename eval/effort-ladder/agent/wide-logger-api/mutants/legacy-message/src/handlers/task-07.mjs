export function run(logger, context) {
  logger.info({ event: 'task.07.accepted', itemId: context.id });
  return context.id;
}
