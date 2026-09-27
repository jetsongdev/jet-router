# Local implementation record

## Scope and state

Project name: jet-router. Spec pin and execution basis: [spec-lock.json](spec-lock.json).
The original ten handoff documents were matched byte-for-byte against the local
handoff repository at the pinned SHA during P0. They remain unchanged outside
this worktree and are ignored by Git, together with the original `HANDOFF.md`.
The public raw URL returned 404; no credential or broader access was requested.

The remote was empty/public when inspected. Local setup commit initializes only
`.gitignore` on `setup/jet-router`; implementation is in `feat/effort-router`.
No remote writes, installation, dependencies, global settings changes, live model
requests, secret lookup or project-prompt transmission were performed.

## Delivered

- Pure policy guards: supported enums, keep, max, manual lock, subagents, risk
  downgrade and insufficient context. A candidate is not an approved application.
- Loadable Claude plugin and marketplace manifests, default off and explicit
  fake/opt-in Jev shadow, status/off/lock/unlock commands, enforce refusal.
- Conservative prompt/turn matching, bounded wait, cancellation on lifecycle
  changes and rejection of stale outcomes; identical request delegation.
- One sanitized summary after main-turn completion, with no prompt/key/error body
  or separate log files. Assistant response content is unchanged; duplicate
  tool-step/subagent summaries and stale summaries are suppressed.
- Pure Jev request builder and strict parser, opt-in taskContext, bounded inputs,
  distribution and finite-number validation. A bounded one-shot Node HTTPS adapter now implements Jev shadow; no live call has been made.

The preview does not import the pure policy into an applying hook: all requests
are unconditionally unchanged. The policy's structural candidates are reserved
for later evaluated enforcement; shadow displays the fixture choice or a structurally validated, explicitly unevaluated Jev choice.

## Verification

Tests were written before the policy implementation; the initial `npm test`
failed with missing policy module (exit 1). Following implementation:

| Command | Evidence |
| --- | --- |
| `npm test` | Exit 0; 43 offline policy, Jev protocol, transport, CLI and lifecycle tests passed |
| `npm run validate` | Exit 0; strict plugin/module and marketplace validation passed |
| `npm run test:hooks` | Exit 0; 2 installed Claude 2.1.283 tests passed (fake/Jev), mocked downstream endpoints/process |
| `git diff --check` | Exit 0; whitespace check |

The lifecycle suite includes off-before-provider-start regression coverage. No dependency
installation is required. The npm test process in this worktree reported Node
23.11.0; the initial shell probe reported 24.7.0, so no single global Node version
is assumed. Both exceed the documented minimum.

The first plugin validation caught a scanner restriction on a nested `$` helper.
Initial runtime tests also exposed incorrect test mocks (hook-context `$` used
instead of the kit's engine, and missing typed result fields). Those mocks were
corrected to the official contract; assertions were not weakened.

## Acceptance boundary

AC-02 is covered offline. AC-01/03/04/05/06/07/08/10/14/15 have only the applicable
policy, fake or mocked runtime evidence. The plugin test runs with a virtual cwd
without SDD documents; no runtime SDD reads exist. AC-09/11/12/13 and full provider,
enforce and live-session acceptance remain open. A mocked downstream request is
not production evidence or proof of internal reasoning effort.

Remaining gates: live Jev transport verification, local-provider no-egress guarantees,
provider-specific policy thresholds and evaluation set, Jev data policy/consent,
real-request verification and local model resource measurements. Public release
also needs a license choice and authorized push/review. See [compatibility](compatibility.md).


Summary polish: the footer labels fake as a test fixture, shows the forwarded
effort before its recommendation and translates reason codes into readable Korean.
Skipped classification has no invented zero-duration measurement. The status
command separates current mode/lock from the previous completed summary; that
summary is memory-only and cleared on session start. Node tests cover these
cases and the installed offline hook test asserts the formatted completion line.
Live terminal placement remains unverified.


[First review and regression fixes](review-01.md) records two reproduced
lifecycle races and the next [transport decision](provider-transport.md).


## Jev shadow follow-up

User approved the one-shot Node helper after the transport proposal. Runtime
requires explicit provider selection, boolean cloud consent, a supplied sensitive
key and shadow mode. No environment or settings secret lookup was added. The
key is a Claude sensitive option; its actual secure-store UI has not been tested.
The helper receives bounded stdin and emits only enum/numeric evidence or fixed
error codes. Provider model strings and arbitrary response fields are omitted.
No dependency, install, real key or external API call was used during this work.

The process host logs inspected in 2.1.283 omit stdin and output bodies; they log
executable, argument count, cwd, PID, timing, exit code and output lengths. This
static observation is version-specific, not a guarantee about third-party hooks
or every debug/telemetry facility. See [transport evidence](provider-transport.md).

Tests inject transport streams for TLS configuration, fixed endpoint, redirect,
HTTP error, malformed/numeric response, byte bounds and absolute/trickle timeout.
The CLI tests execute Node with invalid/missing-key/oversized synthetic stdin and
therefore never reach HTTPS. Installed hook tests use disposable manifests with
synthetic keys and mock process.run. These do not establish live TLS, TypeSafe
availability, billing, secret-store persistence or real request latency.

The first new test run exposed a missing reject function in the test's deferred
helper; that fixture was fixed. Strict validation also caught the host rule that
$ cannot cross an import; the process adapter now lives at hook module scope,
while protocol parsing remains a pure imported function.


## First live smoke follow-up

After the user requested the next evaluation and designated the project .env key,
12 synthetic Jev calls completed successfully. [The run record](evaluations/jev-smoke-2026-09-27.md)
separates these live helper results from prior mock-only evidence and identifies
unknown billing/model metadata. No plugin installation, settings mutation or
interactive Claude request was performed. The earlier no-live-call statements
above describe the implementation stage before this follow-up. No enforce gate
was relaxed after the results; context score calibration remains unresolved.


## Behavior-preserving refactor

Baseline: `e232f63`. Centralized the repeated Jev key check, child environment,
process timeout and helper output limit in the existing pure provider module.
The hook now reuses the effort enum and active-turn predicate, and spells out
provider selection and normalized result reasons instead of nested ternaries.
The host process adapter remains in the hook module as required by its scanner.
No generic provider framework, new dependency or configuration option was added.

Before and after: `npm test` (43), `npm run test:hooks` (2) and `npm run validate`
all exited 0. The evaluation `--dry-run` output was byte-identical (`cmp`, exit 0),
including every request hash; `git diff --check` exited 0. Existing stale-result,
request identity, consent, key, timeout and helper CLI tests cover the touched
paths. No real API calls or credential reads were needed for this refactor.
The prior live report remains an immutable record of its earlier source hashes.
