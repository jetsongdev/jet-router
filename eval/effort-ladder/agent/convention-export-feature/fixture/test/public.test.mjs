import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/router.mjs';

test('health', async () => {
  assert.equal((await dispatch({ method: 'GET', path: '/health' }, {})).body, 'ok');
});

test('empty export has a header', async () => {
  const request = { method: 'GET', path: '/orders/export', tenant: 't',
    principal: { id: 'u', tenant: 't', permissions: ['orders:read'] }, query: {} };
  const response = await dispatch(request, { orders: [], tenants: [{ id: 't', timeZone: 'UTC' }], audit: [] });
  assert.equal(response.status, 200);
  assert.match(response.body, /^id,customer,total_cents,local_date/);
});

test('export returns an order', async () => {
  const request = { method: 'GET', path: '/orders/export', tenant: 't',
    principal: { id: 'u', tenant: 't', permissions: ['orders:read'] }, query: {} };
  const response = await dispatch(request, { orders: [{ id: '1', tenant: 't', customer: 'A', totalCents: 125, createdAt: '2026-01-01T00:00:00Z' }], tenants: [{ id: 't', timeZone: 'UTC' }], audit: [] });
  assert.match(response.body, /1,A,125,2026-01-01/);
});
