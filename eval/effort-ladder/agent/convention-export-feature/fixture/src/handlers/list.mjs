import { authorize } from '../lib/auth.mjs';
import { page } from '../lib/page.mjs';
import { selectTenantOrders } from '../store/orders.mjs';
import { record } from '../lib/audit.mjs';

export function listOrders(request, context) {
  if (!authorize(request, 'orders:read')) return { status: 403, body: 'forbidden' };
  const rows = selectTenantOrders(context.orders, request.tenant);
  const result = page(rows, request.query, request.tenant);
  if (!result) return { status: 400, body: 'bad cursor or limit' };
  record(context.audit, request, 'orders.list');
  return { status: 200, body: result.rows, nextCursor: result.nextCursor };
}
