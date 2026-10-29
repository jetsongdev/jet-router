export function selectTenantOrders(orders, tenant) {
  return orders.filter(order => order.tenant === tenant)
    .slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function findOrder(orders, tenant, id) {
  return orders.find(order => order.tenant === tenant && order.id === id);
}
