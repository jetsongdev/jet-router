export function byCustomer(invoices) {
  const result = new Map();
  for (const invoice of invoices) {
    if (!result.has(invoice.customer)) {
      result.set(invoice.customer, []);
    }
    result.get(invoice.customer).push(invoice);
  }
  return result;
}
