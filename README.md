# jet-router

Experimental effort routing for an existing Claude Code session. The intended
flow is Jev recommendation → local policy → request-scoped `turn.step.effort`.

**Current build: offline preview only.** The plugin provides a deterministic
fake provider, starts off, and supports shadow observation. It does not call
Jev, a local model, or any other network service, and never changes effort.
Enforce is intentionally unavailable until provider transport, quality thresholds,
and real-request verification are complete. This is not a cost-saving release.

## Requirements and validation

- Claude Code **2.1.283** was tested with its offline function-hook test runner.
- Function hooks require `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. The API is early
  access; other versions are unverified. See [compatibility](docs/compatibility.md).
- Node 22+ for unit tests. No dependency installation or build step is needed.
- Herdr is optional. SDD documents and skills are not runtime dependencies.

```sh
npm test
npm run validate
npm run test:hooks
```

The last command loads this plugin only inside Claude's isolated testing kit;
model, clock and UI endpoints are mocked. It is not a live session test.

## Local preview

After reviewing the plugin and explicitly enabling function hooks, load from a
local checkout with `claude --plugin-dir /absolute/path/to/jet-router`.
This starts a Claude session; the implementation work did not execute it.

| Command | Behavior |
| --- | --- |
| `/jet-router status` | Shows provider, mode and manual lock |
| `/jet-router shadow` | Explicitly enables offline fake recommendations |
| `/jet-router off` | Stops classification and invalidates pending work |
| `/jet-router lock` | Pauses classification for manual control |
| `/jet-router unlock` | Releases the lock; mode remains unchanged |
| `/jet-router enforce` | Explains why enforcement is unavailable |

`fakeChoice` is a plugin configuration option: `keep` (default), `low`, `medium`,
`high`, or `xhigh`. It is a fixed test fixture, **not an intelligent classifier**.
Invalid values resolve to `keep`. No API key is accepted or needed.

Each session start resets the mode to off. Mid-turn input, queueing, overlapping
submissions, attachments, added hidden context, non-user origins, rewritten
prompts, inputs over 6,000 characters and uncertain correlation are skipped.
Subagents, max effort and unsupported effort values bypass classification.
One decision is reused as an observation for the turn; subsequent steps are not
classified again. A stalled fixture is bounded to 1 second.

After the main turn completes, one separate line appears below the response:

```text
[jet-router] shadow · fake · high → 추천 low · high 유지 · 0ms · shadow
```

This example uses the `low` fixture; the default recommendation is `keep`.
The assistant answer itself is unchanged. No duplicate line appears for tool
steps or subagents. Interrupted/error turns are labeled; off/lock/session changes
suppress pending summaries. If effort changed manually during the tool loop, the
line shows the last forwarded effort rather than claiming the initial one stayed.

The line contains only provider/mode, original/recommended/forwarded effort,
reason code and classifier latency. Forwarded means delegated to the next hook, not
confirmed on the wire or a measurement of internal reasoning. Jet-router writes
no log files; UI messages may remain in Claude's own transcript retention.
It does not read files, past conversations, environment keys or SDD documents.

## Status and public distribution

The local implementation is not yet published. A marketplace manifest is ready
for review, but installation from GitHub requires publishing this branch first.
No public distribution license has been selected yet; do that before release.
See [implementation evidence](docs/implementation.md) for completed work,
remaining gates, commands and limitations.
