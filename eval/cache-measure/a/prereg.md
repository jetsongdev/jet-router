# ER-MEAS-20261029-005 실험 A 사전 등록

설계: `ops-plan/docs/planned/ops/plan-measure.md` §3. 이 문서는 준비 상태이며, 키 설정 알림 전 실험 실행은 금지다. `--live` 실행 승인과 키 준비 상태는 별도로 확인한다.

## 공통 조건

- `claude-opus-5-5`, A6 이외 thinking 생략, top-level `output_config.effort=medium`, `max_tokens=2048`, `stream=false`.
- 이름순 더미 도구 3개(목표 약 1.5K tokens), 고정 system 텍스트(목표 약 6K tokens), 마지막 system 블록에 5분 `cache_control`, 합성 대화 이력(목표 약 10K tokens), top-level 자동 캐싱. 첫 system 블록 앞에 시행별 nonce를 넣는다. 실제 크기는 실행 시 `--live --count`의 count_tokens로 확인한다.
- 모든 요청에 `cache-diagnosis-2026-04-07`; 최초 `diagnostics.previous_message_id=null`, 이후 직전 응답 ID. 요청은 응답 직후 이어 보낸다. 각 시행은 독립 nonce를 쓴다.
- S는 도구와 system의 토큰 수, M_k는 k번째 요청 직전 messages 토큰 수다. count_tokens는 짧은 고정 user 메시지를 포함한 전체와 도구·system을 뺀 동일 요청의 차이로 S를 구한다. 각 직전 요청의 전체 토큰을 S+M의 관측치로 쓴다. 토큰화 및 요청 구조의 비가산성은 측정 오차가 될 수 있으며 경계 결과는 별도 확인한다. count가 없으면 판정하지 않는다.

## 비교군과 반복

| arm | 턴1 | 턴2 | 턴3 | 턴4 | 반복 |
|---|---|---|---|---|---:|
| A0 | top medium | top medium | top medium | top medium | 5 |
| A1 | top medium | top medium | top high | top medium | 5 |
| A2 | top medium | top medium | user 직후 effort-only system high | 같은 방식 medium | 5 |
| A3 | A2와 동일 | | beta만 `per-turn-control-2026-07-01` | | 2 |
| A4 | top medium | user → tool_use → tool_result → effort-only system high → 같은 턴 후속 요청, 도구 호출 2회 | 새 user 입력 | 없음 | 3 |
| A5 | top medium | top medium | top 숫자 effort 한 번 | 없음 | 1 |
| A6a | top medium + 초기 system medium | 그대로 | top high + user 직후 effort-only system high | top medium + user 직후 effort-only system medium | 5 |
| A6b | A6a와 동일 | | beta만 per-turn-control + effort | | 2 |

A2와 A4는 `mid-conversation-output-config-2026-07-01` beta. A3의 400은 오류 본문을 기록하고 arm을 중단한다. A5 숫자는 B1에서 실제 형태를 확인한 뒤 `--a5-value`로 지정하며, 미지정이면 생략한다. A5 400은 오류 본문을 기록하고 중단한다. A4에 필요한 실제 tool_use가 없으면 중단한다.

A6은 첫 요청부터 `messages[0]` user 다음에 고정 텍스트와 medium `output_config`가 있는 system 메시지를 넣고 `thinking={"type":"adaptive","display":"updates"}`를 사용한다. A6a는 `mid-conversation-output-config-2026-07-01`, A6b는 `per-turn-control-2026-07-01,effort-2025-11-24`를 추가한다. A6에서 thinking을 포함한 요청이 400이면 원인을 확정하지 않고 오류 본문을 기록한 뒤 해당 arm에서 thinking을 생략해 한 번 재시도하고 이후에도 생략한다. A6b의 턴1에서 재시도 후에도 400이면 오류 본문을 기록하고 arm을 중단한다. 다른 400은 기존 오류 처리에 따른다.

## 판정

