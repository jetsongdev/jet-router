# 후속 작업

## 현재 마무리 상태

2026-09-28, `b579fa0` / plugin 0.11.1 기준으로 코드와 평가 기록을 대조했다.

- **Claude:** 실제 shadow 분류와 Opus 5.5 하향 비교 완료. enforce, 턴별 사용량,
  대조군·HTML 리포트, subagent 전파·별도 사용량 기록 구현 완료.
  제품 구현과 프로브의 적용 경로 증거는 구분한다. wire 요청 본문 직접 관측은 미완료다.
- **Codex:** shadow 입력창·연속 턴·취소 복구, 모델 지원 목록 조회와 합성 과제 비교 완료.
  별도 CLI 프록시에 Jev 계약·첫 요청 적용·기본값 복귀를 연결하고 로컬 통합 검사했다.
  실제 모델 검증·크래시 복구·대화 연속성 확대는 CODEX-001의 후속 범위다.
- **남은 품질 검증:** 실제 저장소 과제, 더 넓은 모델/기본 effort 조합, 주요 조합별 대조군·subagent 표본,
  Jev 비용과 실패 후 수정 비용을 포함한 순절감. 합성 파일럿의 통과를 일반 품질 보장으로 확대하지 않는다.

근거: [shadow 마무리](docs/evaluations/shadow-closeout-2026-09-27.md),
[Codex 비교](docs/evaluations/downshift-2026-09-28/README.md),
[Claude 비교](docs/evaluations/downshift-claude-2026-09-28/README.md),
[Claude 적용 경로](docs/evaluations/enforce-path-2026-09-28.md),
[subagent 경로](docs/evaluations/subagent-step-2026-09-28.md).

현재 환경에서는 Claude 토큰 한도로 추가 실호출 검증을 스킵한다(2026-09-28, 사용자 지정).
기존 평가 기록은 유지하며, 아래 Claude 표본 수집·실행 검증은 완료가 아닌 보류다.
한도 복구 후 재개하고, 그동안 실호출이 필요 없는 검증과 Codex 후속 작업을 진행할 수 있다.

## 권장 진행 순서

1. **Claude 실사용 측정(현재 환경에서 보류):** CLAUDE-ENFORCE-001의 주요 조합별 대조군을 각 10턴 이상 모으고,
   메인/subagent를 구분해 실측 비율과 표본 부족을 확인한다.
2. **평가 확대:** HARNESS-001에서 새로운 실제 저장소 과제·다른 모델/기본 effort를 비교한다.
   실패 후 수정 비용과 Jev 호출 비용을 포함해 순절감 여부를 검증한다.
3. **Codex enforce:** CODEX-001의 실제 host 상태 조회·적용·기본값 보존·동일 대화 검증을 진행한다.
   이미 완료한 shadow·공통 계약 작업을 다시 선행 작업으로 취급하지 않는다.

완료 표시는 각 항목의 증거 범위에 한정한다. 구현·mock·실제 분류·실제 생성·요청 wire 관측을 구분한다.

## CODEX-001 — 모델별 추천 범위·enforce 제한과 대화 연속성 검증

- 상태: 진행 중 — shadow 구현 완료, 별도 CLI enforce 실험 어댑터 구현·로컬 통합 검증. 실호출/장애 복구는 후속
- 출처: 사용자 요청 (2026-09-27)
- 범위: Codex의 모델별 shadow 추천 후보 구성과 향후 enforce 어댑터.
- 선행 조건: shadow 추천 범위는 HARNESS-001의 공통 입력·판정 계약에 연결 완료했다.
  enforce 활성화는 실제 Codex shadow hook 연결, HARNESS-001의 해당 조합 품질 기준 통과,
  CODEX-001의 실제 요청·대화 연속성 검증 완료 후 진행한다.
- 관련 문서: [작동 메커니즘](docs/architecture.md), [Codex MCP 가이드](docs/codex-mcp.md).

### 현재 확인한 내용

