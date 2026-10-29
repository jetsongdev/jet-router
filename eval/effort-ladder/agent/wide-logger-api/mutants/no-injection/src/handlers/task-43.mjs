export function run(logger, context) {
  logger.info({ event: 'task.43.accepted', itemId: context.id });
  return context.id;
}
