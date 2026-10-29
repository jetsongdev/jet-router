export function validService(service, stops) {
  return Number.isInteger(service.from) && Number.isInteger(service.to) &&
    service.from >= 0 && service.from < service.to && service.to < stops &&
    Number.isSafeInteger(service.cost) && service.cost >= 0;
}
