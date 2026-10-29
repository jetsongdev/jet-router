# er-eval-core 작업 보고

- 기준: `feat/effort-ladder`, HEAD `4054d3a67a2e4f8853348f07e6819344f56efe50`. 커밋·푸시·설치·설정 변경·실제 유료 호출 없음.
- 소유 산출물: `lib/ids.mjs`, `lib/pricing.mjs`, `lib/ledger.mjs`, `lib/grade-single.mjs`, `lib/single-prompt.mjs`, `scripts/build-manifest.mjs`, `scripts/batch.mjs`, `scripts/ledger-report.mjs`, `.gitignore`, `test/core-main.test.mjs`, 이 보고서.
- SDK 타입: `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`의 `OutputConfig`, `JSONOutputFormat`에서 `format: {type:'json_schema',schema}` 및 effort 값 확인. Batch 결과는 `batches.results()` async iterator 사용.
- 계약 본문은 `runs/` 제외를 명시하지만 이번 작업 지시가 세 경로를 제외하지 말라고 명시하여 `.gitignore`에 `*.lock`만 기록. 기존 저장소 루트 `.gitignore`의 `node_modules/` 규칙은 그대로이므로 실제 `node_modules`는 여전히 Git에서 무시됨. 루트 파일은 소유 범위 밖.

## 검증

- `cd eval/effort-ladder && node --test test/core-*.test.mjs` → 종료 0, 6개 통과. tq 6개 reference/빈 모듈, 임시 ss, 원장 상한·재생·잠금·turn2, 유료 차단, mock submit→collect, refusal/errored/expired 포함. 최초 실행은 임시 경로의 macOS `/tmp` 실경로 문제로 종료 1; 경로 보정 후 재실행 통과.
- `node scripts/batch.mjs build --wave w0 --tasks tq --efforts low,max --reps 1 --out-dir /tmp/effort-ladder-er-eval-core-dry-20261029` → 종료 0, 요청 12개, 추정 $3.845936. 네트워크 없음.
- 소유 `.mjs` 파일 각각 `node --check` → 종료 0.
- `git diff --check` → 종료 0. 신규 미추적 파일은 이 명령 검사 범위가 아님.
- `git check-ignore -v eval/effort-ladder/node_modules eval/effort-ladder/runs eval/effort-ladder/tasks-manifest.json` → 종료 0, 루트의 node_modules 규칙만 출력.

## 미해결·불확실

- 실제 SDK 서버 연결, 모델 응답, 과금, 실사용 API 스키마 호환성은 미검증. 유료 호출 미승인 상태이며 테스트는 mock만 사용.
- `build` 추정액은 프롬프트 UTF-8 바이트/4와 최대 출력 토큰을 이용한 근사치이며 실제 토큰 수나 지출 상한 보장이 아님. 예약액은 서버 측 과금 제한이 아니다.
- submit 요청의 응답이 유실되면 상태를 `submitting`으로 남기고 예약을 유지한다. 중복 유료 제출을 막기 위해 수동 대조가 필요하다.
- collect는 정산 후 상태와 결과 파일을 순서대로 쓰므로 그 사이 프로세스가 중단되면 자동 복구가 불완전하다. 원장과 Batch 결과를 수동 대조해야 한다. 사용량이 없는 결과가 하나라도 있으면 웨이브 예약액 이상을 `assumed-max`로 정산한다.
- `fixture_sha256`은 정렬된 상대 파일 경로와 각 내용 SHA-256 쌍의 JSON을 다시 SHA-256한 값이다. 소비 측에서도 동일 규칙 사용 필요. 다른 팀의 작업이 진행 중이므로 전체 ss/ag manifest와 실제 과제 통합은 이 실행에서 검증하지 않았다.
- CLI 유료 동작(`status`, `cancel`, `collect` 포함)은 모두 이중 승인 게이트 적용. 실행 전에 `--paid`와 `LADDER_ALLOW_PAID=1` 및 별도 사용자 승인이 필요하다.
