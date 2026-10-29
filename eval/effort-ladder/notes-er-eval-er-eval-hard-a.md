# er-eval-hard-a 3차 재설계

검사 번호는 각 `hidden/checks.mjs`의 `checks` 배열에서 0부터 센다. 근거 경로는 각 과제 디렉터리 안의 `fixture/` 기준이다. 입력과 예시는 모두 합성 데이터다. 문서 요구사항은 모델이 받은 저장소에서 확인할 수 있다.

| 과제 | fixture 파일 | 소스 줄 | prompt 단어 | 숨긴 검사 | solution 줄 |
|---|---:|---:|---:|---:|---:|
| symptom-invoice-drift | 16 | 61 | 210 | 16 | 39 |
| symptom-sync-dup | 16 | 53 | 213 | 18 | 41 |
| perf-route-planner | 9 | 38 | 225 | 17 | 43 |
| perf-window-stats | 9 | 38 | 226 | 17 | 91 |

줄 수는 fixture는 공개 테스트를 포함한 `.mjs` 물리적 줄 수이며 solution은 실제 solution 파일의 물리적 줄 수다. 네 meta의 maxTurns는 36, hiddenTimeoutMs는 180000이고 budgetUsd는 low 1.5, medium 1.5, high 2, xhigh 3이다. 성능 과제는 공개 테스트와 별개로 200,000건을 생성해 함수 실행시간 1초 미만을 검사한다. 느린 fixture의 성능 검사는 자식 프로세스에서 1.8초로 중단한다.

## symptom-invoice-drift

청구 금액의 부동소수 반올림과 잔여 할인 배분의 입력 순서 의존이 결합한다. 전용 상호작용 테스트에서 fixture 총액과 완전 수정 총액은 모두 539센트이지만 반올림만 고치면 540센트가 된다. m1은 최종 합계를 반올림하고 정렬·배분을 고치지만 부정확한 줄별 반올림을 남기며, m2는 정확한 계산을 사용하고 동률 분배를 입력 순서에 맡긴다. m3은 출력 정렬을 놓친다.

| 검사 | 근거와 확인 조건 |
|---:|---|
| 0 | README.md: 빈 항목과 반환 형태, 합계 |
| 1 | README.md: 정확히 반 센트인 gross는 올림 |
| 2 | README.md: 반 센트 미만 gross는 내림 |
| 3 | README.md: 수량 곱을 반올림 전에 정확히 계산 |
| 4 | README.md: 중간 곱은 안전 정수 범위를 넘을 수 있음 |
| 5 | README.md: 세금의 정확한 반 센트 올림 |
| 6 | README.md: 다른 세율에서 세금 반 센트 올림 |
| 7 | README.md: 할인 후 세금, line과 invoice 합계 |
| 8 | docs/allocation.md: 동률 잔여 센트는 ID 순 |
| 9 | docs/allocation.md: 큰 나머지에 잔여 센트 배분 |
| 10 | docs/allocation.md: gross가 0인 줄의 배분 |
| 11 | docs/allocation.md: gross와 할인이 모두 0 |
| 12 | docs/allocation.md: 출력 줄의 ID 순서 |
| 13 | docs/allocation.md: 입력 순서와 다른 세율에도 결정적 결과 |
| 14 | README.md: 입력 불변 |
| 15 | README.md 및 docs/allocation.md: 비례 배분과 줄별 세금을 합산 |

## symptom-sync-dup

동률 우선순위, 재시도 키 확인 누락, 만료된 tombstone의 fence 삭제가 각각 재연결 결과를 바꾼다. m1은 만료 후 fence를 버리고, m2는 재시도 키를 확인하지 않으며, m3은 같은 버전의 삭제 우선순위를 뒤집는다.

