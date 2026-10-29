# er-eval-hard-b — 3차 재설계

각 prompt는 150–400단어 산문이며, 숫자는 숨긴 검사 배열의 1부터 시작하는 순서다. 아래 경로는 각 과제의 fixture 안에서 찾는다. 예외 mutant는 solution 위의 단일 결함이다. 코드 줄 수는 fixture의 `.mjs` 전체이며 파일 수에는 문서·테스트가 포함된다.

| slug | fixture 파일 | 코드 줄 | prompt 단어 | 숨긴 검사 | solution 줄 | maxTurns |
|---|---:|---:|---:|---:|---:|---:|
| convention-export-feature | 30 | 655 | 234 | 19 | 53 | 36 |
| convention-new-provider | 23 | 640 | 224 | 18 | 25 | 36 |
| wide-currency-migration | 60 | 708 | 246 | 23 | 267 | 36 |
| wide-logger-api | 66 | 750 | 237 | 22 | 303 | 36 |

fixture의 로컬 `src/reporting/`에는 합성 운영 기록을 집계하는 주변 코드가 포함된다. 세 과제의 유틸리티 6개는 같은 구현이며 보고기의 기록 필드는 도메인별로 다르다. 통화 과제는 파일 수 상한 때문에 유틸리티를 두 파일로 묶었다.

예산은 네 과제 모두 low 1.5 / medium 1.5 / high 2 / xhigh 3 USD, hiddenTimeoutMs 180000이다. 유료 모델 실측은 하지 않았다.

## convention-export-feature 검사 근거

1. 빈 CSV 헤더와 CRLF: `README.md`, `CONTRIBUTING.md`.
2. CSV content-type: `docs/orders.md`.
3. 권한 부재와 감사 기록 없음: `src/handlers/list.mjs`, `src/lib/auth.mjs`, `docs/audit.md`.
4. principal의 테넌트 일치: `src/lib/auth.mjs`.
5. 테넌트 격리: `src/store/orders.mjs`.
6. ID 정렬: `src/store/orders.mjs`, `docs/orders.md`.
7. 정수 센트: `CONTRIBUTING.md`, `docs/orders.md`.
8. 테넌트 시간대: `CONTRIBUTING.md`, `src/lib/date.mjs`, `src/store/tenants.mjs`.
9. 쉼표 필드 인용: `CONTRIBUTING.md`.
10. 따옴표 중복 인코딩: `CONTRIBUTING.md`.
11. 줄바꿈 필드 인용: `CONTRIBUTING.md`.
12. 수식 시작 `=` 보호: `CONTRIBUTING.md`.
13. 수식 시작 `+`, `@`, `-` 보호: `CONTRIBUTING.md`.
14. 페이지 연결과 커서 인코딩: `README.md`, `src/lib/page.mjs`, `src/lib/cursor.mjs`.
15. 타 테넌트 커서 거절과 감사 기록 없음: `src/lib/cursor.mjs`, `src/handlers/list.mjs`, `docs/audit.md`.
16. 잘못된 limit 거절과 감사 기록 없음: `src/lib/page.mjs`, `src/handlers/list.mjs`, `docs/audit.md`.
17. 성공 감사의 actor·tenant·action: `src/lib/audit.mjs`, `docs/audit.md`.
18. 잘못된 커서 거절: `src/lib/cursor.mjs`, `src/handlers/list.mjs`.
19. 마지막 CRLF와 최종 null 커서: `CONTRIBUTING.md`, `src/lib/page.mjs`.

Mutants: `no-auth`, `utc-date`, `no-formula-escape`, `no-audit`.

## convention-new-provider 검사 근거

