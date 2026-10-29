import { Fenwick } from './fenwick.mjs';
import { MinHeap } from './heap.mjs';

export function windowStats(events, { width, percentile }) {
  const values = [...new Set(events.map((event) => event.value))].sort((a, b) => a - b);
  const positions = new Map(values.map((value, index) => [value, index]));
  const counts = new Fenwick(values.length);
  const expiry = new MinHeap();
  const output = [];
  let watermark = -Infinity;
  let size = 0;
  for (const event of events) {
    watermark = Math.max(watermark, event.time);
    const boundary = watermark - width;
    while (expiry.size && expiry.peek().time <= boundary) {
      counts.add(expiry.pop().index, -1);
      size -= 1;
    }
    if (event.time > boundary) {
      const index = positions.get(event.value);
      expiry.push({ time: event.time, index });
      counts.add(index, 1);
      size += 1;
    }
    const rank = Math.max(1, Math.floor(percentile * size));
    const value = size ? values[counts.select(rank)] : null;
    output.push({ watermark, count: size, value });
  }
  return output;
}
