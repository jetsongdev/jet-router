export function calculate(record, rateBps) {
  const amount = record['amountCents'];
  const fee = Math.round(amount * rateBps / 10000);
  return { amountCents: amount, feeCents: fee, tag: 'calc-29' };
}
