export function run(logger, context) {
  logger.info({ event: 'task.46.accepted', itemId: context.id });
  return context.id;
}