- 2026-09-28 / Codex 0.158.0: 턴 한정 `turn/settings/update` 실험적 계약을 확인했다.
  proxy의 WebSocket 전송 형식을 확인해 기존 세션 metadata 조회에 성공했다.
  격리 HTTP 캡처는 `applied` 이후에도 첫 요청 medium, 도구 후 low, 다음 턴 medium이었다.
  **hook 이후 변경으로 첫 요청까지 적용하는 요구는 충족하지 못했다.**
  후속 격리 프록시에서 기존 CLI `--remote` 연결·첫 요청 low·다음 턴 medium·수동 high 보존을 확인했다.
  [프록시 검증 결과](docs/evaluations/codex-start-proxy-2026-09-28/README.md).
  [실험적 CLI 어댑터](docs/codex-proxy.md)에 Jev 계약 연결과 기본값 복귀·실패 차단을 구현했다.
  취소/수동 변경/복귀 경쟁은 단위 검사, 정상 경로는 실제 CLI+가짜 provider로 검증했다.
  2026-09-30 실제 Jev 1회 연결에서 low 추천/contextScore 0.42를 받았지만 실험 경계 0.5로 보류됐다.
  첫 요청과 기본값은 medium이었다. [실호출 기록](docs/evaluations/codex-live-jev-2026-09-30/README.md).
  후속 고정 표본 10개 평가로 v4 맥락 질문을 개선했고, 실제 Jev + 가짜 모델에서 첫 요청 low/기본값 medium 복귀를 확인했다.
  [평가 결과](docs/evaluations/codex-policy-2026-09-30/README.md). 다음은 실제 모델 호출과 장애 복구 검증이다.
  [격리 재현 결과](docs/evaluations/codex-turn-effort-2026-09-28/README.md),
  [이전 조사](docs/evaluations/codex-enforce-path-2026-09-28.md). 기존 MCP는 shadow를 유지하고, 별도 프록시만 실험적 enforce를 제공한다.

- MCP shadow는 hook 모델명과 선택적 model/list 조회 결과로 후보를 검사한다.
  실제 effort는 미확인이고 사용자 지정 참고값으로 추천하며, effort를 변경하지 않는다. [검증 기록](docs/evaluations/shadow-closeout-2026-09-27.md).
- 공식 API 문서상 GPT-6 Astra는 low/medium/high/xhigh/max,
  GPT-6 Sol은 none/low/medium/high/xhigh/max를 지원한다.
  구현 시점에 다시 확인하고 Codex host가 실제 제공하는 값과 구분한다.
- Conversation state 문서는 이전 응답 연결 또는 대화 이력 전달을 설명한다.
  이 문서만으로 effort 변경 시 모든 내부 추론 상태의 동일한 보존이나
  jet-router에서의 실제 대화 연속성이 검증됐다고 판단하지 않는다.

### 작업 체크리스트

- [x] 별도 CLI 실험 어댑터의 정상 경로와 단위 실패 처리를 구현하고 검증한다.
  [실행/제한](docs/codex-proxy.md), [검증 기록](docs/evaluations/codex-adapter-2026-09-28/README.md).
  아래 실제 모델·전체 생명주기 완료 기준과 구분한다.

- [x] 고정 표본으로 Codex/Claude 적용 정책 차이를 비교하고, 맥락 질문만 개선해 첫 요청 적용을 재검증한다.
  [파일럿 10개 결과](docs/evaluations/codex-policy-2026-09-30/README.md): 적용 기대 6/10 → 9/10, 경계값 유지.
- [ ] Codex 0.159.2 TUI 초기화의 간헐 backend-request-failed를 조사한다. 프로토콜 4턴은 통과했고 TUI 재시도는 성공했으나 원인은 미확정이다.
- [ ] 새 표본·반복 관측으로 context/risk 경계를 보정한다. limiter의 medium 추천(기대 high/xhigh)을 조사한다.
  합성 파일럿을 일반 품질 보장이나 두 호스트 정책의 동등성으로 해석하지 않는다.
