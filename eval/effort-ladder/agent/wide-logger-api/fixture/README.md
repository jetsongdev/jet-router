# Task service

`createService(logger?)` returns an object with async `run(number, context)`.
Tasks are independent modules with `run(logger, context)`. The context contains
`id`, `error`, and `detail`, according to task kind. The logging contract is in
`docs/logging.md`. Task numbers are 1 to 48.

The separate local `src/reporting/report.mjs` tool summarizes synthetic JSONL records with `event`, `level`, and `duration` fields. It accepts `--help`.
