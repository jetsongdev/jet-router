export function describe(result) {
  return result === null ? 'No route' : `Fare: ${result}`;
}
export function describeAll(results) { return results.map(describe); }
