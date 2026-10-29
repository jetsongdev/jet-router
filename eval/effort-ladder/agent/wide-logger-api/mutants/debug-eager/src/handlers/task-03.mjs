export function run(logger, context) {
  const detail = context.detail();
  if (logger.enabled('debug')) logger.debug({ event: 'task.03.inspected', itemId: context.id, detail });
  return context.id;
}
