# B1: Claude Code effort 요청 직렬화 (2026-10-29)

Claude Code **2.1.312**, `claude-opus-5-5`, 기본 `medium`, V1 더미 API 키, 로컬 가짜 SSE 응답으로 측정했다. 한 프로세스에서 stream-json의 첫 result를 받은 뒤 두 번째 user 입력을 보냈다. 첫 턴은 Read 3회 후 종료, 두 번째 턴은 Read 1회 후 종료됐다. 실제 모델 응답의 품질이나 서버의 beta 처리, 캐시 적중률을 측정한 결과는 아니다.

원본은 git에서 제외된 `eval/cache-measure/b1/raw/V1/<arm>/`에 있다. 요청 `001.json`~`006.json`은 각각 턴 1 step 0~3, 턴 2 step 0~1에 대응한다. `hook.jsonl`은 각 step의 `turnId`, `index`, `incoming`, `forwarded`, `next`를 기록한다. `run.json`은 전부 exit 0, result 2, timeout false다. 로컬 Read 결과는 `stdout.jsonl`에서 확인했다. 사전 실행 `raw/V1/preflight/`는 hook의 `node:fs` import가 런타임에 의해 거부되어 측정에서 제외했다.

| arm | hook에서 변경한 시점 | 요청별 top-level `output_config.effort` (001–006) | 요청 내 `messages[i].output_config.effort` |
|---|---|---|---|
| B1-0 | 없음 | medium × 6 | 모든 요청 i=1 medium |
| B1-L0 | 턴 1 step 0부터 high | high × 6 | 모든 요청 i=1 high |
| B1-L | 턴 1 step 2부터 high | medium × 4, high × 2 | i=1 medium 유지; 005–006에서 i=10 high 추가 |
| B1-N | 턴 1 step 2부터 42, 거부 | medium × 6 | 모든 요청 i=1 medium |
| B1-N0 | 턴 1 step 0부터 42, 거부 | medium × 6 | 모든 요청 i=1 medium |

| 질문 | 관찰과 근거 |
|---|---|
| Q-a | 모든 arm의 001–006 `headers.anthropic-beta`에 `per-turn-control-2026-07-01`과 `effort-2025-11-24`가 있다. V1에서 beta가 나오므로 조건부 V2는 실행하지 않았다. |
| Q-b | 양쪽에 존재한다: 요청 최상위 `output_config.effort`와 `messages[i].output_config.effort`. 최초 i=1의 직전 i=0은 user 입력이다. B1-L 005–006에서 추가된 i=10의 직전 i=9도 두 번째 user 입력이다. tool_result 직후 추가된 effort 메시지는 관찰되지 않았다. |
| Q-c | B1-L의 hook은 턴 1 index 2·3에서 high를 넘기고 `next`가 반환됐으나, 해당 `003.json`, `004.json`은 medium이다. high는 다음 턴 index 0의 `005.json`에서 처음 나타난다. B1-L0은 첫 턴 index 0의 `001.json`부터 high다. |
| Q-d | B1-N은 턴 1 index 2부터, B1-N0은 index 0부터 `next`가 예외를 던진다. 각각 `hook.jsonl`의 `error`: `effort-probe: next() passed an argument with an effort that is not one of low, medium, high, xhigh, max (a number is internal-only)`. 모든 해당 요청의 양쪽 effort는 medium이다. 호스트가 원래 값으로 계속 진행했다. |
| Q-e | 아래 prefix 표 참조. B1-L에서 실제 반영 직전 004→005의 직렬화 prefix는 13902자이고 직전 전체 13903자 중 마지막 배열 닫기 괄호를 제외한 부분이 일치한다. |

숫자 42는 지정된 `cc-strings.txt`의 관련 `tz`가 `se`를 호출하고, 바로 인접한 `se(e)`가 `Number.isInteger(e)`를 검사하는 근거로 선택했다. 이 경로에서 별도 숫자 상·하한은 확인되지 않았다. `WL`은 숫자를 표시 레벨 `high`로 변환하며, 별도 hook 인자 검사는 숫자 변경을 internal-only로 제한한다. 따라서 42는 정수 예시이며 지원 범위 전체나 숫자 API 직렬화를 입증하지 않는다.

## 직전 요청 대비 messages prefix

각 `body.messages`에서 모든 `cache_control` 키를 재귀 제거한 뒤 Python JSON (`ensure_ascii=False`, 키 정렬, 구분자 `,`와 `:`)의 **문자 수**로 비교했다. `summarize.py`로 재현한다. 괄호 안은 직전 배열 직렬화 전체 길이다. 배열 끝 `]`는 항목 추가 시 `,`로 바뀌므로 전체 길이보다 1 짧아도 기존 항목은 유지된 것이다.

| arm | 001→002 | 002→003 | 003→004 | 004→005 | 005→006 |
|---|---:|---:|---:|---:|---:|
| B1-0 | 12879 (12880) | 13220 (13221) | 13561 (13562) | 13902 (13903) | 13978 (14048) |
| B1-L0 | 12877 (12878) | 13218 (13219) | 13559 (13560) | 13900 (13901) | 13976 (14046) |
| B1-L | 12879 (12880) | 13220 (13221) | 13561 (13562) | 13902 (13903) | 13978 (14113) |
| B1-N | 12879 (12880) | 13220 (13221) | 13561 (13562) | 13902 (13903) | 13978 (14048) |
| B1-N0 | 12879 (12880) | 13220 (13221) | 13561 (13562) | 13902 (13903) | 13978 (14048) |

005→006에서는 두 번째 사용자 메시지의 표현이 바뀌어 직전 배열 전체가 유지되지는 않는다. 이 수치는 messages만 비교하며 시스템 프롬프트나 요청 본문 전체의 캐시 동등성을 뜻하지 않는다.

## 격리와 한계

각 `debug.log`에는 `jet-router (enabled=false; will NOT register, plugin is disabled)`와 시험 hook 로드가 있고 jet-router hook 모듈 로드 및 `api.typesafe.ai` 흔적은 없다. 각 hook 기록에도 시험 hook만 있다. inline 설정으로 해당 프로세스에서만 끄고 사용자 설정과 설치본을 수정하지 않았다. 캡처 헤더는 저장 전 `authorization`, `x-api-key`, `cookie` 및 이름에 token/key/auth가 포함된 값을 가린다.

각 프로세스에만 `ANTHROPIC_BASE_URL=127.0.0.1:<임의 포트>`와 더미 키를 지정했고, 가짜 서버가 예상한 `/v1/messages` 6개씩 총 30개를 수신했다. 이는 관찰된 30개 요청의 로컬 수신과 정상적인 두 턴 진행의 근거다. 외부 네트워크를 차단하거나 관찰하지 않았으므로 다른 경로의 별도 전송이 없었다는 독립적 패킷 수준 증명은 아니다. 텔레메트리 등은 차단·기록하지 않았다.
