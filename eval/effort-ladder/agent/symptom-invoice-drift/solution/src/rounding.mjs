function rounded(numerator, denominator) {
  return Number((numerator * 2n + denominator) / (2n * denominator));
}
export function grossCents(quantity, unitMills) {
  return rounded(BigInt(quantity) * BigInt(unitMills), 1000n);
}
export function taxCents(cents, basisPoints) {
  return rounded(BigInt(cents) * BigInt(basisPoints), 10000n);
}
