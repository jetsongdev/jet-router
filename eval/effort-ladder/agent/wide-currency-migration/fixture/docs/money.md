# Money conventions

All internal amounts and fees are integer cents, with fields `amountCents` and
`feeCents`. Input and output JSON retain dollar fields `amount` and `fee`; valid
input amounts are nonnegative numeric dollars with at most two decimal places.
Convert only at the JSON boundary. The rate is integer basis points. Each
calculator computes its fee in cents as `Math.round(amountCents * rateBps /
10000)`. Round each order's fee before adding fees in a summary, not after the
sum. Every calculator returns its own tag `calc-NN`. The fixture helper
`test/helpers/records.mjs` must construct the same internal record shape.
