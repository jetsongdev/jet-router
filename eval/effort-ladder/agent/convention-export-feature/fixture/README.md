# Order service

The router accepts `{method, path, tenant, principal, query}` and a context with
`orders`, `tenants`, and `audit`. Responses are plain objects. See existing
handlers for response, authorization, audit, and paging conventions. The order
export route is `GET /orders/export`; it returns CSV in `body` and a
`nextCursor` property, which is null at the end. It uses the same page size and
cursor rules as `GET /orders`. Order IDs are strings unique within a tenant.

The separate local `src/reporting/report.mjs` tool summarizes synthetic JSONL records with `orderId`, `action`, and `duration` fields. It accepts `--help`.
