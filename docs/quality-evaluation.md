# 추천 품질 파일럿 v1

평가 설계·오프라인 채점기와 실호출 실행기를 구현했다. [첫 12건 실호출 결과](evaluations/quality-pilot-v1-live-2026-09-27.md)는 tune 6/6, holdout 5/6 기대 범위 일치였다. 작업 모델 비교는 하지 않았다.
기존 계약 fixture 14개와 smoke 12개를 추천 정확도 평가로 재사용하지 않는다.

## 고정한 입력과 가설

[평가셋](../eval/quality-cases.mjs)은 새 합성 프롬프트 12개다. tune 6개는 기준 조정용,
holdout 6개는 조정 후 확인용이다. holdout 결과를 보고 정책을 바꾸면 그 세트는 더 이상
독립 검증용이 아니므로 새 버전·새 사례를 준비한다. 공개된 소규모 세트이므로 통계적 일반화나
학습 데이터 오염 방지를 보장하지 않는다.

각 사례의 accepted는 사람이 검토할 **사전 가설**이다. 최적 effort의 실증 정답이 아니다.
맥락·위험 점수는 원래 값으로 기록하며 검증되지 않은 임계값으로 정답 여부를 정하지 않는다.
맥락 없는 지시, 삭제 조건 미정, 알 수 없는 이전 추천 재사용은 keep을 기대한다.
코드의 실제 성공 여부는 향후 작업 모델 실행과 독립 테스트로 별도 평가해야 한다.

모든 입력은 동일한 medium 참고값, 모델/지원 목록 unknown, prompt-only로 고정했다.
따라서 특정 모델에 적절한 effort가 검증된다는 뜻은 아니다. 모델별 비교에는 host 사실과
프롬프트를 고정한 새로운 실행 계획이 필요하다. missingRequired는 평가자가 지정한 정보다.
현재 native hook이 이를 자동 추론하거나 동등하게 수집한다고 가정하지 않는다.

## 실행 전 계획

```sh
node scripts/evaluate-quality.mjs --dry-run
```

[고정 계획](evaluations/quality-pilot-v1-plan.json)에 corpus 해시, 요청별 해시, 후보와 기대 범위를
기록했다. 요청 해시는 공통 하네스가 실제 구성한 본문을 대상으로 한다. 평가 입력이나 정책이
바뀌면 해시가 바뀌며 과거 결과와 혼합할 수 없다. 이 명령은 키를 읽거나 네트워크를 호출하지 않는다.

다음 실호출 단계의 제안 한도는 **12건, 순차 1회, 자동 재시도 0회**다. 전송·스키마·timeout
실패가 발생하면 중단해 원인을 기록한다. 중단된 일부 결과를 전체 평가 성공으로 집계하지 않는다.
금액은 아직 측정하지 않았다. 승인된 첫 실행은 12건 모두 완료했으며 재실행은 별도 실행 범위를 정한다.

## 결과 입력과 채점

```sh
node scripts/evaluate-quality.mjs --score /absolute/path/to/results.json
```

입력은 최대 64KiB JSON이며, 계획의 12개 id를 각각 한 번 포함해야 한다.
각 결과의 requestSha256은 해당 요청의 계획 해시와 일치해야 한다.

```json
{
  "corpusSha256": "계획의 corpusSha256",
  "evidence": "fixture",
  "results": [{
    "id": "tune-typo",
    "requestSha256": "해당 요청의 requestSha256",
    "latencyMs": 250,
    "result": {
      "ok": true,
      "decision": {
        "provider": "jev", "choice": "low",
        "confidence": 0.8, "contextScore": 0.9, "riskScore": 0.1
      }
    }
  }]
}
```

위 예시는 형식 설명용이며 1건뿐이므로 그대로는 채점되지 않는다.
실패 결과는 `result: {"ok": false, "reason": "timeout"}` 형태다.
`evidence`는 fixture 또는 live-jev이며 사용자가 선언한 출처다. 채점기가 실호출을 인증하지
않으므로 항상 evidenceVerified=false다. 실제 실행 기록과 함께 판단한다.

두 split의 기대 범위 일치 수, 호출 실패 수, keep 수, 필수 keep 누락 수와 평균 지연을 분리한다.
프로세스 종료 코드 0은 유효한 입력의 집계 성공이며 **품질 합격이 아니다**. 불일치나 실패가 있어도
집계는 가능하다. 부분 결과·중복·해시 불일치는 종료 코드 1로 거부한다.

모든 출력은 enforceApproved=false다. 이 파일럿은 기준 개선용이며 배포 합격선이 아니다.
향후 기본 effort 대비 작업 성공률·회귀·비용 비교의 허용 범위는 실행 전에 별도로 확정해야 한다.


## 실호출 실행기

```sh
node scripts/run-quality.mjs --live --key-file /absolute/path/to/.env > results.json
# 또는 환경변수 이름만 지정
node scripts/run-quality.mjs --live --key-env TYPESAFE_API_KEY > results.json
```

키 파일에서는 TYPESAFE_API_KEY만 파싱하며 shell로 실행하지 않는다. 순차 최대 12건,
재시도 없이 첫 실패에서 중단한다. 제품과 동일한 routingInput/helper 경로를 사용한다.
모든 결과에는 실제 호출에 대응하는 계획 해시와 정규화된 점수만 저장한다.
중단 시 결과 파일을 보존하고 종료 코드 1을 반환한다. 부분 결과는 전체 채점기에 넣지 않는다.


## 후속 지침 연구

[autoresearch 방식 실험](evaluations/autoresearch-2026-09-27/README.md)에서 지침 v3를 채택했다.
기존 12건은 연구 단계부터 모두 개발용이며 더 이상 독립 holdout으로 취급하지 않는다.
새 8사례의 최종 비교는 원본·채택안 모두 24/24였다.

이전 평가의 요청 계획은 [v3 기준 계획](evaluations/quality-pilot-v1-provenance-v3-plan.json)이다.
기존 v1 계획과 실호출/채점 JSON은 v2 지침의 역사적 기록으로 보존한다. 현재 채점기는
요청 해시가 바뀐 과거 결과를 거부하므로, 과거 결과 재채점은 당시 코드 90135b3을 사용한다.
