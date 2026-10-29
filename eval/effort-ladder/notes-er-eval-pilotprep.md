# er-eval-pilotprep → er-eval-lead

- 승인: D-ER-20261029-01, ER-HQ-20261029-015. 구현: Codex. 기준 브랜치 `feat/effort-ladder`, HEAD `6f116fe9ff2994ff6a59c71355f995d3b3e8d500`.
- Batch와 Agent 기본 원장을 `runs/ledger.jsonl`로 통일하고 `--ledger <path>`를 지원한다. Batch collect에도 submit과 같은 `--ledger`를 지정해야 한다. 원장은 프로세스 전체 실행 동안 잠기므로 두 실행기를 동시에 돌릴 수 없다.
- Batch submit의 기본 구간은 `batch`, Agent의 기본 구간은 1턴 `agent`·2턴 `turn2`다. `--segment pilot|batch|agent|boost|turn2`는 해당 실행의 모든 예약을 선택 구간에 넣는다. pilot 상한은 $5다.
- Agent init은 `runs/<wave>/init/<runId>.json`에 허용 필드만 저장하며 중첩 MCP·plugin 객체도 타입에 정의된 필드만 보존한다. 행에 `bashCalls`, `bashErrors`, `toolErrors`를 기록한다. `--fork-always`는 `--segment pilot --two-turn`과 함께 사용하고 통과한 대상에도 fork를 시행하며 2턴 행에 `forced:true`를 기록한다. 기존 규칙대로 max에서는 상위 effort가 없어 U를 생략한다.
- effort 근거: 설치된 SDK 타입의 `SDKSystemMessage.effort`, `SDKAssistantMessage.message`/`BetaMessage`, `SDKUserMessage`, `SDKPartialAssistantMessage`, transcript 관련 타입 및 SDK의 effort 선언을 확인했다. assistant/user/partial 메시지 타입에는 적용 effort 필드가 없으며, 도구 호출 맥락의 `BaseHookInput.effort.level`은 적용된 현재 턴 값으로 정의되어 있다. init 값이 없으면 `PreToolUse` hook의 이 값을 사용하고, 둘 다 없으면 `null`이다. 요청 옵션 effort는 관측값으로 취급하지 않는다.
- 검증: `cd eval/effort-ladder && node --test test/*.test.mjs` 종료 코드 0, 36개 통과, skip 0. 공통 원장·합계 및 pilot 상한, init 카나리 키 제외, Bash 및 전체 오류 수, 통과 후 강제 fork를 mock으로 검증했다. `git diff --check` 종료 코드 0.
- 유료 호출, 설치, 설정 변경, GitHub API/MCP, 커밋, 푸시는 하지 않았다. 실제 SDK 호출·fork/resume의 effort 반영 및 실제 비용은 미검증이다.
