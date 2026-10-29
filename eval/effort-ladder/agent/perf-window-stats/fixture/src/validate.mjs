export function validOptions(options) {
  return Number.isInteger(options.width) && options.width > 0 &&
    Number.isFinite(options.percentile) && options.percentile >= 0 && options.percentile <= 1;
}
