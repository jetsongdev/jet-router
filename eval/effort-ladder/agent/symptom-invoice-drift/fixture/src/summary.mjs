export function summary(invoice) { return {customer:invoice.customer,count:invoice.lines.length,totalCents:invoice.totalCents}; }
