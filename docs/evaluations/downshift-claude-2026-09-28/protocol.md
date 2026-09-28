# Claude downshift token comparison — preregistered

Question: when a user would run xhigh on Claude Code and Jev (through the installed jet-router shadow path) recommends less, does applying that recommendation reduce reported output tokens without observed task-quality loss?
Claude counterpart of [the Codex protocol](../downshift-2026-09-28/protocol.md). Baseline is a user default, NOT proven minimum required effort. Model: claude-opus-5-5 (Opus 5.5), Claude Code 2.1.283.

Tasks: all six existing task-quality tasks with their unchanged withheld checks (`eval/task-quality`). They are previously seen evaluation tasks, not a fresh holdout. The prompt is the Codex task prompt collapsed to one line (`claudePrompt`) so it can be typed into the composer unchanged; its hashes are verified before generation.

Routing: each prompt once through jet-router 0.3.2 shadow (host claude-code, provider Jev, cloud consent on) in a fresh interactive session started with `--effort xhigh`. The generation is interrupted after the shadow summary appears; that partial generation is routing overhead, not an observation. Freeze the six displayed recommendations in `routes.json` before any generation; no retuning or rerouting. A skipped route (no recommendation) stops the experiment for that task; no retries. Include every strict downshift (low/medium/high); report keep and failures as exclusions.

Generation: for each eligible task, three paired repetitions, xhigh versus recommended effort, arm order alternating by task index and round. Sequential, fresh `claude -p` sessions, `--tools ""`, `--json-schema {code}`, `--setting-sources ""`, `--strict-mcp-config`, CLAUDE.md/auto-memory disabled, function hooks disabled, no Jev key in the environment. At most 36 generations plus six Jev calls. Any generation error, non-JSON result or a transcript-recorded effort different from the requested one stops the experiment; keep all observations. Failed quality checks remain observations, never retried.

Primary metric: sum of Claude-reported `output_tokens` per arm and paired reduction. Also report input, cache read and cache creation tokens separately and the CLI-reported `total_cost_usd` as descriptive only. Quality regression means baseline passes but the paired recommendation fails. Both-fail cases do not establish savings.

Pass criterion (fixed before results, same as Codex): at least 10% aggregate output-token reduction over eligible tasks, no observed pass-to-fail pair, and a fully completed run. Small N, reused synthetic tasks and cache/latency confounding must be stated regardless of the outcome. Production remains shadow-only; the evaluator applies the recommendation explicitly through `--effort`. Jev cost is not exposed and is excluded.
