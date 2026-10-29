import { authorize } from '../lib/auth.mjs';
import { record } from '../lib/audit.mjs';
import { page } from '../lib/page.mjs';
import { localDate } from '../lib/date.mjs';
import { selectTenantOrders } from '../store/orders.mjs';
import { tenantById } from '../store/tenants.mjs';
import { csv } from '../lib/csv.mjs';

export function exportOrders(request, context) {

  const rows = selectTenantOrders(context.orders, request.tenant);
  const result = page(rows, request.query, request.tenant);
  if (!result) return { status: 400, body: 'bad cursor or limit' };
  const tenant = tenantById(context.tenants, request.tenant);
  const lines = [['id', 'customer', 'total_cents', 'local_date']];
  for (const order of result.rows) {
    lines.push([order.id, order.customer, order.totalCents, localDate(order.createdAt, tenant.timeZone)]);
  }
  record(context.audit, request, 'orders.export');
  return {
    status: 200,
    body: csv(lines),
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    nextCursor: result.nextCursor,
  };
}
