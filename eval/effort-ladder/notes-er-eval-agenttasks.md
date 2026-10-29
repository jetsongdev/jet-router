# er-eval-agenttasks 인계

- 기준: `feat/effort-ladder`, HEAD `4054d3a67a2e4f8853348f07e6819344f56efe50`. 사용자 승인 D-ER-20261029-01. 유료 호출·설치·커밋·푸시 없음.
- 소유 산출물: `agent/site-route-repair/**`, `agent/calc-decimal-cli/**`, `agent/link-lint-scope/**`, `agent/game-round-reducer/**`, `agent/log-window-aggregate/**`, `agent/batch-rollback-debug/**`, `agent/grade-agent.mjs`, `test/agent-tasks.test.mjs`, 이 파일. 각 과제에 prompt, meta, fixture, solution, mutant 3개와 hidden 검사를 둠.
- 채점: 검사별 작업 트리 복사와 별도 프로세스, 45초 검사 제한 및 meta 전체 제한 120초, 프로세스 그룹 정리, 공개 테스트 바이트 비교. 모든 과제의 `maxTurns`는 초안 권고값.

## 검사 커버리지 표

| 과제 | 번호별 검사 |
|---|---|
| site-route-repair | 1 정상 2개, 2 CRLF/콜론, 3 escaping, 4 본문 개행, 5 누락/빈 값, 6 중복/닫는 구분자, 7 slug 형식, 8 slug 중복, 9 사전 검증/원자성, 10 비 md/읽기 순서 |
| calc-decimal-cli | 1 add, 2 sub, 3 mul, 4 30자리 정밀도, 5 부호/선행 0, 6 31자리, 7 잘못된 숫자, 8 연산자/인수, 9 오류 출력·종료 코드 |
| link-lint-scope | 1 위반 유형/행, 2 허용 링크, 3 한 줄 다중 위반, 4 fence, 5 들여쓰기/뒤 텍스트 fence, 6 열린 fence, 7 CRLF, 8 불완전 링크, 9 정상 출력, 10 파일/인수 오류 |
| game-round-reducer | 1 초기 상태, 2 시작/득점, 3 생명/종료, 4 종료 후 no-op, 5 재시작, 6 허용되지 않은 이벤트, 7 새 객체, 8 frozen 입력, 9 기존 API/스냅샷, 10 인스턴스 독립 |
| log-window-aggregate | 1 집계/정렬, 2 경계, 3 빈 창/파일, 4 공백/CRLF/사용자 구분, 5 범위 밖 오류, 6 레코드 값 오류, 7 CLI 오류, 8 합계 초과, 9 안전 정수 한계, 10 독립 참조, 11 100만 행/64 MiB 힙/30초 |
| batch-rollback-debug | 1 정상 다중 이체, 2 rollback, 3 실패 후 재시도, 4 잘못된 이체, 5 overflow, 6 self-transfer, 7 빈 배치, 8 복사 경계, 9 특수 키, 10 초기 잔액 검증 |

## 검증

- `cd eval/effort-ladder && node --test test/agent-tasks.test.mjs`: 종료 코드 0, 6/6 통과, 최종 25.29초. 원본 실패, solution 전체 숨김 및 공개 테스트 통과, mutant별 실패, 공개 테스트 변조 감지를 검사함.
- `node --test --test-name-pattern=site-route-repair test/agent-tasks.test.mjs`: 종료 코드 0. 계측 오류 수정 후 실행.
- `git diff --check`: 종료 코드 0. 산출물이 미추적이므로 이 명령은 그 내용의 공백 오류를 검사하지 않음.
- 별도 임시 디렉터리에 100만 행 생성 후 `/usr/bin/time -p node --max-old-space-size=64 --require <임시 RSS 계측> agent/log-window-aggregate/solution/aggregate.mjs <임시 JSONL> 0 2`: 종료 코드 0, 결과 count 1,000,000 / bytes 2,000,000, 실측 0.31초, `process.resourceUsage().maxRSS` 59,440 KiB. 생성 데이터와 계측 파일 삭제. 행 수 유지. 첫 `/usr/bin/time -l` 시도는 결과 출력 후 `sysctl kern.clockrate: Operation not permitted`로 메모리 통계가 나오지 않아 Node 계측으로 측정함.

## 미해결·불확실

- 사이트 읽기 순서 계측은 `node:fs/promises`의 `readFile` 호출을 관찰한다. `readFileSync` 등 다른 합법적 읽기 방식은 계측하지 못해 오판할 수 있으므로 실제 평가 전에 계측 확장이 필요하다.
- HTML escape 검사에서 single quote는 `&#39;`, `&#x27;`, `&apos;`를 인식한다. 동등한 다른 문자 참조 표현은 오판할 수 있다.
- 120초 전체 제한과 45초 개별 제한은 이 맥의 측정에 여유를 둔 값이며 다른 실행 환경의 부하에서는 별도 확인이 필요하다.

## 보완 (2026-10-29)

- 사이트 10번의 임시 preload 계측을 `fs`, `node:fs`, `fs/promises`, `node:fs/promises`의 파일 읽기, sync/callback/Promise, 스트림, 파일 디스크립터, FileHandle 읽기 경로로 확장했다. 동일 파일의 연속 읽기는 한 파일 처리로 취급한다. preload 코드와 기록은 채점 임시 디렉터리에만 복사하며, 계측 원본은 `agent/site-route-repair/hidden/read-hook.cjs`에 있다.
- 임시 작업 트리에서 readFileSync, createReadStream, callback readFile, Promise open/FileHandle, sync 및 callback fd 읽기, fd 스트림 정상 변형을 검사하고, 역순 읽기 변형은 검사 10에서 실패하는 것을 확인했다. 공개 fixture와 solution은 변경하지 않았다.
- 문자 참조 디코더는 이름 참조와 10진/16진 숫자 참조를 처리한다. `&#39;`, `&#039;`, `&#x27;`, `&#X0027;`, `&apos;` 정상 변형을 검사했다. 위 미해결 항목의 읽기 API 및 single quote 숫자 참조 제한은 이 보완으로 대체한다.
- `node --test --test-name-pattern='site reading order|site escaping' test/agent-tasks.test.mjs`: 최종 종료 코드 0, 2/2 통과. 중간 두 번은 종료 코드 1: fd 스트림/콜백 변형을 추가하며 `util.promisify(fs.read)`의 Node 고유 메타데이터가 래퍼에서 사라지는 문제를 발견했고 보존하도록 수정했다.
- `node --test test/agent-tasks.test.mjs`: 최종 종료 코드 0, 8/8 통과, 24.99초.
- 남은 계측 한계: preload는 빌더 프로세스의 공개 Node fs API를 관찰한다. 별도 자식 프로세스가 자체 환경에서 파일을 읽거나 Node 비공개 바인딩으로 읽으면 기록이 누락될 수 있어, 이런 구현까지 보편적으로 판별한다고 주장할 수 없다. 평가 대상이 그런 방식을 쓰는 경우 검사 10의 결과를 수동 확인해야 한다.
