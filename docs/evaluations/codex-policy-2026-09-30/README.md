# Codex 적용 정책 고정 표본 평가

2026-09-30. 기준 소스 `4396494e5b0ad8bce07ae5a126a7caa3c8d246b3`에서 맥락 질문만 변경했다.
**임계값을 낮추지 않고 독립된 맥락 질문을 명확히 해, 자기완결적 요청의 불필요한 보류를 줄였다.**
실제 Jev 21회(기존 10 + 후보 10 + 어댑터 1), 재시도 0, 실제 작업 모델 호출 0.

## 설계와 변경

[고정 코퍼스](../../../eval/codex-policy-cases.mjs)는 기존 smoke 사례 8개와 정확한 오타·limiter 요청 2개다.
기존/후보 호출 전에 각각 [baseline-plan](baseline-plan.json), [candidate-plan](candidate-plan.json)을 저장했다.
동일 입력과 기대값, medium/high/xhigh 기준값을 유지했다. 모든 대상 모델명은 gpt-6-astra다.
후보는 맥락 질문만 변경하고, effort/risk 질문·코퍼스·Codex 적용 경계 0.5는 유지했다.
맥락 충분도는 과제를 즉시 실행할 준비가 아니라 effort를 추정할 범위가 있는지를 묻는다.
이전 대화가 없다는 것과 그 대화가 필수라는 것을 구분하고, 필수 맥락 누락이면 no로 판정하도록 명시했다.

