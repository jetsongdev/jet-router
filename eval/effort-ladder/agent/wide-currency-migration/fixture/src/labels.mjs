export function calculatorLabel(number) {
  return `calc-${String(number).padStart(2, '0')}`;
}
