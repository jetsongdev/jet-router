# Jev 품질 파일럿 v1 실호출 — 2026-09-27

고정된 [사전 계획](quality-pilot-v1-plan.json)의 합성 입력 12건을 순차 1회 실행했다.
자동 재시도 0회, 호출 실패 0건, 총 12건 완료. 모델 요청값은 jev-latest이며
정확한 반환 모델 버전·실제 토큰·청구액은 확인하지 않았다.

| 구분 | 기대 범위 일치 | 호출 실패 | keep | 필수 keep 누락 | 평균 지연 |
| --- | --- | --- | --- | --- | --- |
| tune | 6/6 | 0 | 1 | 0 | 277.7ms |
| holdout | 5/6 | 0 | 4 | 0 | 274.8ms |

지연은 로컬 helper 프로세스를 포함한 벽시계 시간이다. 전체 범위는 232–365ms였다.

## 불일치와 해석

`holdout-format`: `const label = "Confrim";`의 명시적 오타 수정에 low를 기대했으나 keep을 반환했다.
선택 확률 0.54, 별도 confidence 0.42, contextScore 0.43, riskScore 0.06이었다.
맥락이 낮다고 평가한 것으로 보이는 수치는 있으나, 그 수치가 keep 선택의 원인이라는
인과 증거나 설명은 없다. 실제 작업 실패나 낮은 effort의 성공을 측정한 결과도 아니다.

기준·가설·프롬프트는 결과에 맞춰 수정하지 않았다. 이 holdout으로 기준을 조정한다면
새로운 독립 검증 세트가 필요하다. 후속 후보는 단순하고 완결된 편집 요청에서 불필요한
keep이 반복되는지, 표현 차이와 반복 변동을 새 조정 세트로 분리해 조사하는 것이다.

11/12는 **미검증 사전 가설과의 일치 수**다. 추천 정확도 91.7% 또는 enforce 합격을 뜻하지 않는다.
특히 보안·동시성 사례는 high/xhigh/keep 등 넓은 허용 범위이므로 일치만으로 품질을 보장할 수 없다.
작업 코드 실행, 기본 effort 대비 성공률·비용 비교, Claude 실사용은 이번 범위에 없다.

## 실행·검증

- `node --test tests/quality-run.test.mjs`: 3개 통과, 종료 코드 0.
  실제 전송 입력의 하네스 요청 해시, 순차 실행, 첫 실패 중단, 키 누락 차단을 검사했다.
- `node scripts/run-quality.mjs --live --key-file <지정된 프로젝트 .env>`: 종료 코드 0.
  키는 출력·인자 값·결과 파일에 포함하지 않았다. 고정 helper의 HTTPS·시간 제한을 재사용했다.
- `node scripts/evaluate-quality.mjs --score <실호출 결과 JSON>`: 종료 코드 0.
- `npm test`: 81개 통과, 종료 코드 0.

[정규화된 실호출 결과](quality-pilot-v1-live-2026-09-27.json),
[채점 결과](quality-pilot-v1-score-2026-09-27.json).
채점 결과의 evidenceVerified=false는 채점기 자체가 출처를 인증하지 않는다는 의미다.
실호출 여부는 이 실행 기록과 구분해 판단한다. enforceApproved는 계속 false다.
