import { defaultLogger } from './logging/index.mjs';
import { loadTask } from './tasks.mjs';

export function createService(logger = defaultLogger) {
  return {
    async run(number, context) {
      const task = await loadTask(number);
      return task.run(logger, context);
    },
  };
}
