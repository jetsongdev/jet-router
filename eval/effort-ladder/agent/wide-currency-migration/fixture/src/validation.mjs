export function isRate(value) {
  return Number.isInteger(value) && value >= 0 && value <= 10000;
}