- A0의 턴2, 3, 4 각각에서 유지가 5회 중 4회 이상이어야 유효하다. 미달이면 실험을 무효로 두고 원인을 찾는다.
- 요청 k의 유지: `cache_read >= 0.95 × (S + M_{k-1})`.
- messages만 깨짐: `0.9 × S <= cache_read < 0.5 × (S + M_{k-1})` 그리고 `cache_creation >= 0.8 × M_{k-1}`.
- 전체 깨짐: `cache_read < 0.1 × S`. 나머지는 부분이며 diagnostics로 설명한다. 데이터나 토큰 수가 없으면 판정 불가다.
- 5회 중 4회 이상 같은 상태일 때 판정한다. A1 턴3에서 messages만 깨짐이면 문서 규칙 확인, 전체 깨짐이면 tools·system까지 깨짐이다. A1 턴4는 옛 medium 항목을 읽는 부분 상태가 예상되지만 실제 결과를 기록한다. A2 턴3·4가 유지면 메시지 방식 유지 확인. A3은 200과 유지면 해당 beta의 동일 동작을 관찰하되 2회만 수행한다. A6a는 A1·A2와 같은 4/5 기준을 적용하고, A6b는 2회 기술 관찰로 기록한다.
- A4는 캐시 상태와 턴2 후속 요청의 output_tokens를 A0 같은 위치와 비교한다. A0에는 같은 도구 루프 위치가 없으므로 직접 비교 불가하며, 출력 토큰만으로 적용 시점을 확정하지 않는다. 적용 지연은 문서 근거로 두고 실제 반영 시점은 B1에서 측정한다. A5 200은 A1 기준으로 관찰하고 400은 공개 API에서 숫자 effort 불가로 기록한다.

## 비용과 기록

계획 요청 수 A0~A2 60, A3 최대 8, A4 15, A5 3, A6a 20, A6b 최대 8: 최대 114회, A5 제외 111회. 이는 재시도와 count_tokens를 제외한 요청 수다. 상한 $8이며 `--cap-usd`는 더 낮게만 지정할 수 있다. 응답 usage의 입력 $4/M, 출력 $20/M, 읽기 $0.20/M, 5분 쓰기 $5/M, 1시간 쓰기 $8/M로 누적한다. TTL 미분류 쓰기는 보수적으로 $8/M. 다음 요청의 입력 UTF-8 바이트 수를 토큰 상한으로 보고 전부 1시간 쓰기 단가와 최대 출력 2048을 더해 누적 비용과 합산, 상한 초과 시 요청 전에 중단한다. 429/5xx는 최대 한 번 지수 대기 후 재시도하며 각 시도도 상한을 검사한다. 400은 A6의 thinking 생략 재시도 예외를 제외하고 재시도하지 않는다. count_tokens는 무료지만 네트워크 요청이므로 `--live --count`에서만 사용한다.

JSONL에는 arm, 시행, 턴, step, 시도, effort 위치·값, beta, 상태, usage 전체, diagnostics, request-id, UTC 응답 시각, 오류 본문, thinking 생략 재시도 여부, stop_reason, 토큰 수와 누적 비용을 남긴다. API 키는 live에만 필요하며 curl config 표준입력의 헤더로 전달한다. 건조 실행에서는 키를 읽지 않는다.

## 자체 검증 (네트워크 없음)

- `python3 -m py_compile eval/cache-measure/a/run_a.py eval/cache-measure/a/summarize_a.py`: 종료 코드 0.
- `python3 eval/cache-measure/a/run_a.py --dry-run`: 종료 코드 0, A5 미설정 111 requests, 예상 $5.066 (상한 $8 이하). 예상은 prefix 18K, 출력 300 tokens, 첫 요청과 A1 턴3 및 A6 턴3·4 쓰기, 나머지 읽기 가정의 단순 계획치이며 재시도와 실제 상한 계산은 포함하지 않는다.
- A2 턴3 본문의 최상위 키: `cache_control`, `diagnostics`, `max_tokens`, `messages`, `model`, `output_config`, `stream`, `system`, `tools`. system 블록은 각각 `text/type`, `cache_control/text/type`; 마지막 메시지 두 개는 user의 `content/role`과 system의 `content/output_config/role`.
- A6a 턴3 건조 본문: `output_config: {effort: high}`, `thinking: {type: adaptive, display: updates}`; `messages` 마지막 두 항목은 `{role: user, content: <입력>}`, `{role: system, content: [], output_config: {effort: high}}`. 첫 두 항목은 user와 `{role: system, content: [{type: text, text: <고정 텍스트>}], output_config: {effort: medium}}`.
- 실제 API, count_tokens, 모델의 도구 호출, 서버 캐시 판정 및 실제 비용은 미검증이다.

## 실행 순서 (팀장 지정, 2026-10-29)

상한에 먼저 닿더라도 핵심 질문이 먼저 답해지도록 A0 → A6a → A6b → A1 → A2 → A3 → A4 → A5 순서로 실행한다. 판정 기준은 바꾸지 않는다.
