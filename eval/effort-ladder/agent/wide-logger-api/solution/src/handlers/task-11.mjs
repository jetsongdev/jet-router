import { serializeError } from '../logging/index.mjs';

export function run(logger, context) {
  logger.error({ event: 'task.11.failed', itemId: context.id,
    error: serializeError(context.error) });
  return context.id;
}
