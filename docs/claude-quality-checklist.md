# Claude Code 설치 확인·동일 과제 비교 체크리스트

현재 가능한 것은 **플러그인의 off/shadow 테스트**와 **CLI에서 추천 effort를 명시한 비교 실험**이다.
플러그인 enforce 자동 적용은 미구현이다. 이 문서나 비교 스크립트의 통과를 enforce 검증으로 기록하지 않는다.

2026-09-28: Claude Code 2.1.283에서 무과금 plan 확인과 mock 검증 완료. 실제 Claude 생성·로그인·계정별 모델 접근은 미검증이다.
Claude 토큰 부족으로 실사용은 보류 중이다. 토큰이 확보되면 아래 smoke부터 실행한다.

## A. 정확한 코드 버전과 준비

- [ ] `feat/codex-mcp-shadow` 브랜치의 최신 코드가 있는 폴더에서 실행한다. 원격 기본 브랜치 설치에는 아직 이 실험 코드가 없을 수 있다.
- [ ] `git status --short --branch`, `git rev-parse HEAD`로 사용 버전을 기록한다.
- [ ] Node 23.11+ 권장(평가기는 Node permission 기능 사용), Claude Code **2.1.283+** 확인.
- [ ] 일반 터미널에서 `claude auth status`로 인증을 확인한다. 키나 인증 출력 전문을 리포트에 붙이지 않는다.
- [ ] `/model`에서 사용 가능한 실제 모델을 확인한다. 설정 예시는 `claude-opus-5-5`이며 계정 접근을 보장하지 않는다.
- [ ] `eval/claude-quality/smoke.json`, `full.json`의 model·baseline·rounds·예산을 확인한다.
- [ ] xhigh는 비교를 위해 고정한 기본값이며 Opus 5.5의 기본 설정이라는 뜻이 아니다.
- [ ] Jev 평가용 `.env`에 `TYPESAFE_API_KEY`가 있다. `.env`는 플러그인 설정과 별개다.
- [ ] 관리 정책의 모델 제한·effort 상한이 있다면 기록한다. CLI 지정만으로 서버 적용값을 증명할 수 없다.

