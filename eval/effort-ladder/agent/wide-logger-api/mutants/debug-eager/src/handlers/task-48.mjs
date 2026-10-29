export function run(logger, context) {
  if (logger.enabled('debug')) {
    logger.debug({ event: 'task.48.inspected', itemId: context.id, detail: context.detail() });
  }
  return context.id;
}
