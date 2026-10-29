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

export class Journal {
  #entries = [];
  #next = 1;

  constructor({ clock, capacity = 1000 }) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be positive');
    }
    this.clock = clock;
    this.capacity = capacity;
  }

  append(kind, fields = {}) {
    const entry = {
      sequence: this.#next++,
      time: this.clock.now(),
      kind,
      fields: structuredClone(fields),
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.capacity) this.#entries.shift();
    return entry.sequence;
  }

  list({ kind, after = 0, limit = this.capacity } = {}) {
    const entries = [];
    if (limit <= 0) return entries;
    for (const entry of this.#entries) {
      if (entry.sequence <= after) continue;
      if (kind !== undefined && entry.kind !== kind) continue;
      entries.push(structuredClone(entry));
      if (entries.length >= limit) break;
    }
    return entries;
  }

  latest(kind) {
    for (let index = this.#entries.length - 1; index >= 0; index--) {
      const entry = this.#entries[index];
      if (kind === undefined || entry.kind === kind) return structuredClone(entry);
    }
    return undefined;
  }

  count(kind) {
    let total = 0;
    for (const entry of this.#entries) {
      if (kind === undefined || entry.kind === kind) total++;
    }
    return total;
  }

  clear() {
    this.#entries = [];
  }
}

export function groupByKind(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = groups.get(entry.kind) ?? [];
    group.push(entry);
    groups.set(entry.kind, group);
  }
  return groups;
}

export function between(entries, start, end) {
  return entries.filter(entry => entry.time >= start && entry.time < end);
}

export function countsByKind(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}
