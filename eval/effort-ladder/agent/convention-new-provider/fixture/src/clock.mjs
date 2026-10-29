export function makeClock() {
  return { sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) };
}
