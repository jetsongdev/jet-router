export function calculate(record, rateBps) {
  const amount = record.amountDollars;
  const fee = Math.round(amount * rateBps / 100) / 100;
  return { amountDollars: amount, feeDollars: fee, tag: 'calc-31' };
}