- [ ] 최초 enforce 대상 모델을 GPT-6 Astra / GPT-6 Sol로 제한하는 허용 정책을 확정한다.
  모델 alias·snapshot 식별 방법도 명시하며, 확인되지 않은 모델은 기존 effort를 유지한다.
- [ ] 활성 모델과 실제 effort를 실행 host에서 읽는 경로를 구현한다.
  shadow의 참고 effort를 실제 적용값으로 간주하지 않는다.
- [x] Codex `model/list` 등 host가 제공하는 지원 effort 목록을 조회해 추천값을 검사한다.
  모델 미확인·조회 실패·미지원 값이면 변경하지 않는다.
- [x] 라우터 후보와 모델 지원값을 구분한다.
  none/ultra는 후보에서 제외하고 max 참고값은 보호한다. 수동 설정을 덮어쓰지 않는다.
- [x] Jev 요청의 추천 선택지를 활성 모델별로 구성한다.
  추천 가능 범위는 `host가 확인한 모델 지원값 ∩ 라우터 정책이 허용한 값`으로 정하고,
  현재 effort 유지를 뜻하는 `keep`을 별도로 제공한다. `keep`은 모델 effort로 전달하지 않는다.
- [x] 모델별 선택지와 기준을 Jev 질문 및 응답 검증에 함께 반영한다.
  현재 고정 CHOICES를 모든 모델에 공통 적용하지 않으며, 확률 분포도 해당 요청에서
  제공한 선택지 집합을 기준으로 검사한다. 범위 밖 추천은 임의 보정하지 않고 보류한다.
- [x] shadow 안내에도 같은 추천 범위 검사를 적용한다. 모델이나 지원 목록을 확인하지 못하면
  지원 가능한 추천으로 간주하지 않는다. 현재 shadow v2는 불확실성을 남겨 실험 추천을 허용하며,
  향후 Codex enforce에서는 보류하는 정책이 필요하다. 기본 fake는 연결 테스트로 구분한다.
- [x] Codex shadow는 새 hook의 모델 변경을 관측하면 진행 중인 이전 추천을 폐기하고 후보를 다시 계산한다.
  [MCP shadow 테스트](mcp/tests/shadow.test.mjs)로 확인했다. 실제 host의 동일 턴 모델 변경·enforce 적용은 미검증이다.
- [x] shadow 후보 교집합·범위 밖 응답·모델 미확인·max 보호·판정 중 모델 변경의 오프라인 검사를 구현했다.
  [하네스 테스트](tests/harness.test.mjs), [MCP shadow 테스트](mcp/tests/shadow.test.mjs).
- [ ] Codex enforce 대상 Astra/Sol의 실제 지원 조합과 실패·수동 변경 회귀를 검증한다.
  현재 none/ultra 제외 정책을 유지한다. Sol의 none 포함은 현재 구현 요구사항이 아니며 별도 정책 결정이 필요하다.
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


## HARNESS-001 — Claude Code·Codex 공통 요청 검증 및 품질 평가 하네스

- 상태: 진행 중 — 공통 계약·shadow 검증 및 Codex/Claude 합성 품질 파일럿 완료. 실제 저장소·추가 모델·정량적 활성화 기준은 후속
- 출처: 사용자 요청 (2026-09-27)
- 목적: 클라이언트·모델이 달라도 동일한 품질 기준으로 추천을 평가하고,
  기준을 통과한 조합만 자동 적용한다. 모든 모델의 동일한 결과 품질을 보장한다는 뜻은 아니다.
- 선행 조건: 공통 계약·오프라인 평가셋은 구현 완료.
  실제 모델 비교에는 실행 가능한 host 어댑터/평가 실행기와 실호출 범위·비용 승인이 필요하다.
- 관련 작업: CODEX-001. 공통 로직은 이 작업, Codex 전용 기능 확인·상태 연결은 CODEX-001이 담당한다.

