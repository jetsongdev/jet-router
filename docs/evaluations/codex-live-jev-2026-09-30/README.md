# Codex 어댑터의 실제 Jev 연결 검증

2026-09-30, 소스 `de912fe4b9b3479cda2f06df06f674516a279221`.

**실제 Jev 연결은 성공했지만 추천 effort 적용은 보류됐다.**
실제 Jev 1회, 실제 Codex App Server와 로컬 가짜 Responses 서버를 사용했다.
실제 모델 서비스 호출은 0회다. CLI TUI 입력을 통한 검증이 아니라 프록시에 직접 보낸 `turn/start` 검증이다.

## 입력과 결과

기준 모델은 `gpt-6-astra`, effort는 `medium`. 자기완결적인 문자열 오타 수정 요청을 보냈다.

```text
아래 함수의 문자열 Helllo만 Hello로 고쳐줘. 다른 것은 변경하지 말고 코드만 출력해줘. 파일과 도구는 사용하지 마.
function greeting(name) { return `Helllo, ${name}!`; }
```

[비밀정보를 제외한 증거](evidence.json):

| 항목 | 관측 |
| --- | --- |
| Jev 추천 | low |
| selectedProbability / confidence | 0.99 / 0.98 |
| contextScore / riskScore | 0.42 / 0.02 |
| 가짜 모델 서버에 도달한 첫 요청 | medium, 1회 |
| 턴 완료 후 thread 기본값 | medium |

확률·confidence는 추천 정확도나 품질 보장률로 해석하지 않는다.

## 적용이 보류된 이유

`codex/router.mjs`는 contextScore가 0.5 이상이어야 추천을 적용한다.
이번 응답 0.42는 이 조건을 충족하지 못해 `src/policy.js`의 context 유지 경로를 탔다.
`src/providers/jev-contract.js`는 이 필드를 `contextSufficient.noul`에서 읽는다.
따라서 점수 방향을 뒤집은 오류는 아니다. 공통 계약도 수치를 보정된 정책 임계값으로 보지 않는다.

Claude의 현재 Jev enforce 경로는 이 수치 경계를 사용하지 않는다.
이는 호스트 간 적용 정책 차이이며, 이번 단일 표본으로 어느 정책의 품질이 더 좋은지 판단할 수 없다.
공통 하네스의 effort 질문에는 자기완결적 요청 안내가 있으나 contextSufficient 질문은 별개다.
질문 간 해석 차이는 조사 후보이며 이번 관측만으로 원인으로 확정하지 않는다.

## 실행과 재현 범위

기존 `scripts/probe-codex-start-proxy.py --adapter`의 격리 backend/HTTP 캡처 구조를 이용한
임시 실행기 `python3 /tmp/jet-live-stage1.py`로 실행했다(종료 0).
실제 `classifyJev`를 주입하고 호출 상한을 1회로 제한했다. Node env-file로 키를 전달했으며
전역 설정이나 설치된 플러그인은 변경하지 않았다. 종료 0은 수집 성공이며 추천 적용 성공을 뜻하지 않는다.
임시 실행기는 저장소에 포함하지 않았으므로 이 문서를 유료 실험 자동 재현 명령으로 취급하지 않는다.

관측한 응답은 저장된 evidence를 사용하는 `codex/tests/router.test.mjs`에서 오프라인 재생한다.
현재 정책이 같은 응답에 대해 추천을 보류하는지 검증하며, Jev 재호출이나 실제 모델 검증은 아니다.

## 다음 단계

1. 자기완결적 요청과 맥락 누락 요청을 구분하는 고정 평가 표본으로 적용 정책을 정한다.
   이번 성공을 만들기 위해 0.5를 낮추거나 점수를 무시하지 않는다.
2. 정책 확정 후 실제 Jev 추천이 첫 요청에 적용되는지 다시 확인한다.
3. 그 경로가 통과하면 실제 모델의 effort 적용·기본값 복귀·사용량 비교를 진행한다.

이번 실행에서는 2·3단계를 보류했다. 비용 절감, 실제 모델 품질, 변경 후 복귀는 증명하지 않았다.
medium이 변경되지 않았으므로 이번 기본값 관측은 복귀 성공 증거가 아니다.