1. 새 provider 등록과 `{id}` 결과: prompt, `README.md`, 기존 `src/registry.mjs`.
2. Pulsar payload: `docs/integrations.md`.
3. 빈 토큰을 생성 시 거절: `docs/integrations.md`, `src/validate.mjs`.
4. 공백·비문자 토큰 거절: 같은 근거.
5. 원래 토큰 유지 및 설정 비변경: `docs/integrations.md`.
6. HTTP 201 성공: `docs/integrations.md`, `src/response.mjs`.
7. 빈 성공 ID는 upstream: 같은 근거.
8. HTTP 400 매핑과 재시도 없음: `docs/integrations.md`, `src/errors.mjs`, `src/retry.mjs`.
9. 401·403 auth와 토큰 비노출: 같은 근거.
10. 429 재시도와 서버 지정 지연: 같은 근거.
11. 503 재시도와 0ms 허용: 같은 근거.
12. 잘못되거나 없는 지연의 50ms 기본: 같은 근거.
13. 세 번 한도와 마지막 오류: 같은 근거.
14. 기타 상태의 upstream 매핑: `docs/integrations.md`, `src/errors.mjs`.
15. 기존 세 provider 유지: prompt, 기존 `src/providers/` 및 `src/registry.mjs`.
16. 미등록 이름 거절: `src/registry.mjs`.
17. 재시도 때 메시지 보존: `docs/integrations.md`, `src/retry.mjs`.
18. 204는 유효 성공 상태가 아님: `docs/integrations.md`, `src/response.mjs`.

Mutants: `no-validation`, `wrong-payload`, `no-normalization`, `no-retry`.

## wide-currency-migration 검사 근거

1–14. 각 검사는 각각 계산기 01–03, 04–06, 07–09, 10–12, 13–15, 16–18, 19–21, 22–24, 25–27, 28–30, 31–33, 34–36, 37–39, 40–42를 독립 호출한다. 필드·반올림·tag는 `docs/money.md`, 진입 위치는 `src/registry.mjs`. 각 검사에서 그룹의 모든 모듈을 별도 확인하므로 동적 키와 별칭을 포함한다.
15. JSON 입출력 달러와 0.125 달러 fee의 센트 반올림: `README.md`, `docs/money.md`, `docs/examples.md`.
16. 0.29 달러 경계: `README.md`, `docs/money.md`.
17. 입력·출력 변환 경계: `README.md`, `docs/money.md`, `src/adapter.mjs`.
18. 건별 반올림 후 합계: `docs/money.md`, `src/summary.mjs`.
19. 테스트 기록 헬퍼의 내부 필드: `docs/money.md`, `test/helpers/records.mjs`.
20. 별칭으로 부르는 금액 헬퍼: `docs/money.md`, `src/helpers/read-money.mjs`.
21. 양방향 달러·센트 변환: `docs/money.md`, `src/money.mjs`.
22. 계산기 번호 범위: `README.md`, `src/registry.mjs`.
23. 반 센트 경계에서 건별 반올림: `docs/money.md`.

Mutants: `dynamic-dollar`, `alias-dollar`, `round-late`, `json-cents`.

## wide-logger-api 검사 근거

1–16. 각 검사는 각각 handler 01–03, 04–06, 07–09, 10–12, 13–15, 16–18, 19–21, 22–24, 25–27, 28–30, 31–33, 34–36, 37–39, 40–42, 43–45, 46–48을 개별 호출한다. 이벤트·레벨·필드·반환값은 `docs/logging.md`, `docs/operations.md`, 각 `src/handlers/` 기존 코드.
17. 비활성 debug에서 비싼 함수 미호출: `docs/logging.md`.
18. 서비스의 주입 로거 사용: prompt, `docs/logging.md`, `src/service.mjs`.
19. 직렬화된 error의 name·message·선택적 code: `docs/logging.md`.
20. logger 생성·barrel 및 최상위 재수출: `docs/logging.md`, `src/index.mjs`.
21. 작업 번호 범위: `README.md`, `src/tasks.mjs`.
22. code 없는 오류와 stack 비포함: `docs/logging.md`.

Mutants: `debug-eager`, `error-message-only`, `no-injection`, `legacy-message`.
