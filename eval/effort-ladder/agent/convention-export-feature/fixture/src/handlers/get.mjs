import { authorize } from '../lib/auth.mjs';
import { findOrder } from '../store/orders.mjs';
import { record } from '../lib/audit.mjs';

export function getOrder(request, context) {
  if (!authorize(request, 'orders:read')) return { status: 403, body: 'forbidden' };
  const order = findOrder(context.orders, request.tenant, request.query?.id);
  if (!order) return { status: 404, body: 'not found' };
  record(context.audit, request, 'orders.get');
  return { status: 200, body: order };
}
