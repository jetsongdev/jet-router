import { listOrders } from './handlers/list.mjs';
import { getOrder } from './handlers/get.mjs';
import { health } from './handlers/health.mjs';

const routes = new Map([
  ['GET /orders', listOrders],
  ['GET /order', getOrder],
  ['GET /health', health],
]);

export async function dispatch(request, context) {
  const handler = routes.get(`${request.method} ${request.path}`);
  if (!handler) return { status: 404, body: 'not found' };
  return handler(request, context);
}