[공식 문서](https://docs.typesafe.ai/introduction)는 각 질문이 같은 state에 대해 독립적으로 평가된다고 설명한다.
[공식 SDK 타입](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts)의 Noul은 yes 확률이다.
effort 질문에만 있던 자기완결적 요청 안내를 contextSufficient 질문에도 넣어야 한다는 가설로 비교했다.
점수 0.5를 보정된 안전 경계라고 주장하지 않는다.

## 결과

| 사례 | 추천(v3/v4 동일) | 맥락 v3 → v4 | 적용 v3 → v4 |
| --- | --- | --- | --- |
| literal-typo | low | 0.41 → 0.88 | 유지 → low |
| format-en | low | 0.42 → 0.8 | 유지 → low |
| implementation | medium | 0.42 → 0.9 | 유지 → 유지 |
| known-fix | low | 0.4 → 0.84 | 유지 → low |
| production-risk | xhigh | 0.39 → 0.58 | 유지 → 유지 |
| risk-explanation | medium | 0.42 → 0.77 | 유지 → medium |
| missing-context | keep | 0.46 → 0.09 | 유지 → 유지 |
| classifier-injection | keep | 0.52 → 0.25 | 유지 → 유지 |
| long-context | keep | 0.46 → 0.12 | 유지 → 유지 |
| limiter | medium | 0.41 → 0.87 | 유지 → 유지 |

- 사전 정의한 적용 기대와의 일치: 기존 **6/10**, 후보 **9/10**.
- 추천 자체의 기대 일치: 양쪽 **9/10**. 추천 라벨은 10건 모두 동일했다.
- 변경 후보: 기존 0건, 후보 4건. 맥락 누락 2건은 양쪽 모두 keep/유지.
- limiter는 양쪽 모두 medium으로, 사전 기대 high/xhigh와 불일치했다. 별도 품질 조사 대상으로 남긴다.
- 운영 삭제 사례는 xhigh 기준에서 xhigh를 추천했다. 이 표본은 위험한 하향을 실제로 차단한 증거가 아니다.
- 같은 정제된 응답을 실제 Codex router에 주입해 정책 결과를 재생했다.
  Claude applicable 규칙을 모사한 choice-only 비교는 양쪽 9/10이며 Claude runtime 검증이 아니다.
  v4 표본에서 두 정책의 결과는 같지만, 모든 입력에서 동등하다는 뜻은 아니다.

[기존 관측](baseline.json), [후보 관측](candidate.json).

## 실제 Jev + 어댑터 검증

[어댑터 증거](adapter-evidence.json): 오타 요청에서 Jev low/context 0.89를 받고
로컬 가짜 Responses 서버의 **첫 요청 low**, 완료 후 thread 기본값 **medium**을 확인했다.
실제 App Server를 쓰되 프록시에 직접 turn/start를 보냈으며 실제 TUI 입력 검증과 구분한다.
임시 실행기 `python3 /tmp/jet-live-policy-check.py`는 기존 probe의 격리 구조와 실제 classifyJev를 사용하고
실제 Jev 1회 상한, 첫 요청 low 및 기본값 medium을 assert했다(종료 0).
임시 실행기 자체는 저장소에 포함하지 않았다. 따라서 아래 정책 평가 CLI와 이 통합 검증을 혼동하지 않는다.

## 재현과 검증

```sh
# 네트워크 없이 고정 사례/기대/요청 해시 확인
node scripts/evaluate-codex-policy.mjs --dry-run
# 명시적으로 실행할 때만 Jev 최대 10회, 키/원시 응답은 출력하지 않음
node --env-file=/absolute/private/.env scripts/evaluate-codex-policy.mjs --live
```

live CLI 종료 0은 전체 결과 수집 성공이며 정책/품질 승인 의미가 아니다.
첫 provider/응답 실패에 중단한다. 결과는 stdout JSON이며 파일 저장은 shell 리다이렉션으로 지정한다.
기존 baseline은 v3 요청이며 현재 코드로 위 명령을 실행하면 v4만 재현한다.
과거 관측을 재호출 없이 비교하는 테스트는 두 JSON의 응답을 replay한다.

- `npm test`: 134/134, 종료 0.
- `npm test --prefix mcp`: 29/29, 종료 0.
- `npm test --prefix codex`: 20/20, 종료 0.
- `python3 scripts/probe-codex-start-proxy.py --adapter`: 첫 시도 종료 1, 진단 기록 추가 후 재시도 종료 0.
  Codex 0.159.2에서 첫 시도는 프로토콜 4턴을 통과했지만 TUI thread/start가 backend-request-failed로 실패했다.
  재시도는 5턴 모두 통과했다. [시도별 결과](cli-attempts.json), [통과 요청 증거](cli-evidence.json).
  일시 실패 원인은 미확정이며 안정적인 CLI 호환성 증거로 일반화하지 않는다.
- 공통 계약 14개 고정 사례의 v4 요청 해시를 별도 보관했다. 이전 v3 및 연구 결과는 덮어쓰지 않았다.
- 기존 연구 테스트는 맥락 질문을 제외한 모든 요청 필드가 기존 검증 후보와 같음을 검사한다.
  변경한 질문을 포함한 전체 v4 요청은 신규 계약 기록과 live candidate 계획으로 고정한다.

## 결정과 제한

v4 맥락 질문을 채택하고 Codex의 context/risk 0.5 실험 경계는 유지한다.
Claude에도 공통 요청 변경은 전달되지만 Claude의 추천 적용 규칙은 바꾸지 않는다.
두 호스트의 정책 통합은 별도 평가가 필요하며, 이번 결과를 이유로 Claude에 새 경계를 추가하지 않는다.

10개 합성 사례를 순차적으로 1회씩 비교한 파일럿이다. 순서 효과·변동성을 분리하지 못했고
새 holdout이나 실제 과제 수행 평가가 없으므로 9/10을 일반 정확도로 해석하지 않는다.
별도 confidence/추천 확률은 정답 확률로 보정하지 않았다. 실제 청구액·토큰은 수집하지 않았다.
실제 반환 provider 모델 버전은 helper 출력에서 제공하지 않아 확인하지 못했다.

다음은 CLI 초기화 간헐 실패의 원인을 확인하고 실제 작업 모델의 첫 요청 effort·기본값 복귀·사용량을 소량 검증하는 단계다.
limiter 난도 과소 추천과 위험 경계 보정·다른 모델·새 표본은 후속이며 상시 enforce 운영 승인은 아니다.
Claude 실호출은 사용자 지정 토큰 한도로 스킵한다.
