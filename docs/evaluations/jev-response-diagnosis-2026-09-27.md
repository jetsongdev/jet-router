# Jev 응답 검증 개선 루프

## 재현 증거

native Codex countItems 사례의 invalid-response를 조사했다. 당시 원문이 없어 과거 오류와
이번 재현이 같은 원인임을 확정할 수는 없다.

같은 합성 입력을 helper 경로로 최대 15회까지 확인하도록 제한했고, 7번째 호출에서 실패해 중단했다.
1~6회는 medium 추천 성공. 7회는 `invalid-response/probability-sum`이었다.

```text
low=0.01, medium=0.80, high=0.02, xhigh=0, keep=0.16
sum=0.99, choice=medium, confidence=0.75
```

기존 검사는 합계와 1의 차이가 0.000001보다 크면 거부했다.
선택값/범위/최댓값은 정상이지만 합계가 기준을 벗어나는 간헐적 응답을 재현했다.
원문·키는 보존하지 않았으며 [정규화 숫자 증거](jev-response-diagnosis-2026-09-27.json)만 남겼다.

[공식 Choice 문서](https://docs.typesafe.ai/primitives/choice)는 합계 1과 최대 확률 선택을 설명한다.
소수 둘째 자리 반올림을 보장하지 않으므로 이 현상의 내부 원인이 반올림이라고 확정하지 않는다.

## 조치

- 응답 검사를 고정 진단 코드로 세분화했다. 키·원문·provider 임의 문자열은 진단에 포함하지 않는다.
- shadow 하네스 요청에 한해 모든 확률이 0.01 단위이고 합계 차이가 ±0.01 이내이면 허용한다.
  관측 근거에 따른 제한적 호환 정책이며, 공식 계약이 바뀌었다는 뜻이 아니다.
- 허용 시 helper 결과에 `warning: probability-sum-tolerance`를 남긴다. 추천값·점수는 보정하지 않는다.
  일반 사용자 안내는 간결한 기존 형식을 유지하며 경고는 helper 진단 결과에 있다.
- 범위 밖 후보, 누락/추가 확률 키, 범위 밖 점수, 잘못된 최댓값, 더 큰 합계 오차는 계속 거부한다.
- 기존 state 평가 경로와 기본 파서는 엄격 검사를 유지한다. 자동 재시도·fallback·effort 변경은 추가하지 않았다.

## 검증

관측한 0.99 분포를 회귀 테스트로 만들고 수정 전 실패/수정 후 통과를 확인했다.
1.01 허용, 0.98/1.02 거부, 세 자리 오차 거부, 잘못된 최댓값 거부도 검증했다.
오프라인 공통 71개, MCP 19개, Claude 훅 2개와 플러그인 manifest 검증이 통과했다.

Herdr의 오른쪽 pane `w10:p4`에서 새 Codex 0.157.1 세션 `jet-router-smoke-fix`를 시작했다.
같은 countItems 프롬프트에서 `Jev.shadow(): medium → medium` 표시를 확인했다.
Codex가 count-items.mjs와 count-items.test.mjs를 작성하고 `node --test count-items.test.mjs`를 직접 실행했다.
3개 통과·종료 코드 0 후 idle로 돌아왔다. 화면 설정은 medium이었다.
이 native 재검증 응답에 합계 보정 경고가 있었는지는 화면으로 확인하지 못한다.
재현 응답 처리의 직접 증거는 회귀 테스트이며, native 결과는 연결 회귀 확인이다.

향후 더 큰 편차가 나오면 고정 진단 코드와 함께 별도 검토한다. 허용 범위를 자동 확대하지 않는다.
