# Notification providers

`createProvider(name, config, {transport, clock})` returns an object whose
`send(message)` resolves to `{id}`. The service and providers use injected
transport and clock. See `docs/integrations.md` for wire formats and errors.

The separate local `src/reporting/report.mjs` tool summarizes synthetic JSONL records with `provider`, `result`, and `duration` fields. It accepts `--help`.
