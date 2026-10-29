# er-eval-keysm1 → er-eval-lead

- 기준: `feat/effort-ladder`, HEAD `23b163f9af9f7b686da88e94b57e89f88b49a055`; 승인 D-ER-20261029-01 / ER-HQ-20261029-012.
- 키 로더와 상태 검사 CLI, Batch/Agent 키 주입, M1 순차 실행기 및 mock 테스트를 추가했다. 재개는 조합별 마지막 행을 기준으로 성공을 건너뛰고 실패를 재시도한다. `--only-failed`는 기존 실패 조합만 재시도한다. 호출 상한은 각 실행의 요청 수에 적용한다.
- 운영 게이트 `MIN_APPLY_PROBABILITY = 0.7`은 `src/policy.js:5`에서 직접 import한다.
- 검증 (cwd `eval/effort-ladder`): `node --test test/*.test.mjs` 종료 코드 0, 34 pass / 0 fail / 0 skip. `node --test test/core-main.test.mjs test/core-batchcap.test.mjs test/agent-run-execution.test.mjs test/keys-m1.test.mjs` 종료 코드 0, 15 pass. `git diff --check` 종료 코드 0.
- 초기 작업 디렉터리 경로 착오로 테스트 파일 생성 명령과 루트에서 실행한 `node --test test/keys-m1.test.mjs`가 실패했으며, 올바른 경로에서 수정 후 위 검증을 완료했다.
- 미검증: 실제 다른 UID 소유 파일의 `not-owner` 분기, 실제 키 파일, 실제 Anthropic/Jev 호출 및 서비스 응답. 권한·크기·파싱은 임시 파일, 실행은 mock으로만 검증했다. 유료 호출은 승인되지 않아 실행하지 않았다.
- 커밋·푸시·설치·설정 변경 없음.
