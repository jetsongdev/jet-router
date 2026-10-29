export function makeOrder({ id, tenant, customer, totalCents, createdAt }) {
  return { id, tenant, customer, totalCents, createdAt };
}
