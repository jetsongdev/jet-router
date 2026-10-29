import { dollarsToInternal, internalToDollars } from './money.mjs';

export function fromJson(input) {
  return { amountDollars: dollarsToInternal(input.amount) };
}

export function toJson(result) {
  return { amount: internalToDollars(result.amountDollars),
    fee: internalToDollars(result.feeDollars), tag: result.tag };
}
