export function tenantCustomers(customers, tenant) {
  return customers.filter(customer => customer.tenant === tenant);
}
