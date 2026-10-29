export async function loadCalculator(number) {
  if (!Number.isInteger(number) || number < 1 || number > 42) throw new RangeError('unknown calculator');
  const name = String(number).padStart(2, '0');
  return (await import(`./calculators/calc-${name}.mjs`)).calculate;
}
