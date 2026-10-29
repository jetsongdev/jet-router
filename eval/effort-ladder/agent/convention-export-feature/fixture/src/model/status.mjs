const states = new Set(['open', 'paid', 'cancelled']);
export function isOrderStatus(value) {
  return states.has(value);
}
