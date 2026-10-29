export function taskLabel(number) {
  return `task.${String(number).padStart(2, '0')}`;
}
