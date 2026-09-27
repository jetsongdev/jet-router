# Actual coding quality loop — preregistered

Starting production commit: 68a8118. Codex CLI 0.157.1, model gpt-6-astra.
Primary outcome: all withheld checks pass for a coding task, not agreement with an effort label.
Four development tasks, two repetitions per policy. Two fresh holdout tasks reserved for final checks.
Generated code is evaluated without repair feedback in a separate Node process, with 5s deadline and
filesystem permissions limited to its temporary directory and grader. Generation uses fresh ephemeral
read-only Codex sessions, ignores user config/hooks, and receives only the public specification.
No target code tools are requested; a run using tools is invalid rather than silently accepted.
This is withheld testing, not a proof of formal isolation or an adversarial-security benchmark.

Fixed medium is the reference. Jev recommendations are mapped keep→medium; actual returned effort is
passed explicitly to codex exec via model_reasoning_effort. Record this requested setting, generated code,
thread id, tests, latency, token usage. Wire-level server reasoning configuration remains unobserved.
Never claim a shadow plugin itself applied effort. These are separate evaluator invocations.

Evaluate the current router, then at least three single-hypothesis instruction variants. Each candidate
gets fresh code execution even when recommendation overlaps the incumbent. Adopt only an increase of
at least 1 fully passing task-run out of 8, with no task losing its previously passing repetitions and
no infrastructure failures. Require the gain against a fresh incumbent confirmation as well, to reduce
selection of lucky output noise. Token/latency reductions alone do not justify quality adoption.
Stop after 3 consecutive candidates without a confirmed quality improvement; adopted changes reset streak.
Transport/quota errors pause that comparison, not a quality win or loss. No automatic retries.
On completion compare chosen policy and medium on fresh holdout (2 tasks × 2 repeats per arm).
If fresh holdout quality regresses, do not ship that change. Never retune on the final holdout.

Evaluator/test bugs must be documented; fix them and invalidate affected measurements, never loosen
assertions to make generated code pass. All prompts, code and results are synthetic. Claude UI remains
deferred due missing tokens; enforce/merge are outside scope. Actual billed amount is unknown.
