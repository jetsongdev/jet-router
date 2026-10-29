import { dollarsToInternal, internalToDollars } from './money.mjs';

export function fromJson(input) {
  return { amountCents: dollarsToInternal(input.amount) };
}

export function toJson(result) {
  return { amount: internalToDollars(result.amountCents),
    fee: result.feeCents, tag: result.tag };
}
