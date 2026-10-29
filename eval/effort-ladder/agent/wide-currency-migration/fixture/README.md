# Quote calculators

Call `quote(number, request)` from `src/api.mjs`. JSON requests and responses use
numeric dollars: request `{amount, rateBps}` and response `{amount, fee, tag}`.
All calculator records are internal. Details and accounting rules are in
`docs/money.md`; the calculator number is an integer from 1 through 42.

The local `src/reporting/` utilities format and compare quote batches for review.
