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


## Publication and clean-checkout verification

The user explicitly requested a push. Published `feat/effort-router` to
`https://github.com/jetsongdev/jet-router.git`; remote SHA matched
`c9517b6e42be1b812d361661e027c908ac96fc85`. The previously empty remote now points
HEAD at that branch. No force push, main-branch merge, PR, tag or release was made.

Cloned the public branch into a fresh temporary directory without .env, local
handoff documents or dependencies. `npm test` (43), `npm run test:hooks` (2), and
`npm run validate` all exited 0; the clone stayed clean. This verifies shipped
files and offline runtime loading, not marketplace installation, secure-storage
configuration or an interactive Claude session. README/usage now reflect the
published repository and include the remote installation commands. The old
no-push statements above describe earlier stages.

## Codex MCP shadow adapter — local implementation

User-authorized follow-up from `394c828`, isolated on `feat/codex-mcp-shadow`.
This extends the original Claude-only scope; it does not change the pinned handoff
or claim Codex supports Claude's request mutation contract.

Added a separate `mcp/` package (SDK 2.1.0, Zod 4.6.5, locked dependencies), one
`jet_router_shadow` tool, and a Codex `UserPromptSubmit` configuration example.
The server defaults off/fake; Jev requires shadow, consent, environment key and
an explicit reference effort. It reuses the existing HTTPS helper/parser and
process limits without modifying shared provider or Claude hook source files.

Codex's documented hook input does not include current effort. The adapter does
not guess it: reference effort is labeled user-specified, actual effort unknown,
and changes are always none. All successful tool results contain nonblocking
hook JSON; no additionalContext or effort setter is returned. Concurrent calls
are skipped and the last 256 event ids suppress duplicate calls/reports in one
server process. Runtime raw provider output, prompts and keys are not logged.

Verification on Node 23.11.0:

| Command/check | Result |
| --- | --- |
| `npm --prefix mcp test` | Exit 0, 18 offline tests; includes real SDK STDIO initialization/list/call, duplicate/schema/error checks |
| `npm test` | Exit 0, existing 43 tests |
| `npm run test:hooks` | Exit 0, existing 2 Claude fake/Jev mock tests |
| `npm run validate` | Exit 0, strict Claude plugin and marketplace manifests |
| Python tomllib + Ajv Draft-7 against official Codex config-schema.json | Exit 0, example TOML accepted; format validation disabled, field/type validation active |

The first schema-validator command assumed Ajv was a transitive SDK dependency
and failed with module-not-found. Installed it only in a temporary validation
directory and reran successfully; it is not a project runtime dependency.

[Codex installation and manual checklist](codex-mcp.md) records remaining host
verification: trust review, automatic hook dispatch, UI placement, cancellation,
missing-server continuation and actual request-effort evidence. MCP protocol
success is not proof of these native Codex behaviors. No Codex user settings,
credentials, actual model sessions, Jev live calls or enforce were used here.

Clean-install follow-up: copied only source/package files into a new temporary
directory, installed the lockfile with `npm ci --offline --ignore-scripts`, and
reran all 18 MCP tests (both exit 0). No existing node_modules, credentials or
user configuration were copied. Temporary files were removed after the check.

Added [cross-client mechanism diagrams](architecture.md) at the user's request,
including classification timing, shared Jev transport, message timing, actual
versus reference effort, and the unimplemented enforce boundary.

## MCP follow-up refactor and pre-push verification

Extracted the existing helper body validator as `parseHelperBody` so both the
process adapter and MCP can use it directly. MCP no longer serializes an already
parsed provider result just to parse it again. Process exit status, output-size
limit and JSON parsing remain at the process boundary; enum/numeric validation
and removal of extra fields remain shared. No new provider, mode or setting.

Baseline MCP tests: 18 passed. After refactoring, `npm test` passed 45 tests
(including two new validation-boundary regressions), `npm --prefix mcp test`
passed 18, `npm run test:hooks` passed 2, and `npm run validate` passed both
manifests. All commands exited 0. Native Codex hook/UI checks remain manual;
no live API calls or user settings changes were made. The user authorized pushing
the isolated branch after this verification; default-branch integration remains
separate.


## HARNESS-001 stage one — offline request preparation

Implemented `src/harness.js` with explicit host/reference/unknown provenance,
model capabilities, event correlation and context-missing state. Request choices
are the intersection of advertised fixture capabilities and current policy,
plus keep. All outputs remain enforce-ineligible. Unknown required facts skip;
model summaries are unverified input, not host facts. No adapter runtime or
existing provider transport was changed.

Added a fixed 14-case contract corpus and an offline-only runner. Reports contain
versions and request hashes, not prompt/context/event ids or credentials. A
committed report detects request drift; it is contract evidence, not Jev quality
or verified model capabilities. Initial focused tests failed with the expected
missing-module error (exit 1); after implementation all 20 new tests passed.

Verification: `npm test` (65), `npm --prefix mcp test` (18),
`npm run test:hooks` (2) and `npm run validate` all exit 0.
`node scripts/evaluate-harness.mjs --dry-run` exits 0, fixtures 14/14, provider
calls 0. No credentials were read or live API/model requests performed.

Next: establish actual host capability/context provenance, validate dynamic
response choices and transport, then wire adapters. Current helper rebuilds
fixed-choice requests and cannot consume the new prepared payload as-is.
See [harness guide](harness.md) and [TASKS](../TASKS.md) for boundaries.


## 요청별 후보 응답 검사와 helper 연결 (2026-09-27)

- `parseJevResponse`는 요청별 후보를 받아 선택값과 확률 분포의 정확한 후보 집합을 검사한다.
  기본 호출의 고정 후보 동작은 유지하며, 잘못된 후보 집합·범위 밖 응답은 거부한다.
- helper는 `routingInput`에서 공통 하네스로 질문을 재구성한다. 임의 질문을 수용하지 않으며,
  `state`와 중복 입력하거나 하네스가 보류하면 네트워크 호출 없이 종료한다.
- 새 회귀 테스트 3개는 구현 전 실패, 구현 후 통과했다. 모의 전송으로 본문과 응답 후보 일치를 확인했다.
- 실제 Claude/Codex 훅은 아직 기존 `state` 경로를 사용한다. 실제 Jev 호출·모델별 품질·effort 변경 검증은 하지 않았다.