### 1단계 — 공통 계약과 요청 전 검사

[하네스 구현·검증 가이드](docs/harness.md). 아래 완료 표시는 코드 연결과 오프라인 검증 범위다.
실제 host·Jev 검증은 아래 개별 항목과 평가 기록을 근거로 판단한다.

- [x] Claude/Codex 어댑터 입력을 공통 형식으로 정규화한다.
  현재 프롬프트, 대상 모델 식별자, 지원 effort, 실제 effort 또는 참고 effort,
  세션·턴 연결, 맥락의 출처·누락 여부를 구분한다. 알 수 없는 값은 추정하지 않는다.
- [x] Jev 판정 모델과 실제 작업을 수행하는 대상 모델을 구분한다.
  요청 템플릿·판정 기준·정책 버전을 기록하고, 확인 가능한 Jev 모델 버전도 평가에 남긴다.
  확인하지 못한 버전은 unknown으로 기록한다.
- [x] 공통 코드가 허용된 입력과 모델별 선택지로 Jev 요청을 구성하도록 한다.
  메인 모델이 요청 형식·후보·동의 조건을 자유롭게 바꾸도록 맡기지 않는다.
- [x] 호출 전에 입력 크기·형식·모델/effort 지원 정보·맥락 누락·동의·연결 유효성을 검사한다.
  필수 정보가 부족하면 분류를 생략하거나 keep으로 보류하며 원래 작업은 계속한다.
- [x] 사용자 텍스트와 판정 지침을 분리한다. 모델이 작성한 요약은 출처가 있는 보조 정보로
  취급하고 확인된 host 상태로 승격하지 않는다. 전체 대화·파일 자동 전송은 범위 밖으로 둔다.

- [x] 두 shadow 어댑터를 공통 하네스와 요청별 응답 검사에 연결한다.
  Claude는 훅의 model/effort, Codex는 사용자 참고 effort를 사용한다.
  미확인 모델·지원 목록·맥락은 추정하지 않고 불확실성으로 전달한다. 이 항목은 shadow 계약 검증이며 Claude enforce 정책은 아래 별도 항목이다.
- [x] 새 기준 Jev 실호출 3건을 실제 MCP/STDIO 경로로 확인했다. [실행 기록](docs/evaluations/harness-v2-live-smoke-2026-09-27.md).
- [x] 새 Codex 0.157.1 입력창에서 오타 프롬프트의 훅 표시와 정상 응답을 Herdr로 확인했다.
- [x] 같은 Codex 세션의 연속 3턴을 확인했다. 추천 2건, invalid-response 1건이며 모두 작업이 계속됐다. 생성 코드 테스트 6/6 통과.
- [x] Codex 작업 중 취소 후 같은 세션의 다음 턴 정상 추천/응답과 확률 표시를 확인했다.
- [x] MCP 취소 신호 전달·제한 시간 정리·다음 턴 복구를 SDK와 Codex native fixture로 검증했다. 실제 Jev HTTP 중단 증거는 아니다.
- [x] Claude 실제 인터랙티브 shadow에서 Jev 분류를 확인했다.
  [Claude 비교 방법](docs/evaluations/downshift-claude-2026-09-28/README.md)의 설치 플러그인 0.3.2·6과제 분류 기록이 근거다.
  모든 설치 UI·모델 전환·취소 조합을 검증했다는 뜻은 아니다.

### 2단계 — 응답 검사와 오프라인 회귀 평가

- [x] Claude의 후속 turn.step에서 모델 변경이 관측되면 이전 추천을 폐기한다.
  완료된 추천·진행 중 판정의 폐기와 다음 턴 복구를 mock으로 검증했다.
  실사용 장애 보고나 실제 host의 동일 턴 모델 전환 확인은 아니며, Codex는 새 hook의 모델 변경 관측 시 이전 진행 중 결과를 폐기한다. native 전환은 미검증이다.

