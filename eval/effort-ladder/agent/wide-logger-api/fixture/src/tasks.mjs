export async function loadTask(number) {
  if (!Number.isInteger(number) || number < 1 || number > 48) throw new RangeError('unknown task');
  const name = String(number).padStart(2, '0');
  return import(`./handlers/task-${name}.mjs`);
}