| 검사 | 근거와 확인 조건 |
|---:|---|
| 0 | README.md: 빈 초기 상태 및 출력 형태 |
| 1 | README.md: 새 live 레코드 |
| 2 | README.md: 더 큰 timestamp 승리 |
| 3 | README.md: 오래된 timestamp가 최신 레코드를 덮지 않음 |
| 4 | README.md: 같은 시간에서 큰 actor 승리, 역순 도착 |
| 5 | README.md: 같은 시간에서 큰 actor 승리, 정순 도착 |
| 6 | README.md: 같은 시간과 actor에서 삭제 승리, 삭제 먼저 |
| 7 | README.md: 같은 시간과 actor에서 삭제 승리, 삭제 나중 |
| 8 | README.md: 같은 시간·actor·live 충돌의 value 순서 |
| 9 | docs/retention.md: 한 배치의 동일 key 재시도 무시 |
| 10 | docs/retention.md: 다른 호출과 ID를 넘어 동일 key 무시 |
| 11 | docs/retention.md: TTL 경계 전 tombstone 유지 |
| 12 | docs/retention.md: TTL 경계에서 records 제거 및 fence 유지 |
| 13 | docs/retention.md: 만료 후 오래된 update 부활 방지 |
| 14 | docs/retention.md: 만료 후 더 새로운 live update 허용 |
| 15 | docs/retention.md: 빈 배치에서도 만료 수행 |
| 16 | README.md: records와 seen의 정렬 |
| 17 | README.md: 입력 불변 |

## perf-route-planner

구간의 도착점 순서와 도달 가능한 출발 구간의 최소 비용을 함께 추적한다. fixture는 매 서비스마다 출발 구간 전체를 선형 탐색한다. m1은 from에서만 탑승하고, m2는 같은 도착점의 이후 더 싼 서비스를 무시하며, m3은 불가능한 경로를 0으로 바꾼다.

| 검사 | 근거와 확인 조건 |
|---:|---|
| 0 | README.md: 한 정류장에서는 비용 0 |
| 1 | README.md: 도달 불가능은 null |
| 2 | README.md: 직접 서비스의 비용 |
| 3 | README.md: 도착 직후 환승 |
| 4 | README.md 및 docs/examples.md: 서비스 구간 중간에서 탑승 |
| 5 | README.md: 다른 구간 중간에서 탑승 |
| 6 | README.md: 구간 중간 도달과 후속 서비스 |
| 7 | README.md: 실제 도달한 정류장만 사용 |
| 8 | README.md: 더 싼 도달 지점에서 탑승 |
| 9 | README.md: 중간 구간과 여러 환승 후보 |
| 10 | docs/examples.md: 같은 도착점의 최저 비용 |
| 11 | README.md: 서비스 입력 순서는 무관 |
| 12 | README.md: 0 요금 허용 |
| 13 | README.md: 탑승 시작점보다 앞에서는 탑승 불가 |
| 14 | README.md: 입력 불변 |
| 15 | prompt.txt: 20만 정류장·서비스의 1초 제한; README.md: 비용 |
| 16 | README.md: 고정 시드의 작은 그래프를 직접 열거한 최저 비용과 비교 |

## perf-window-stats

고정된 입력을 좌표 압축하고 값 빈도와 이벤트 만료 순서를 추적한다. fixture는 매 이벤트마다 활성 이벤트를 필터·정렬한다. m1은 경계에 도착한 이벤트를 잘못 포함하고, m2는 기존 경계 이벤트를 만료하지 않으며, m3은 nearest-rank를 내림한다.

| 검사 | 근거와 확인 조건 |
|---:|---|
| 0 | README.md: 빈 입력 결과 |
| 1 | README.md: 단일 이벤트의 watermark·count·value |
| 2 | README.md: 짝수 개의 낮은 중앙값 |
| 3 | README.md: 0 분위수는 최소값 |
| 4 | README.md: 1 분위수는 최대값 |
| 5 | README.md: 동일한 값은 중복 측정치 |
| 6 | README.md 및 docs/replay.md: 기존 이벤트의 열린 하한 만료 |
| 7 | docs/replay.md: 하한과 같은 지연 도착은 제외 |
| 8 | docs/replay.md: 하한보다 오래된 지연 도착은 제외 |
| 9 | docs/replay.md: 윈도 내부 지연 도착은 즉시 포함 |
| 10 | docs/replay.md: 같은 시각은 별도 측정치 |
| 11 | docs/replay.md: watermark 전진 시 여러 항목 만료 |
| 12 | docs/replay.md: 늦게 온 측정치도 자기 timestamp에 만료 |
| 13 | README.md: nearest-rank 올림 |
| 14 | README.md: 입력 불변 |
| 15 | prompt.txt: 20만 이벤트 1초 제한; README.md: watermark와 분위수 |
| 16 | README.md 및 docs/replay.md: 고정 시드 입력을 느린 직접 계산과 비교 |

무료 검증은 fixture 실패, solution과 원본 공개 테스트 통과, 모든 mutant 실패를 검사한다. 모델 호출을 하지 않았으므로 effort별 변별력과 30턴 내 해결 가능성은 실측하지 않았다.
