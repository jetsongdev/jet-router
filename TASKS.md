# 후속 작업

## CODEX-001 — 모델별 추천 범위·enforce 제한과 대화 연속성 검증

- 상태: TODO — 계획만 기록, 구현·실호출 검증 전
- 출처: 사용자 요청 (2026-09-27)
- 범위: Codex의 모델별 추천 후보 구성과 향후 enforce 어댑터. 이번에는 계획만 기록하며 현재 MCP shadow 코드는 변경하지 않는다.
- 선행 조건: 실제 Codex shadow hook 연결 확인 및 enforce 실행 경로 설계.
- 관련 문서: [작동 메커니즘](docs/architecture.md), [Codex MCP 가이드](docs/codex-mcp.md).

### 현재 확인한 내용

- 현재 MCP shadow에는 모델명 검사·모델 허용 목록·실제 지원 effort 조회가 없다.
  사용자 지정 참고 effort로 추천만 얻으며 실제 effort를 변경하지 않는다.
- 공식 API 문서상 GPT-6 Astra는 low/medium/high/xhigh/max,
  GPT-6 Sol은 none/low/medium/high/xhigh/max를 지원한다.
  구현 시점에 다시 확인하고 Codex host가 실제 제공하는 값과 구분한다.
- Conversation state 문서는 이전 응답 연결 또는 대화 이력 전달을 설명한다.
  이 문서만으로 effort 변경 시 모든 내부 추론 상태의 동일한 보존이나
  jet-router에서의 실제 대화 연속성이 검증됐다고 판단하지 않는다.

### 작업 체크리스트

- [ ] 최초 enforce 대상 모델을 GPT-6 Astra / GPT-6 Sol로 제한하는 허용 정책을 확정한다.
  모델 alias·snapshot 식별 방법도 명시하며, 확인되지 않은 모델은 기존 effort를 유지한다.
- [ ] 활성 모델과 실제 effort를 실행 host에서 읽는 경로를 구현한다.
  shadow의 참고 effort를 실제 적용값으로 간주하지 않는다.
- [ ] Codex `model/list` 등 host가 제공하는 지원 effort 목록을 조회해 추천값을 검사한다.
  모델 미확인·조회 실패·미지원 값이면 변경하지 않는다.
- [ ] 라우터 후보와 모델 지원값을 구분한다. 현재 후보에 없는 `none`의 지원 여부,
  `max` 보호, 수동 설정 우선순위는 명시적으로 결정한다.
- [ ] Jev 요청의 추천 선택지를 활성 모델별로 구성한다.
  추천 가능 범위는 `host가 확인한 모델 지원값 ∩ 라우터 정책이 허용한 값`으로 정하고,
  변경 보류를 뜻하는 `keep`을 별도로 제공한다. `keep`은 모델 effort로 전달하지 않는다.
- [ ] 모델별 선택지와 기준을 Jev 질문 및 응답 검증에 함께 반영한다.
  현재 고정 CHOICES를 모든 모델에 공통 적용하지 않으며, 확률 분포도 해당 요청에서
  제공한 선택지 집합을 기준으로 검사한다. 범위 밖 추천은 임의 보정하지 않고 보류한다.
- [ ] shadow 안내에도 같은 추천 범위 검사를 적용한다. 모델이나 지원 목록을 확인하지 못하면
  지원 가능한 추천으로 표시하지 않고 판정을 보류한다. 기본 fake는 연결 테스트로 구분한다.
- [ ] 모델 변경 시 후보 범위를 새로 계산하고, 이전 모델 기준으로 진행 중이던 판정은
  표시·적용 전에 현재 모델과 다시 대조해 오래된 추천을 폐기한다.
- [ ] 모델별 선택지 테스트를 추가한다. Astra에서 none 제외, Sol에서는 host 지원과 정책 허용이
  모두 확인될 때만 none 포함, max 보호, 빈 교집합, 범위 밖 응답, 판정 중 모델 변경을 검증한다.
- [ ] 같은 thread/대화 상태를 유지하면서 요청 effort만 바꾸는 실행 경로를 구현한다.
  MCP 추천 반환 자체로 effort가 변경된다고 가정하지 않는다.
- [ ] App Server `turn/start.effort`가 이후 턴에도 남는 점을 반영해 사용자 기본값을 보존한다.
  턴 종료·실패·취소·재개 및 사용자의 중간 수동 변경 후 다음 턴에 쓸 값을 검증한다.
- [ ] 두 모델 각각에서 medium → high → xhigh → 기본값 흐름을 검증한다.
  각 요청의 실제 model/effort와 동일 thread 연결을 확인하고, 앞 턴의 합성 정보 및
  도구 결과를 후속 턴에서 사용할 수 있는지 확인한다.
- [ ] 미허용 모델·미지원 effort·상태 조회 실패·수동 설정 변경의 회귀 테스트를 추가한다.
- [ ] 로컬/mock 결과와 승인된 실제 API/host 실험 결과를 분리해서 기록한다.
  UI 메시지만으로 실제 effort 변경 또는 대화 연속성 성공을 선언하지 않는다.
- [ ] 검증을 통과한 모델·host 버전·effort 조합과 남은 제한을 사용 문서에 반영한다.

### 완료 기준

Jev에 제공하는 후보와 사용자에게 표시하는 유효 추천은 활성 모델의 지원값 및 라우터 정책 범위 안에 있어야 한다.
미검증 모델과 미지원 effort에서는 추천을 보류하고 기존 설정을 유지한다. 검증한 모델에서는 동일 대화를
이어가면서 선택한 effort가 실제 요청에 반영되고, 다음 턴은 사용자 기본값과 수동 변경을
올바르게 반영한다. 테스트와 실제 요청 증거가 모두 기록되어야 enforce 지원으로 표시한다.
이 기준은 모델의 모든 내부 추론 상태가 동일하게 보존된다는 보장을 뜻하지 않는다.

### 공식 문서

- [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
