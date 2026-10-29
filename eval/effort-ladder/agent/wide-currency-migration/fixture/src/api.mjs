import { fromJson, toJson } from './adapter.mjs';
import { loadCalculator } from './registry.mjs';

export async function quote(number, input) {
  const calculate = await loadCalculator(number);
  return toJson(calculate(fromJson(input), input.rateBps));
}
