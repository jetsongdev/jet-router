# Codex 초기화 시간 초과와 실제 모델 1턴 검증

2026-09-30, 기준 `9b5b9fc`, Codex 0.159.2.

## 초기화 실패 원인과 수정

기존 프록시는 모든 backend RPC에 15초 제한을 적용했다.
[재현 RPC 기록](before-rpc.json)에서 TUI의 thread/start에 응답이 없고
15,002ms 뒤 후속 thread/loaded/list 요청이 관측됐다. CLI는 backend-request-failed로 종료됐다.
이 실패는 모델 생성 요청 전이며 Jev/실제 모델 호출이 없는 가짜 provider 검증이다.

thread/start만 60초로 늘렸다. model/list, turn/start, effort 복귀 등 다른 RPC는 15초를 유지한다.
CLI probe의 대기 한도도 75초로 맞췄다. 전역 설정이나 기존 사용자 세션은 변경하지 않았다.
[수정 후 RPC](after-rpc.json)의 TUI thread/start는 **24,656ms**에 정상 응답했고
[5턴 CLI 통합](cli-evidence.json)은 low/medium/low/high/low 요청과 기준값 보존을 통과했다.
기존 제한이 정상 초기화를 실패로 처리한 직접 원인은 확인했다.
다만 backend 초기화 내부의 어떤 작업이 24초를 소요했는지까지 분석한 것은 아니다.

가상 시간 테스트는 15초 초과 초기화 성공, 일반 RPC 15초 제한, 초기화 60초 제한을 검사한다.
진단 fixture는 RPC 메서드·송신 시각·응답 시간·오류 코드만 저장한다. 프롬프트/키/원시 오류는 기록하지 않는다.

## 실제 모델 검증

`codex/probe-live.mjs`를 추가했다. 기본은 호출 없는 계획 출력이며 --live를 명시할 때만 동작한다.
Jev 최대 1회, Astra 최대 2턴, 스크립트 자동 재시도 없음. 오류가 나면 다음 턴을 제출하지 않는다.
새 임시 CODEX_HOME에 기존 auth.json 심볼릭 링크만 만들고 다른 사용자 설정을 복사하지 않는다.
키 값은 읽어 출력하지 않으며 Jev 키는 Codex child 환경에서 제거한다. 종료 시 임시 디렉터리를 삭제한다.
파일 기반 기존 로그인만 지원한다. 실제 provider의 내부 HTTP 재시도 수는 이 스크립트가 관측하지 않는다.

```sh
node codex/probe-live.mjs --dry-run
node --env-file=/absolute/private/.env codex/probe-live.mjs --live /tmp/new-live-report.json
```

기존 결과 경로는 덮어쓰지 않는다. live 실행은 비용/사용량이 발생하며 출력 파일은 0600으로 생성한다.
공식 [App Server 문서](https://learn.chatgpt.com/docs/app-server)와 설치된 CLI의 JSON schema를 확인했다.

### 실행 기록

1. [초기 실행](live-startup-failure.json): 잘못된 --ignore-user-config 옵션이 App Server 시작을 막았다.
   실제 Jev 0회·모델 0턴. 이 옵션은 현재 App Server에서 거절됨을 --help 명령으로 확인했고 제거했다.
   backend 연결 종료 시 RPC를 즉시 실패시키도록 검증기에도 반영했다.
2. [수정된 격리 실행](live-partial.json): 실제 Jev 1회, 실제 Astra 1턴 완료.
   Jev low/contextScore 0.86, backend turn/start에 low를 명시해 제출했고 완료 후 thread/read는 medium이었다.
   생성된 문자열 오타 수정 결과도 간단한 문자열 검사에 일치했다.
   검증기의 도구 사용 검사 실패로 두 번째 턴은 제출하지 않았다(종료 1).

| 실제 완료한 첫 턴 | 관측 |
| --- | --- |
| 기준 / Jev 추천 / backend 제출 | medium / low / low |
| 턴 상태 / 이후 기준값 | completed / medium |
| 입력 / 캐시 입력 / 출력 | 10,340 / 0 / 18 tokens |
| reasoning output / total | 0 / 10,358 tokens |
| 분류부터 완료·기준 조회까지 | 3,908ms |

usage는 App Server의 해당 turnId tokenUsage.last 알림이다. 실제 HTTP 요청 본문을 캡처한 것이 아니므로
서비스 wire에서 low가 사용됐다는 독립 증거는 아니다. 명시적 backend 제출과 성공 응답·기준값 조회 증거다.

### 검증기 결함과 남은 한계

초기 검증기는 agentMessage/reasoning 외 모든 item을 도구 사용으로 분류해 userMessage도 도구로 잘못 셌다.
로컬 schema의 ItemCompletedNotification에는 userMessage가 포함된다.
이 오류를 수정하고 userMessage 허용, 실제 도구와 미확인 타입 차단을 회귀 테스트로 고정했다.
후속 실행부터 itemTypes를 저장해 판단을 감사할 수 있게 했다.

기존 실제 실행에는 itemTypes를 저장하지 않았으므로 원래 usedTools=true를 false로 덮어쓰지 않는다.
실제 도구 사용 여부는 **미확정**이고, complete=false와 실패 기록을 그대로 보존했다.
검증기 수정 후 추가 유료 재실행은 하지 않았다. 실제 첫 턴은 완료됐지만 2턴 smoke 전체는 미완료다.
다음 턴의 실제 medium 요청, 도구 미사용, 독립 세션 대조군, 절감률은 검증하지 못했다.
이번 두 턴 계획은 같은 대화이므로 완료되더라도 절감률 비교로 사용하지 않는다.

## 검증 명령

- `node --test codex/tests/proxy.test.mjs`: 1/1 통과, 종료 0.
- `python3 scripts/probe-codex-start-proxy.py --adapter`: 수정 전 실패, 수정 후 5턴 통과, 종료 0.
- `node --test codex/tests/live-probe.test.mjs`: 2/2 통과, 종료 0.
- `npm test --prefix codex`: 23/23 통과, 종료 0. JSON·문서 링크·git diff --check 통과.

다음은 수정된 검증기로 실제 2턴 smoke를 완료한 뒤 독립 세션 사용량 비교를 진행하는 것이다.
Claude 실호출은 사용자 지정 토큰 한도로 계속 스킵한다.
