# Order data

Orders are scoped by tenant and listed in ascending ID order. `totalCents` is
an integer; `createdAt` is an ISO timestamp. Tenant time zones are IANA names.
Export responses use `content-type: text/csv; charset=utf-8`.
