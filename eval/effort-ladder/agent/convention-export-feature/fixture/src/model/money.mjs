export function addCents(items) {
  return items.reduce((sum, item) => sum + item.totalCents, 0);
}
