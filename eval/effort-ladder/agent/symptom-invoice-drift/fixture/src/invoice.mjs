import { grossCents, taxCents } from './rounding.mjs';
import { allocate } from './allocation.mjs';

export function createInvoice({ customer, lines, discountCents }) {
  const gross = lines.map((line) => ({ ...line, grossCents: grossCents(line.quantity, line.unitMills) }));
  const discounts = allocate(gross, discountCents);
  const result = gross.map((line, index) => {
    const discount = discounts[index];
    const tax = taxCents(line.grossCents - discount, line.taxBasisPoints);
    return { id: line.id, grossCents: line.grossCents, discountCents: discount,
      taxCents: tax, totalCents: line.grossCents - discount + tax };
  });
  return { customer, lines: result, totalCents: result.reduce((sum, line) => sum + line.totalCents, 0) };
}
