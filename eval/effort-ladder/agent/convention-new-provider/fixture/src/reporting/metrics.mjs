export class Metrics {
  #counters = new Map();
  #gauges = new Map();
  #samples = new Map();

  increment(name, amount = 1) {
    if (!Number.isFinite(amount)) throw new TypeError('amount must be finite');
    this.#counters.set(name, (this.#counters.get(name) ?? 0) + amount);
  }

  gauge(name, value) {
    if (!Number.isFinite(value)) throw new TypeError('value must be finite');
    this.#gauges.set(name, value);
  }

  observe(name, value) {
    if (!Number.isFinite(value)) throw new TypeError('value must be finite');
    const sample = this.#samples.get(name) ?? [];
    sample.push(value);
    this.#samples.set(name, sample);
  }

  counter(name) {
    return this.#counters.get(name) ?? 0;
  }

  readGauge(name) {
    return this.#gauges.get(name);
  }

  samples(name) {
    return [...(this.#samples.get(name) ?? [])];
  }

  snapshot() {
    const entries = [...this.#samples].map(([name, values]) => [name, [...values]]);
    return {
      counters: Object.fromEntries(this.#counters),
      gauges: Object.fromEntries(this.#gauges),
      samples: Object.fromEntries(entries),
    };
  }

  reset() {
    this.#counters.clear();
    this.#gauges.clear();
    this.#samples.clear();
  }
}

export function summarize(values) {
  if (!values.length) {
    return { count: 0, min: null, max: null, mean: null };
  }
  let min = Infinity;
  let max = -Infinity;
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new TypeError('sample must be finite');
    min = Math.min(min, value);
    max = Math.max(max, value);
    total += value;
  }
  return { count: values.length, min, max, mean: total / values.length };
}

export function percentile(values, fraction) {
  if (fraction < 0 || fraction > 1 || !Number.isFinite(fraction)) {
    throw new RangeError('fraction must be between zero and one');
  }
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

export function rates(previous, current, seconds) {
  if (!(seconds > 0)) throw new RangeError('seconds must be positive');
  const result = {};
  for (const [key, value] of Object.entries(current)) {
    result[key] = (value - (previous[key] ?? 0)) / seconds;
  }
  return result;
}
