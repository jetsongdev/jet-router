# 실험적 Codex 어댑터 검증

2026-09-28, 기준 main `af09e67`, Codex CLI 0.158.0.

구현 파일: `codex/{proxy,coordinator,router}.mjs`. 별도 패키지이며 기존 MCP는 변경하지 않았다.
Jev 요청은 기존 `classifyJev` helper와 공통 harness/응답 검증기를 재사용한다.

| 검증 | 결과 |
| --- | --- |
| `npm test --prefix codex` | 15/15 통과, 종료 0 |
| `npm test` | 기존 133/133 통과, 종료 0 |
| `python3 scripts/probe-codex-start-proxy.py --adapter` | 실제 새 어댑터 경유 5턴·5요청 모두 완료, 종료 0 |
| 구문·문서 링크·JSON·`git diff --check` | 통과 |

[HTTP 캡처 요약](evidence.json): `low, medium, low, high, low`.
처음 4턴의 완료 후 사용자 기준값은 `medium, medium, high, high`.
마지막 턴은 실제 CLI `--remote` 입력이다. `routes`는 기존 Python probe의 내부 배열로,
새 Node 어댑터 모드에서는 비어 있으며 분류 미실행을 뜻하지 않는다.

Jev 분류는 테스트 함수로 주입했고 실제 모델은 로컬 가짜 Responses 서버다.
실제 유료 Jev/모델 요청, 품질·비용, TUI `/model` 메뉴, 프로세스 크래시 복구는 미검증이다.
실패·취소·복귀와 수동 변경의 경쟁은 단위 검사 결과로만 기록한다.

첫 통합 시도는 프로토콜 4턴 후 새 CLI 연결을 거절했다. 원인은 첫 클라이언트의 backend 종료 이후에도
점유 플래그를 해제하지 않던 어댑터였다. backend 종료를 기다리고 점유를 해제하도록 수정했다.
검증기도 이전 backend의 종료 신호를 기다린 후 CLI를 연결하도록 수정했다.
이후 새 어댑터 통합 검증 두 번에서 같은 5요청 결과를 확인했다.

[실행 및 제한](../../codex-proxy.md). 실패 차단 상태는 같은 프록시 프로세스에서만 유지한다.
강제 종료 이후에는 사용자가 실제 effort를 확인해야 하므로 상시 운영 준비 완료로 표시하지 않는다.
