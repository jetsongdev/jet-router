export function summarize(results) {
  return {
    amountCents: results.reduce((sum, result) => sum + result.amountCents, 0),
    feeCents: results.reduce((sum, result) => sum + result.feeCents, 0),
  };
}
