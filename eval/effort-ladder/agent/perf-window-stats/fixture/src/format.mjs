export function formatSnapshot(snapshot) {
  return `${snapshot.watermark}: ${snapshot.count} / ${snapshot.value ?? '-'}`;
}
export function formatSeries(series) { return series.map(formatSnapshot).join('\n'); }
