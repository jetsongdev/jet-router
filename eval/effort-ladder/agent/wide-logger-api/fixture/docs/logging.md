# Structured logging

Each logger has `enabled(level)` and `info`, `error`, `debug` methods that take
one plain object. Every object has an event name `task.NN.accepted`,
`task.NN.failed`, or `task.NN.inspected`, where NN is the two-digit task number,
and an `itemId` field equal to the input id. Accepted tasks use info; failed
tasks use error and include `error` from the shared serializer; inspected
tasks use debug and include `detail` from `context.detail()`.

The serializer returns `{name, message}` plus `code` only when the error has a
non-undefined code. Do not include stack or the error object itself. Disabled
debug logs must not call `context.detail()` at all. Info and error methods are
called once per corresponding task. The service must use a supplied logger for
all tasks and use the default logger only when no logger is supplied. Export
`createLogger`, `defaultLogger`, and `serializeError` through the logging
barrel as well as their defining modules. Logger sinks receive `(level, fields)`.
