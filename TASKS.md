# 후속 작업

## CODEX-001 — 모델별 enforce 제한과 effort 변경 시 대화 연속성 검증

- 상태: TODO — 계획만 기록, 구현·실호출 검증 전
- 출처: 사용자 요청 (2026-09-27)
- 범위: Codex의 향후 enforce 어댑터. 현재 MCP shadow의 동작 변경은 포함하지 않는다.
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

미검증 모델과 미지원 effort에서는 기존 설정을 유지한다. 검증한 모델에서는 동일 대화를
이어가면서 선택한 effort가 실제 요청에 반영되고, 다음 턴은 사용자 기본값과 수동 변경을
올바르게 반영한다. 테스트와 실제 요청 증거가 모두 기록되어야 enforce 지원으로 표시한다.
이 기준은 모델의 모든 내부 추론 상태가 동일하게 보존된다는 보장을 뜻하지 않는다.

### 공식 문서

- [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
