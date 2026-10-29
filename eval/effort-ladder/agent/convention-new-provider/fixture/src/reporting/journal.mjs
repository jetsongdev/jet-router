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
