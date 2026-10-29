export function tenantById(tenants, id) {
  return tenants.find(tenant => tenant.id === id);
}
