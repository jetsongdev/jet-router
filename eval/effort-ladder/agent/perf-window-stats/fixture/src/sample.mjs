export function sampleEvents(values) {
  return values.map((value, time) => ({ time, value }));
}
export function emptySample() { return []; }