지원하는 고정 모델 ID: `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5`,
`claude-opus-4-8`, `claude-opus-4-7`은 low/medium/high/xhigh.
`claude-opus-4-6`, `claude-sonnet-4-6`은 low/medium/high만 비교한다.
max는 라우터 보호 정책 때문에 제외한다. alias(`opus`)·알 수 없는 모델은 호출 전에 거부한다.
새 모델은 [공식 effort 지원 범위](https://code.claude.com/docs/en/model-config#adjust-effort-level)를 확인한 뒤 allowlist를 갱신한다.

## B. 실제 플러그인 설치·shadow 확인

먼저 토큰 없는 오프라인 검사:

```sh
npm test
npm run test:hooks
npm run validate
```

아래부터 일반 Claude 답변 사용량이 발생할 수 있다. 플러그인 코드가 있는 폴더에서:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir "$PWD"
```

- [ ] `/jet-router status`: 초기 off, provider=fake 확인.
- [ ] `/jet-router shadow` 후 `"Helllo"를 "Hello"로 바꾼 결과만 답해줘.` 제출.
- [ ] 응답 완료 후 fake 추천이 한 번 표시되고 기본 effort가 유지됨을 확인.
- [ ] `/plugin` → Installed → jet-router → Configure options에서 provider=jev, cloudConsent=true, jevApiKey 설정 후 안내에 따라 재시작.
- [ ] `/jet-router shadow` 후 같은 합성 프롬프트를 제출해 Jev 추천 표시 확인.
- [ ] 다음 프롬프트, `/jet-router off`, 새 세션 초기 off 동작 확인.
- [ ] 실제 서버 effort를 관측하지 못했다면 unknown으로 남긴다. 추천 메시지는 적용 증거가 아니다.
- [ ] 나머지 UI·취소·모델 변경 항목은 [기존 체크리스트](test-checklist.md)로 수행한다.

## C. 비용 비교 smoke — 최대 Jev 1회 + Claude 2회

아래 명령은 같은 터미널에서 순서대로 실행한다. 새 출력 경로를 매번 생성하므로 과거 실험을 덮어쓰지 않는다.

```sh
# 무과금: 설정·CLI 버전·최대 호출 횟수와 예산 표시
node scripts/claude-quality.mjs plan eval/claude-quality/smoke.json

# 실제 키 파일의 경로만 지정 (키 값 자체는 명령행에 넣지 않음)
JEV_KEY_FILE=/Users/chsong/Documents/sidespace/projects/effort-router/.env
CLAUDE_TRIAL_DIR="$(mktemp -d /tmp/jet-router-claude-smoke.XXXXXX)/trial"

# 여기부터 Jev 외부 호출
node scripts/claude-quality.mjs route eval/claude-quality/smoke.json "$JEV_KEY_FILE" "$CLAUDE_TRIAL_DIR"
# 하향 추천된 과제만 실제 Claude 호출
node scripts/claude-quality.mjs run "$CLAUDE_TRIAL_DIR"
# 저장 코드 재검사와 리포트 생성. 외부 호출 없음
node scripts/claude-quality.mjs report "$CLAUDE_TRIAL_DIR"
```

- [ ] plan의 `liveCalls:0`, 설치 CLI 버전, 모델·baseline 확인.
- [ ] route의 complete=true 확인. keep/동일/상향 추천은 제외되며 임의의 낮은 값으로 대체하지 않는다.
- [ ] 하향 추천이 없다면 실제 Claude 호출은 0회이고 리포트 비교 값은 N/A다. 이것을 절감 성공으로 해석하지 않는다.
- [ ] run의 두 결과가 기본값/추천값으로 각각 실행되었고 서로 다른 threadId인지 확인.
- [ ] observedModels가 지정 모델과 일치하고 모두 독립 검사를 통과했는지 확인.
- [ ] report의 complete=true, comparable=true를 확인한 뒤에만 절감률을 해석한다.
- [ ] route 오류는 `routes.json`에 남는다. run의 quota·예산 초과·timeout은 즉시 중단하며 `report`로 부분 결과를 정리한다. 자동 재시도는 없다.
- [ ] 최초 실사용 응답 포맷이 예상과 다르면 `generation-or-evidence-invalid`로 중단한다. 검사를 완화해 강제로 통과시키지 않는다.

`--max-budget-usd`는 실행별 CLI 한도이며 요청 진행 중 실제 청구의 절대 상한을 보장하지 않는다.
각 생성의 프로세스 제한은 180초, 검사 제한은 5초다. 스크립트 차원의 재시도는 없지만 CLI 내부 전송 재시도는 관측하지 않는다.
raw stdout/stderr·인증 정보는 저장하지 않고 합성 코드와 정규화된 사용량만 저장한다.

## D. 전체 비교 — 최대 Jev 6회 + Claude 36회

smoke 확인 후 새 폴더에서 실행한다. 각 과제의 기본/추천을 3회씩 비교하며 순서는 교대한다.

```sh
node scripts/claude-quality.mjs plan eval/claude-quality/full.json
CLAUDE_FULL_DIR="$(mktemp -d /tmp/jet-router-claude-full.XXXXXX)/trial"
node scripts/claude-quality.mjs route eval/claude-quality/full.json "$JEV_KEY_FILE" "$CLAUDE_FULL_DIR"
node scripts/claude-quality.mjs run "$CLAUDE_FULL_DIR"
node scripts/claude-quality.mjs report "$CLAUDE_FULL_DIR"
```

- [ ] 과제와 검사는 Codex 비교의 `eval/task-quality/tasks.mjs`, `grade.mjs`와 동일하고 해시가 유지된다.
- [ ] Jev 추천은 모델에 맞춰 새로 조회한다. Codex의 추천 effort를 Claude에 그대로 복사하지 않는다.
- [ ] 한 번 받은 추천을 고정하여 반복한다. Jev 판정 안정성 평가는 아니다.
- [ ] 각 생성마다 새 임시 폴더·UUID·프로세스·`--no-session-persistence`를 사용한다.
- [ ] 추천 설정만 실패한 쌍은 품질 회귀로 센다. 테스트 실패는 숨기거나 재생성하지 않는다.
- [ ] `routes.json`, `report.json`, `summary.json`, `REPORT.md`를 보존한다. `/tmp` 결과는 재부팅/정리 전에 별도 폴더로 복사한다.
- [ ] 비교가 끝나도 플러그인은 shadow 상태다. 사용자 설정 변경이나 enforce 활성화는 하지 않는다.

## E. 토큰·비용 해석

Claude의 `input_tokens`는 **비캐시 입력만** 뜻한다. 전체 입력은 다음과 같다.

```text
전체 입력 = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

리포트의 input은 위 합계, uncachedInput/cacheRead/cacheWrite는 구성 요소다.
추론 토큰을 따로 관측하지 못하면 null로 유지하며 출력에 다시 더하지 않는다.
`reportedCostUsd`는 Claude CLI의 `total_cost_usd`를 기록한 추정값이고, 실제 구독 청구액이 아니다.
누락되면 unknown을 유지한다. **Codex용 가격 계산기와 GPT-6 Astra 단가를 Claude 결과에 사용하지 않는다.**

- [ ] 출력 감소와 전체 입력 포함 감소를 구분한다.
- [ ] 캐시 읽기뿐 아니라 쓰기 비용과 유지 시간을 고려한다. 공식 단가로 재계산하려면 모델·처리 등급·캐시 TTL을 먼저 확인한다.
- [ ] cacheRead/cacheWrite 차이가 크면 CLI 추정 비용 차이를 effort만의 효과로 단정하지 않는다.
- [ ] Jev 비용·실패 후 수정 비용이 제외되었음을 표시한다.
- [ ] 독립 세션이어도 서버 캐시 적중은 가능하다.
- [ ] 같은 과제·검사를 써도 Claude와 Codex의 시스템 프롬프트·토크나이저·effort 의미가 달라 모델 간 절대 효율 순위로 해석하지 않는다.

비교 스크립트는 `--safe-mode`/`--restricted`로 사용자 커스터마이징을 제외하고 도구·MCP를 제한한다.
관리 정책은 남을 수 있다. `CLAUDE_CODE_EFFORT_LEVEL`은 자식 프로세스에만 지정하고 기존 thinking 예산 환경값은 전달하지 않는다.
플러그인의 turn.step 경로를 실행하지 않으며, 모델/effort 정보도 실제 hook 관측 대신 명시적 평가 설정(user-reference)을 사용한다.
이 때문에 플러그인 UI의 추천과 반드시 같다는 보장은 없다.

## F. 실행 결과를 공유할 때

```text
사용 커밋 / Claude 버전 / 모델 / 기본 effort:
설치 shadow: 통과·실패·미실행
비교 폴더 / smoke·full:
complete / comparable / 실행 실패 수:
기본·추천 검사 통과 수 / 품질 회귀 쌍:
출력 토큰 / 전체 입력 / 캐시 읽기·쓰기:
CLI 추정비용 / 실제 청구액 미확인:
남은 검증: 실제 서버 effort, enforce 및 기본값 유지
```

## 공식 근거

- [CLI 옵션](https://code.claude.com/docs/en/cli-reference): effort·독립 실행·safe-mode·도구 제한·예산.
- [프로그램 실행 결과](https://code.claude.com/docs/en/headless): structured_output·사용량 메타데이터.
- [환경변수 우선순위](https://code.claude.com/docs/en/env-vars): CLAUDE_CODE_EFFORT_LEVEL.
- [Claude 캐시 토큰 정의](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): 입력·캐시 읽기·쓰기의 합산.

현재 완료 증거: 로컬 버전·오프라인 plan·정상/오류 fixture·독립 세션/임시 폴더·원본 코드 재검사.
현재 없는 증거: 실제 Claude 생성, 계정 모델 접근, 실제 설치 UI, 서버 effort 변경, enforce.

작성 시 검증: `npm test` 109/109, `npm run test:hooks` 오프라인 2/2,
`npm run validate` 두 manifest 통과, smoke/full `plan` 각각 liveCalls=0, `git diff --check` 통과. 모든 명령 종료 코드 0.
