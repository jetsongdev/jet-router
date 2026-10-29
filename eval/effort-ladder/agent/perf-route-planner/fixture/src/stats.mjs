export function serviceCount(services) { return services.length; }
export function maxFare(services) { return Math.max(0, ...services.map((item) => item.cost)); }
