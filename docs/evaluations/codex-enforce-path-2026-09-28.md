# Codex enforce 적용 경로 조사 — 2026-09-28

후속: [WebSocket 연결 해결과 첫 요청 적용 제한 재현](codex-turn-effort-2026-09-28/README.md).
아래는 후속 검증 전의 조사 기록이다.

## 판정

기존 입력창의 `UserPromptSubmit → jet-router MCP` 경로에서 자동 적용하는 기능은
아직 구현에 착수할 근거가 부족하다. 0.158.0에 턴 한정 설정 API가 존재하지만,
실행 중인 세션을 소유한 서버에 hook/MCP가 연결하는 경로와 첫 요청 전 적용 시점은 미검증이다.
별도 App Server 클라이언트를 최종 구조로 확정하지도 않는다.

- 기준 소스: `12faf18`, jet-router 0.11.1.
- 설치 CLI와 실행 중 daemon: 모두 `0.158.0`.
- 실제 모델/Jev 호출 0회. 실제 사용자 턴 설정 변경 0회. Claude 실호출은 사용자 지정으로 스킵.
- 아래 프로토콜 검사는 제품 enforce 및 wire 요청 검증이 아니다.

## 확인한 계약

[공식 Hooks 문서](https://learn.chatgpt.com/docs/hooks)의 UserPromptSubmit 출력은
안내·추가 컨텍스트·차단을 지원하지만 effort 변경 필드는 문서화하지 않는다.
현재 `mcp/server.mjs`도 `continue`와 `systemMessage`만 반환한다.

[공식 App Server 문서](https://learn.chatgpt.com/docs/app-server)의 `turn/start.effort`는
다음 턴의 기본값에도 영향을 준다. 따라서 해당 경로를 쓴다면 기본값 보존 처리가 필요하다.

반면 **설치 바이너리에서 생성한 실험적 스키마**에는 다음 계약이 있다.
공식 가이드 본문에 없는 실험적 API이므로 버전별 가용성을 확인해야 한다.

| 인터페이스 | 설치 스키마에서 확인한 내용 | 제한 |
| --- | --- | --- |
| `turn/settings/update` | `threadId`, `turnId`, `effort`; 현재 실행 턴에 한정, 이후 턴 설정은 유지 | 자식 세션과 이미 고정된 초기 설정의 소비자는 변경되지 않음 |
| 응답 | `applied` 또는 `targetUnavailable` | 응답만으로 실제 모델 요청 반영을 증명하지 못함 |
| `thread/read` | `model`, `reasoningEffort` | 로드됐으면 현재 설정, 아니면 마지막 저장값. 턴 실행 telemetry가 아님 |
| `thread/settings/update` | 이후 턴 설정 변경 | 턴 한정 API의 대체 수단으로 사용하면 기본값을 바꿀 수 있음 |

스키마 생성 명령(종료 코드 0):

```sh
codex app-server generate-ts --experimental --out /tmp/jet-router-codex-0158-protocol
```

확인 파일: `v2/TurnSettingsUpdateParams.ts`, `v2/TurnSettingsUpdateResponse.ts`,
`v2/TurnSettingsUpdateStatus.ts`, `v2/Thread.ts`, `v2/ThreadSettingsUpdateParams.ts`.

## 비생성 프로토콜 검사

JSON-RPC 초기화 시 `capabilities.experimentalApi: true`를 전달하고
`initialized` 후 요청했다. stdout에서 요청 ID에 대응하는 응답만 수집했고,
대화 본문·계정 키·프롬프트를 기록하지 않았다.

| 검사 | 결과 | 종료 코드 |
| --- | --- | --- |
| `codex app-server daemon version` | 설치 CLI/daemon 모두 0.158.0 | 0 |
| `codex app-server proxy` 초기화 | 10초 동안 초기 응답 없음, 종료. 오류 출력 추가 후에도 같은 결과 | 각 1 |
| 독립 `codex app-server --stdio` 초기화 | 정상 응답 | 0 |
| 독립 서버의 대상 `thread/read` (`includeTurns: false`) | `gpt-6-astra`, `medium`, `status: notLoaded` | 같은 검사 프로세스 0 |
| 존재하지 않는 thread/turn에 `turn/settings/update` | JSON-RPC -32600, `thread not found` | 같은 검사 프로세스 0 |

마지막 검사는 thread/turn ID에 `00000000-0000-4000-8000-000000000000`을 사용했다.
메서드가 인식되고 대상 검사까지 진행됨을 확인했을 뿐, 유효한 턴에서 `applied`를 관측한 것은 아니다.
`thread/start`, `thread/resume`, `turn/start`는 호출하지 않았다.

proxy 시간 초과는 관측 결과이며 원인은 미확정이다. 지원 불가의 증거로 일반화하지 않는다.
독립 서버를 하나 더 띄우는 것만으로 기존 세션의 현재 턴을 제어할 수 있다고 가정하지 않는다.

## 다음 검증 순서

1. 세션을 소유한 서버의 지원 연결 방식과 proxy 프로토콜을 확인한다.
   hook의 session/turn ID가 그 서버의 thread/turn과 일치하는지 확인한다.
2. 격리한 테스트 세션에서 hook 대기 중 API 호출이 처리되는지 확인한다.
   응답 지연·교착·이미 종료된 턴이면 적용하지 않는다.
3. 첫 모델 요청 이전에 반영되는지 실제 요청 증거로 확인한다.
   이미 전송된 첫 요청은 바꿀 수 없으므로 이후 요청만 바뀐다면 별도 제한으로 표시한다.
4. medium → 추천값 → 다음 턴 medium, 취소·오류·수동 변경·모델 전환을 검증한다.
   자식 세션 전파는 별도 범위다. 설정 조회값과 실제 적용 증거를 구분한다.
5. 위 경로가 통과하면 기존 MCP와 연결하는 최소 어댑터를 구현한다.
   통과하지 못하면 별도 App Server 클라이언트 방식을 비교하고 사용자 흐름 변경을 명시한다.

현재 단계에서는 enforce를 켜거나 config·hook 신뢰·실행 중 MCP를 변경하지 않았다.

## 설치본 동기화

사용자가 지정한 세션은 `~/.codex/tools/jet-router/mcp/server.mjs`를 사용하는 전역 MCP 설정을 참조한다.
이 경로는 세션 전용 설치가 아니므로 갱신 시 이를 참조하는 다른 세션도 영향을 받을 수 있다.
앞으로 원격에 반영된 변경은 설치본의 깨끗한 상태를 확인하고 fast-forward로 동기화한다.
실행 중 MCP 재로드 성공은 파일 동기화와 별개로 확인하며, 서버 전체를 임의 재시작하지 않는다.
