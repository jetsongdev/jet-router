export function byEndpoint(services) {
  const map = new Map();
  for (const service of services) {
    if (!map.has(service.to)) map.set(service.to, []);
    map.get(service.to).push(service);
  }
  return map;
}