- [x] helper에서 공통 입력으로 요청을 구성하고, 전송한 후보 목록으로 응답 선택값과 확률 분포를 검사한다.
  기존 호출 방식 유지, 보류 입력의 우회 차단, 좁은 범위 밖 응답 거부를 오프라인 전송으로 검증했다.
  실제 모델 전환과 요청 wire 증거는 오프라인 검사와 구분한다.

- [x] 공통 요청/응답 검사를 Claude helper와 Codex MCP에서 재사용한다.
  모델/턴의 오래된 결과 처리는 각 어댑터의 오프라인 검증 범위다. Claude enforce와 Codex shadow의 적용 정책은 서로 다르다.
- [x] 동등한 host 정보는 같은 provider 요청을 만들고, 실제 effort·참고값·요약 출처는 구분함을 검증했다.
  [하네스 테스트](tests/harness.test.mjs)의 동등 입력·출처 보존 검사에 근거한다.
- [x] 오타/일반 구현/복잡한 진단/동시성/보안/파괴적 작업/설명 요청/맥락 없는 후속 지시/
  지침 덮어쓰기 시도/모델 변경/timeout 사례를 포함하는 버전 관리 평가셋을 만든다.
- [x] 예상 후보 범위·보류 조건·실패 조건을 평가 전에 정하고, 기준 조정용 사례와
  별도 검증용 사례를 분리한다. 기존 12건 smoke를 일반 정확도 증거로 재사용하지 않는다.
  [품질 파일럿 v1](docs/quality-evaluation.md): 새 사례 tune 6개/holdout 6개, 계획 해시와 오프라인 채점기 구현.
  기대값은 미검증 가설이다. 첫 12건 실호출은 tune 6/6, holdout 5/6 일치였다. 후속 실제 작업 평가는 아래 2026-09-27~28 기록을 참고한다.

### 3단계 — 실제 품질 비교와 enforce 활성화 기준

- [ ] Jev의 추천·맥락 충분성·위험 판정 기준을 평가한다.
  첫 [12건 파일럿 결과](docs/evaluations/quality-pilot-v1-live-2026-09-27.md)를 기록했다.
  단순 오타 keep을 [autoresearch 방식의 4회 비교](docs/evaluations/autoresearch-2026-09-27/README.md)로 조사했다.
  첫 지침을 채택한 뒤 추가 3회 개선 없음으로 중단했으며 새 holdout은 동률이었다. 후속 Codex 합성 작업 비교도 동률이며, 더 넓은 맥락·위험 평가는 미완료다.
  특히 어려운 작업의 과소 추천, 맥락 부족인데 추천하는 경우, 불필요한 보류를 측정한다.
  confidence/context/risk 점수를 검증 없이 확률이나 임계값으로 사용하지 않는다.
- [x] Codex GPT-6 Astra와 Claude Opus 5.5에서 기본 xhigh 대비 하향 추천을 각각 비교했다.
  두 파일럿 모두 생성 24회·양쪽 12/12 통과다. 위 비교 기록을 참고하며 모델 간 절대 성능 순위로 해석하지 않는다.
- [x] 해당 파일럿의 독립 검사 성공률·관측 회귀·토큰·캐시·지연·추정 비용과 한계를 기록했다.
- [x] 파일럿의 규모·반복·합격선을 사전에 고정했다. 각 비교 기록의 protocol.md가 근거다.
- [ ] 추가 모델·기본 effort·실제 저장소 작업에서 품질 저하, 과소 추천, 보류와 실패 후 수정 비용을 평가한다.
  Jev 비용까지 포함한 전체 요청 순절감은 아직 확인하지 않았다.
- [ ] 파일럿을 넘어선 enforce 품질 기준과 검증 조합 등록·변경 절차를 정한다.
  Claude enforce 구현 완료와 검증 모델만 허용하는 품질 gate의 완료를 혼동하지 않는다.
