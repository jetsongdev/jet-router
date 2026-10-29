import { readAmount as price } from '../helpers/read-money.mjs';

export function calculate(record, rateBps) {
  const amount = price(record);
  const fee = Math.round(amount * rateBps / 100) / 100;
  return { amountDollars: amount, feeDollars: fee, tag: 'calc-27' };
}
