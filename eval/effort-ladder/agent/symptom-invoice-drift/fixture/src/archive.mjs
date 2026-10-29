export function copyInvoice(invoice) { return structuredClone(invoice); }
export function archive(invoices) { return invoices.map(copyInvoice); }
