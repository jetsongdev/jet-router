export function windowStats(events, { width, percentile }) {
  let watermark = -Infinity;
  let active = [];
  const output = [];
  for (const event of events) {
    watermark = Math.max(watermark, event.time);
    active = active.filter((item) => item.time > watermark - width);
    if (event.time > watermark - width) active.push(event);
    const ordered = active.map((item) => item.value).sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil(percentile * ordered.length));
    output.push({ watermark, count: ordered.length, value: ordered[rank - 1] ?? null });
  }
  return output;
}