- [ ] 버전·지원 범위 변경 또는 품질 회귀 시 재평가하고 shadow/off로 되돌릴 절차를 마련한다.
  스킬에는 실행·해석 절차를, 코드와 hook에는 실제 검사·제한을 둔다.

### 완료 기준과 미결정 사항

공통 계약과 오프라인 회귀 검증을 두 어댑터가 통과하고, 실제 비교 결과를 기반으로
지원 조합·보류 조건·활성화 기준이 문서화되어야 한다. mock, Jev 실호출, 실제 작업 모델 실행의
증거를 구분한다. 이 작업 완료만으로 effort 변경/복귀가 검증되는 것은 아니며,
각 어댑터의 실행 경로 검증도 별도로 통과해야 한다.

미결정: 추가 맥락 수집의 범위·동의, 평가 확대 예산·합격 기준, 검증 조합의 관리 방식.
첫 Claude 실측 조합은 Claude Code 2.1.283 / Opus 5.5이며 다른 조합까지 검증된 것은 아니다.


## JEV-VALIDATION-001 — 실사용 invalid-response 원인 식별

- 상태: 이번 개선 루프 완료 — 합계 0.99 응답 재현·shadow 호환 처리·회귀 및 native 확인. 과거 실패 원문은 없어 동일 원인 확정은 불가.
- 기록: [진단과 조치](docs/evaluations/jev-response-diagnosis-2026-09-27.md)
- 근거: 하네스 v2의 native Codex 3턴 테스트 중 countItems에서 1회 발생.
  앞선 직접 MCP 호출에서는 같은 사례가 성공했으며, 실패 원문은 보존하지 않았다.
- [x] 비밀/프롬프트/응답 원문 없이 응답 검사 실패 지점을 고정 코드로 구분하는 진단 경로를 추가한다.
- [x] 각 실패 코드의 오프라인 fixture를 검증한 뒤, 범위를 정한 실호출에서 재현 여부를 확인한다.
- [x] 증거 없이 확률 합계 허용 오차나 응답 검사를 완화하지 않는다.
- [x] 요청별 추천 실패율과 이후 턴 복구를 별도 기록한다. 추천 실패가 있어도 작업 계속은 유지한다.

## 실제 작업 품질 루프 — 2026-09-27~28

- [x] 사전 고정 과제·독립 검사로 medium과 Jev 추천 effort를 실제 Codex 코드 생성에서 비교.
- [x] 단일 가설 변경안 3개를 실제 실행하고 연속 3회 개선 없음으로 종료. 제품 지침 추가 변경 없음.
- [x] 별도 최종 과제와 전체 48개 저장 코드 재검사, 토큰·지연·성공률 그래프 보존.
- 기록: [결과와 한계](docs/evaluations/task-quality-2026-09-27/README.md).
- [ ] 더 어려운 실제 저장소 과제와 호출 순서 무작위화로 평가 상한·실행 변동을 보완.
- [x] Claude Opus 5.5 후속 비교 완료 — 아래 Claude 비교 기록 참고.
- 추가 모델 비교와 일반 품질 gate는 HARNESS-001, Codex 적용/복귀는 CODEX-001에서 추적한다.
  Claude의 턴 적용·복귀 프로브 결과는 CLAUDE-ENFORCE-001의 근거와 구분해 읽는다.

## 하향 추천 비용 파일럿 — 2026-09-28

- [x] 실제 production Jev 추천을 고정한 뒤 xhigh 대비 하향 effort를 3회씩 짝지어 실행.
- [x] 24개 코드 독립 검사·재검사, 토큰·캐시·지연 비교와 공식 API/Codex 단가 추정 리포트 작성.
- 결과: [토큰·비용 리포트](docs/evaluations/downshift-2026-09-28/README.md). 양쪽 12/12 통과, 출력 47.9% 감소. 동일 캐시 비용 13.1% 감소는 Jev 비용 제외 가정값.
- 범위: 재사용 합성 4과제, gpt-6-astra, 기본 xhigh. 최소 필요 effort·전체 요청 순절감·enforce 품질 기준은 입증하지 않음.

