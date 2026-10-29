export function dollarsToInternal(amount) {
  return Math.round(amount * 100);
}

export function internalToDollars(amount) {
  return amount / 100;
}
