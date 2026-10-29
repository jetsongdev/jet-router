# effort-ladder 구현 계약 (팀원 공통)

계획: `/Users/chsong/Documents/sidespace/projects/effort-router/.worktrees/ops-plan/docs/planned/ops/plan-eval.md`
과제 초안: `/Users/chsong/Documents/sidespace/projects/effort-router/.worktrees/ops-plan/docs/planned/ops/notes/er-eval-tasks-a.md`(단발), `.../notes/er-eval-tasks-b.md`(도구 루프)
라우터 shadow 규칙: `/Users/chsong/Documents/sidespace/projects/effort-router/.worktrees/ops-plan/docs/planned/ops/plan-router.md` §3

모든 경로는 `eval/effort-ladder/` 기준이다. Node >= 22, ES module, 의존성은 이미 설치된 `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`와 Node 내장 모듈만 쓴다. 이 하위 패키지는 플러그인 런타임(`src/`, `hooks/`)과 섞지 않는다.

## 소유 파일 (남의 파일은 고치지 않는다)

| 팀원 | 소유 |
|---|---|
| er-eval-core | `lib/ids.mjs`, `lib/pricing.mjs`, `lib/ledger.mjs`, `lib/grade-single.mjs`, `lib/single-prompt.mjs`, `scripts/build-manifest.mjs`, `scripts/batch.mjs`, `scripts/ledger-report.mjs`, `.gitignore`, `test/core-*.test.mjs` |
| er-eval-single | `single/<slug>/**` (7개), `test/single-tasks.test.mjs` |
| er-eval-agenttasks | `agent/<slug>/**` (6개), `agent/grade-agent.mjs`, `test/agent-tasks.test.mjs` |
| er-eval-agentrun | `lib/shadow-raise.mjs`, `lib/agent-isolation.mjs`, `scripts/run-agent.mjs`, `test/agent-run-*.test.mjs` |

팀장(er-eval-lead)만 `package.json`, `CONTRACT.md`, `README.md`를 고친다.

## 유료 호출 차단 (모든 팀원)

- 네트워크로 모델을 부르는 코드는 **`--paid` 인자와 환경변수 `LADDER_ALLOW_PAID=1`이 둘 다** 있을 때만 실행한다. 없으면 즉시 종료 코드 3과 `paid call blocked`를 출력한다.
- 테스트는 전부 mock/stub으로 돌고 네트워크를 쓰지 않는다. 구현 중에 유료 경로를 실제로 실행하지 않는다.
- API 키 값은 읽거나 출력하지 않는다. 존재 여부도 `Boolean(process.env.ANTHROPIC_API_KEY)` 이상 다루지 않는다.

## 식별자 (`lib/ids.mjs`)

- `EFFORTS = ['low','medium','high','xhigh','max']`
- `SUITES = ['tq','ss','ag']` — tq: 기존 `eval/task-quality` 6개, ss: 신규 단발 7, ag: 신규 도구 루프 6
- `taskId(suite, slug)` → `"ss/heading-index"`
- `runId({wave, suite, slug, effort, rep, turn?, arm?})` → `"w1-ss-heading-index-high-r03"`. 2턴은 끝에 `-t2S` 또는 `-t2U`를 붙인다. 64자 이하이고 `[A-Za-z0-9_-]`만 쓴다(Batch `custom_id` 규칙).
- `sha256(text)` → 소문자 hex

## 모델·요청 상수

- 모델 `claude-opus-5-5`만 쓴다. effort는 항상 명시한다.
- 단발(Batch): `max_tokens` 32000, `output_config: {effort, format: <JSON schema {code: string}>}`. thinking은 생략한다(Opus 5.5 기본 adaptive). prefill과 forced tool_choice는 쓰지 않는다. 정확한 `format` 필드 모양은 설치된 `@anthropic-ai/sdk`의 타입 정의에서 확인한다.
- 도구 루프(Agent SDK): `options.effort`, `options.maxTurns`(과제 `meta.json`), `options.maxBudgetUsd`(max 단계 1.5, 그 외 1.0).

## 단발 과제 파일 (`single/<slug>/`)

