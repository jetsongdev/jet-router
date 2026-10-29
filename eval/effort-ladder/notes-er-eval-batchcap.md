# er-eval-batchcap 작업 보고

- 대상: er-eval-lead. 브랜치 `feat/effort-ladder`, HEAD `4054d3a67a2e4f8853348f07e6819344f56efe50`. `eval/effort-ladder/`는 기존 미추적 상태.
- 변경: `scripts/batch.mjs`, `test/core-main.test.mjs`, 신규 `test/core-batchcap.test.mjs`, 이 보고서. `lib/pricing.mjs`는 기존 계산을 사용해 변경하지 않음.
- build와 submit에 realistic/worst USD를 출력. 단계별 기본 출력 가정과 `--assume` JSON 부분 덮어쓰기, `--assume-from` 이전 결과의 단계별 nearest-rank p95를 적용. 두 옵션을 함께 쓰면 이전 결과의 표본이 있는 단계에 p95를 적용하고, 없는 단계는 JSON 또는 기본값을 사용한다.
- submit은 realistic × 1.25가 cap을 초과하면 종료 코드 4로 거부하며, 그렇지 않으면 max(realistic × 1.25, $0.5)를 예약한다. collect의 실제 사용량이 예약액을 넘으면 경고와 결과의 `overrun`을 남긴다. 기존 원장이 구간 상한 초과 정산을 거부하는 경우 잠금 상태에서 동일한 settle 이벤트를 직접 기록하여 실제 지출을 보존한다. 사용량 누락 시 기존 보수적 처리와 같이 알려진 비용과 예약액 중 큰 금액으로 정산한다.
- 검증: `cd /Users/chsong/Documents/sidespace/projects/effort-router/.worktrees/effort-ladder/eval/effort-ladder && node --test test/core-*.test.mjs` → 종료 코드 0, 8개 통과, skip 0. mock으로 제출 거부, 예약, p95, 원장 상한을 넘는 overrun 및 후속 제출 차단을 확인. 경고 출력은 의도된 테스트 결과.
- `node --check scripts/batch.mjs` → 종료 코드 0. 저장소 루트에서 `git diff --check` → 종료 코드 0 (미추적 파일은 검사 대상이 아님).
- 실제 SDK 서버·실과금·실제 출력 분포는 미검증. 추정은 입력 UTF-8 바이트/4 근사이며 비용 상한 보장이 아니다. 유료 호출, 설치, 설정 변경, 커밋, 푸시 및 GitHub API 사용 없음. `.env*` 읽지 않음.
