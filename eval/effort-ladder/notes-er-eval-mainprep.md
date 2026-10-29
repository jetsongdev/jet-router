# er-eval-mainprep → er-eval-lead

- 승인: D-ER-20261029-01. 구현: Codex. 브랜치 `feat/effort-ladder`, 시작 HEAD `c4ee347758ef4ccd6764bdf10ac9e1afa5750bcf`.
- result 수신 후 예외는 수신한 결과로 처리하고 다음 실행을 계속한다. result 없는 예외는 원문 없이 고정 `errorClass`와 `error_during_execution`을 남긴다. auth·billing은 코드 5로 종료하고, 연속 3회 결과 없는 실행은 중단한다. 결과가 없는 부모는 fork하지 않는다. 결과 없는 실행은 예약액으로 정산한다.
- 1·2턴 요청과 원장 예약에 동일한 effort별 예산표(max $3, xhigh $1.5, 그 외 $1)를 적용한다.
- 메인 assistant의 중복 제거된 message.id별 입력 및 캐시 usage를 `steps`에 순서대로 기록하고 캐시 합계와 첫 단계 생성량을 남긴다. assistant message의 `output_tokens`는 자리표시자이므로 steps에 기록하지 않는다.
- Bash tool_result의 텍스트에서 비0 exit code 패턴 일치 및 is_error 동시 일치 수만 남긴다. 텍스트는 기록하지 않는다. v0b는 테스트 실패에만 is_error 또는 비0 힌트를 사용하며 기존 v0와 함께 기록한다. SDK `sdk-tools.d.ts`의 BashOutput은 stdout/stderr를 정의하지만 비0 종료 텍스트 형식을 명시하지 않으므로 이 패턴은 관측 힌트다.
- mock 집중 검증: `cd eval/effort-ladder && node --test test/agent-run-*.test.mjs` 종료 코드 0, 14개 통과. result 후 예외, auth/billing 중단, 연속 실패 및 초기화, 예산과 예약, 캐시 중복 제거, Bash 힌트 및 v0b를 검증했다.
- 전체 검증: `cd eval/effort-ladder && node --test test/*.test.mjs` 종료 코드 0, 41개 통과, skip 0.
- `git diff --check` 종료 코드 0.
- 유료 호출, 설치, 설정 변경, GitHub API/MCP, 커밋, 푸시는 하지 않았다. 실제 SDK 호출 및 Bash 비0 출력과 is_error 관계는 미검증이다. 브라우저 검증은 수행하지 않았다.
