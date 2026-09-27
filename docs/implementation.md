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
  fake shadow, status/off/lock/unlock commands, enforce refusal.
- Conservative prompt/turn matching, bounded wait, cancellation on lifecycle
  changes and rejection of stale outcomes; identical request delegation.
- Sanitized UI records with no prompt/key/error body and no separate log files.
- Pure Jev request builder and strict parser, opt-in taskContext, bounded inputs,
  distribution and finite-number validation. No network adapter.

The preview does not import the pure policy into an applying hook: all requests
are unconditionally unchanged. The policy's structural candidates are reserved
for later evaluated enforcement; shadow displays the validated fixture choice.

## Verification

Tests were written before the policy implementation; the initial `npm test`
failed with missing policy module (exit 1). Following implementation:

| Command | Evidence |
| --- | --- |
| `npm test` | Exit 0; 17 offline policy, Jev protocol and lifecycle tests passed |
| `npm run validate` | Exit 0; strict plugin/module and marketplace validation passed |
| `npm run test:hooks` | Exit 0; 1 installed Claude 2.1.283 test passed, mocked downstream endpoints |
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

Remaining gates: supported transport for local no-egress/redirect guarantees,
provider-specific policy thresholds and evaluation set, Jev data policy/consent,
real-request verification and local model resource measurements. Public release
also needs a license choice and authorized push/review. See [compatibility](compatibility.md).