## Claude 동일 과제 비교 준비 — 2026-09-28

- [x] [설치·비교 체크리스트](docs/claude-quality-checklist.md), smoke/full 설정, 무과금 plan, Jev route, 독립 CLI run, 오프라인 report 구현.
- [x] 환경변수 effort 우선순위, 모델별 후보 제한, 세션 분리, 캐시 읽기/쓰기, 실패 중단·부분 결과 검증을 mock으로 확인.
- [x] Claude Opus 5.5의 실제 비교와 저장 코드 재검사를 완료했다.
  [실측 기록](docs/evaluations/downshift-claude-2026-09-28/README.md)의 `compare-downshift-claude.mjs` 경로를 사용했다.
  기존 `claude-quality.mjs` smoke/full을 실행했다는 뜻은 아니다.
- [ ] 기존 `claude-quality.mjs`의 실제 smoke/full 호환성 및 설치 체크리스트의 나머지 UI 항목을 확인한다.
  위 별도 실측으로 이 실행기 자체의 live 검증을 대체하지 않는다.
- 이 비교 준비와 별개로 제품 enforce는 0.4.0에서 Claude에 구현했다([CLAUDE-ENFORCE-001](#claude-enforce-001--턴-단위-적용과-절감-모니터링)).

## CLAUDE-ENFORCE-001 — 턴 단위 적용과 절감 모니터링

- 상태: 구현 완료(0.4.0~0.11.1), 추가 실측은 현재 환경의 토큰 한도로 보류
- 근거: [적용 경로 확인](docs/evaluations/enforce-path-2026-09-28.md), [Claude 하향 비교](docs/evaluations/downshift-claude-2026-09-28/README.md)(출력 −47.3%, 회귀 0)
- [x] `/jet-router enforce`: 추천 effort를 해당 턴의 모든 요청에만 적용, 설정·기본값 불변
- [x] 하향·상향 적용(최대 xhigh), keep·같은 effort·생략·max·잠금 제외. subagent 전파는 아래 별도 항목
- [x] 턴 도중 `/effort` 변경 시 남은 요청 양보, off·잠금·모델 변경 시 즉시 중단
- [x] 턴별 로컬 사용량 기록(원문 없음, `usageLog`로 끄기)과 기간·프로젝트·조합별 리포트
- [x] 대조군(`holdoutRate` 기본 0.1)으로 조합별 실측 비율·95% 구간, 표본 부족 시 평가 비율
- [x] HTML 대시보드(필터·2단 배치)
- [x] 세션 시작 알림에 shadow·enforce 켜는 명령 표시
- [x] subagent 첫 단계에서 진행 중인 메인 턴에 연결해 적용값을 이어받음(0.10.0, 상향 포함).
  [subagent 경로 확인](docs/evaluations/subagent-step-2026-09-28.md): 부모 ID가 아닌 실행 순서로 연결한다.
  연결할 메인 턴이 없는 `/subtask`는 제외된다. 메인 진행 중 `/subtask`의 오연결 가능성과 중첩 subagent 실사용은 남은 한계다.
- [x] subagent 사용량을 메인 턴과 구분해 기록·리포트(0.11.0, `kind`, subagent끼리 실측 비율)
- [ ] subagent 대조군 표본 누적 후 subagent 조합별 실측 비율 확인
- [ ] 실제 작업에서 주요 조합(예: medium→low, xhigh→medium)의 대조군 표본 각 10턴 이상 확보
- [ ] 실측 비율이 평가 비율과 크게 다르거나 상향 조합의 순증가가 크면 적용 정책(상향 허용 범위 등) 재검토
- [ ] 충분히 측정된 뒤 `holdoutRate`를 낮추거나 0으로 끄는 기준 정리
- 범위 밖: Codex enforce, 세션 시작 기본값으로 enforce 두기, 금액 환산

