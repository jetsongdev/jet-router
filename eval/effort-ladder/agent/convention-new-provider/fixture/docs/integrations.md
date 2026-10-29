# Integration notes

The transport is an async function accepting a single payload object and
returning `{status, id?, retryAfterMs?}`. A 200 or 201 response with a nonempty
string ID succeeds. A 2xx response without a usable ID is an upstream error.
The message is a string and must be sent unchanged. Provider configs are
validated at creation; token must be a nonempty string after trimming, but the
original token is sent unchanged. A provider may not mutate the caller's config.

All adapters map HTTP 400 to `invalid`, 401 and 403 to `auth`, 429 to `busy`,
503 to `unavailable`, and every other unsuccessful response to `upstream`.
Only `busy` and `unavailable` are retryable. A retryable response's
`retryAfterMs` is used when it is a finite nonnegative number; otherwise use
50 ms. Shared delivery retries at most three attempts and waits using the
injected clock's async `sleep(ms)`. Nonretryable errors never sleep or retry;
the last failure is returned after exhaustion.

Payloads: Amber sends `{token, text, provider: 'amber'}`; Birch sends
`{token, text, provider: 'birch'}`; Cedar sends `{token, text, provider:
'cedar'}`. Pulsar sends `{apiKey: token, message: text, channel: 'pulsar'}`.
No adapter should log or expose tokens in thrown error messages.
