export function summarize(results) {
  return {
    amountDollars: results.reduce((sum, result) => sum + result.amountDollars, 0),
    feeDollars: Math.round(results.reduce((sum, result) => sum + result.feeDollars, 0) * 100) / 100,
  };
}
