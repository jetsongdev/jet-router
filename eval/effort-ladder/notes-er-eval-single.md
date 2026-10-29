# er-eval-single 작업 결과

- 브랜치: `feat/effort-ladder`; 시작 HEAD: `4054d3a67a2e4f8853348f07e6819344f56efe50`.
- 소유 산출물: `single/{heading-index,grid-neighbors,front-matter-fields,line-winner,monthly-occurrences,unit-sum,patch-components}/` 각각의 `spec.txt`, `checks.mjs`, `reference.mjs`, `mutants/m1.mjs`, `mutants/m2.mjs`, `mutants/m3.mjs`; `test/single-tasks.test.mjs`; 이 notes 파일.
- 초안의 각 명세에서 마지막 `Return only JavaScript ES module code; no imports or external libraries.` 문장만 제거했다. CONTRACT가 공통 프롬프트 래퍼에서 제공하도록 허용한 중복 문장이다. 그 외 명세 문장 수정 없음.
- 각 검사 번호는 초안의 같은 번호와 대응한다. 각 mutant는 단독 결함을 주입했으며 최소 하나의 검사에서 실패한다. 아래 `없음`은 현재 세 mutant 중 해당 검사에 실패한 것이 없다는 뜻이다.

## 검증

- `cd eval/effort-ladder && node --test test/single-tasks.test.mjs`: 최초 종료 코드 1 (patch-components m1 생존); 해당 mutant의 삽입 경계 결함을 양쪽 분기에 적용한 뒤 재실행 종료 코드 0, 7개 통과. reference 전체 검사 통과, 각 mutant 및 빈 모듈 실패, 검사 중 unhandled rejection 없음 확인.
- `find eval/effort-ladder/single -type f -name '*.mjs' -print0 | xargs -0 -n1 node --check` 및 `node --check eval/effort-ladder/test/single-tasks.test.mjs`: 종료 코드 0.
- 직접 import한 각 검사와 각 mutant의 교차 실행으로 아래 표 작성: 종료 코드 0.
- `git diff --check`: 종료 코드 0. 산출물은 현재 untracked이므로 이 명령은 해당 파일의 공백 검증을 포함하지 않는다.
- Node `v23.11.0`. 유료 호출, 설치, 설정 변경, 커밋 및 푸시 없음.

## 미해결·불확실

- 검사 표의 `없음` 항목은 해당 검사에 대한 mutant 살해 증거가 없다. 이는 검사 실패를 뜻하지 않으며 추가 결함 표본으로 평가할 여지가 있다.
- 모델 응답 및 별도 프로세스 채점기 통합은 실행하지 않았다. 브라우저 검증은 이 과제에 해당하지 않는다.

## 검사 커버리지 표

### heading-index

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | m2 |
| 2 | 없음 |
| 3 | m1, m2 |
| 4 | m1, m2 |
| 5 | m2 |
| 6 | m2 |
| 7 | 없음 |
| 8 | m2 |
| 9 | m3 |
| 10 | 없음 |

### grid-neighbors

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | m2 |
| 2 | m2 |
| 3 | m2 |
| 4 | m1 |
| 5 | m2 |
| 6 | 없음 |
| 7 | m3 |
| 8 | 없음 |
| 9 | 없음 |
| 10 | m2 |

### front-matter-fields

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | 없음 |
| 2 | 없음 |
| 3 | 없음 |
| 4 | m1 |
| 5 | 없음 |
| 6 | m3 |
| 7 | 없음 |
| 8 | m2 |
| 9 | m1, m3 |
| 10 | 없음 |

### line-winner

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | m3 |
| 2 | m2 |
| 3 | m3 |
| 4 | m3 |
| 5 | m1 |
| 6 | m1 |
| 7 | m3 |
| 8 | 없음 |
| 9 | 없음 |
| 10 | m3 |

### monthly-occurrences

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | m1 |
| 2 | 없음 |
| 3 | m1, m2 |
| 4 | 없음 |
| 5 | 없음 |
| 6 | 없음 |
| 7 | m3 |
| 8 | 없음 |
| 9 | 없음 |
| 10 | m1 |

### unit-sum

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | m1 |
| 2 | m1 |
| 3 | m1 |
| 4 | 없음 |
| 5 | m2 |
| 6 | m3 |
| 7 | 없음 |
| 8 | 없음 |
| 9 | 없음 |
| 10 | 없음 |

### patch-components

| 검사 번호 | 잡힌 mutant |
|---:|---|
| 1 | 없음 |
| 2 | 없음 |
| 3 | m3 |
| 4 | m1, m3 |
| 5 | m2 |
| 6 | 없음 |
| 7 | m3 |
| 8 | m3 |
| 9 | 없음 |
| 10 | m3 |