- `spec.txt`: 과제 명세(영문). 초안 er-eval-tasks-a.md의 명세를 쓰되, 실제 프롬프트는 `lib/single-prompt.mjs`가 기존 `scripts/run-task-quality.mjs:12-13`와 같은 감싸기 문구로 만든다. 그러니 `spec.txt`에서 "Return only JavaScript ES module code; no imports or external libraries." 문장은 빼도 된다.
- `checks.mjs`: `export const checks = [async (mod) => { /* 실패 시 throw */ }, ...]`. `mod`는 모델 코드를 import한 모듈 객체다. 검사 하나가 초안의 검사 항목 하나에 대응한다.
- `reference.mjs`: 정답 구현.
- `mutants/m1.mjs` … (과제당 3개 이상): 일부러 틀린 구현. 각각 검사 1개 이상에서 떨어져야 한다.
- 검사는 결정적이어야 하고, 검사 하나는 2초 안에 끝나야 한다. 처리되지 않은 rejection을 남기지 않는다.

## 도구 루프 과제 파일 (`agent/<slug>/`)

- `prompt.txt`: 모델에게 주는 첫 사용자 입력 전문(초안 er-eval-tasks-b.md).
- `meta.json`: `{"maxTurns": <권고값>, "hiddenTimeoutMs": <채점 전체 제한>}`
- `fixture/`: 모델이 받는 초기 저장소. `test/public.test.mjs` 포함. 초기 상태에서 숨긴 검사가 1개 이상 실패해야 한다.
- `solution/`: fixture 위에 덮어쓰면 정답이 되는 파일들.
- `mutants/<name>/` (3개 이상): fixture 위에 덮어쓰는 틀린 변형. 각각 숨긴 검사 1개 이상에서 떨어져야 한다.
- `hidden/checks.mjs`: `export const checks = [async (ctx) => {...}]`. `ctx = {dir, runNode(args, {input?, timeoutMs?, nodeOptions?}) → {code, stdout, stderr}, readFile(rel), writeFile(rel, text), tmpDir()}`.
- `agent/grade-agent.mjs`: `export async function gradeWorkspace(slug, dir)` → `{passed, passedChecks, totalChecks, results:[{index, ok, error?}], publicTestsUnmodified}`. 채점은 `dir`의 **사본**에서 한다. 공개 테스트 파일이 fixture 원본과 다르면 `publicTestsUnmodified:false`이고 통과로 치지 않는다.

## 원장 (`lib/ledger.mjs`)

- `openLedger(path, caps)`. caps 기본값 `{pilot:5, batch:30, agent:85, boost:20, turn2:15}`(USD). pilot·batch·agent·boost 합계 상한은 140이고, turn2는 그와 별도다.
- `reserve(segment, usd, note)` → `reservationId`. `확정 지출 + 미정산 예약 + usd > 구간 상한`이거나 합계 상한을 넘으면 `CapExceededError`를 던진다.
- `settle(reservationId, {runId, usd, usage, source})`. source는 `batch-usage`|`sdk-total_cost_usd`|`assumed-max`이다.
- `release(reservationId)`
- `totals()` → 구간별·합계의 확정·예약 금액
- 저장은 append-only JSONL이고, 열 때 재생해서 상태를 복원한다. 동시에 쓰는 프로세스는 하나라고 가정하고, 잠금 파일로 두 번째 프로세스를 거부한다.

## 단발 채점 (`lib/grade-single.mjs`)

`gradeSingle({suite, slug, code})` → `{passed, passedChecks, totalChecks, results, error?}`. 별도 Node 프로세스에서 permission 모드로 실행하고, 5초 제한에 임시 디렉터리를 쓴 뒤 정리한다(기존 `scripts/run-task-quality.mjs:28-35` 방식). tq는 `../task-quality/grade.mjs`의 `grade(id, mod)`를, ss는 `single/<slug>/checks.mjs`를 쓴다.

## 실행 기록 행 (JSONL, `runs/<wave>/*.jsonl`)

`{v:1, runId, taskId, kind, effort, rep, wave, turn, arm, parentRunId, model, promptSha256, fixtureSha256, startedAt, durationMs, stopReason|endReason, truncated, usage, costUsd, costSource, passed, passedChecks, totalChecks, publicTestsUnmodified, shadowRaise, effortEvidence}`

`effortEvidence`: 단발이면 요청 effort와 출력 토큰, 도구 루프면 transcript/system init에서 확인한 effort 값(없으면 null). 원문 코드는 `runs/<wave>/code/<runId>.mjs`(단발) 또는 `runs/<wave>/ws/<runId>/`(도구 루프 최종 작업 트리)에 둔다. `runs/`는 git에서 제외한다.
