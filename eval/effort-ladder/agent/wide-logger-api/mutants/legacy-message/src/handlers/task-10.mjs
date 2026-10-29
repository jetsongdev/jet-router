export function run(logger, context) {
  logger.info({ event: 'task.10.accepted', itemId: context.id });
  return context.id;
}
