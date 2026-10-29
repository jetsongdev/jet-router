export function cents(value) { return (value / 100).toFixed(2); }
export function total(invoice) { return cents(invoice.totalCents); }
