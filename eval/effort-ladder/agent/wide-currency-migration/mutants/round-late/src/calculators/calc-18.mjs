import { readAmount as price } from '../helpers/read-money.mjs';

export function calculate(record, rateBps) {
  const amount = price(record);
  const fee = Math.round(amount * rateBps / 10000);
  return { amountCents: amount, feeCents: fee, tag: 'calc-18' };
}
