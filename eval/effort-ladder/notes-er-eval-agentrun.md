# er-eval-agentrun 결과

- 작업 브랜치: `feat/effort-ladder`, 시작 HEAD `4054d3a67a2e4f8853348f07e6819344f56efe50`.
- 소유 산출물: `lib/agent-isolation.mjs`, `lib/shadow-raise.mjs`, `scripts/run-agent.mjs`, `test/agent-run-shadow.test.mjs`, `test/agent-run-execution.test.mjs`, `notes-er-eval-agentrun.md`.
- SDK query는 주입된 mock으로만 실행했다. 실제 모델 호출, 설치, 설정 변경, 커밋, 푸시는 하지 않았다.
- 검증: `cd eval/effort-ladder && node --test test/agent-run-*.test.mjs` 종료 코드 0 (8개 통과). 최초 실행은 인자 기본값 오류로 1이었고 수정 후 통과했다. `git diff --check` 종료 코드 0 (산출물은 미추적 파일이므로 내용 검사는 포함하지 않음).

## 미해결·불확실

- SDK의 샌드박스는 명령 실행에 적용된다. 숨긴 경로는 sandbox `filesystem.denyRead`와 in-process 도구의 `Read` 권한 거부 규칙으로 지정했지만 실제 SDK/OS에서 이 규칙, 네트워크 차단, 경로 별칭 및 symlink 우회를 실증하지 않았다. 유료 실행 전 별도 검증이 필요하다. 특히 `assertHiddenOutside`는 설정과 실경로의 관계만 검사하며 OS의 강제 여부를 증명하지 않는다.
- SDK fork의 세션 복원, effort 실제 반영, 누적 비용 계산은 mock만 검증했다. 부모와 fork의 양수 누적값 차이를 사용하며 부모 비용이 없거나 차이가 0 이하이면 상한 전액으로 잡는다. SDK 비용은 청구액이 아닌 추정치다.
- 현재 `build-manifest.mjs`가 prompt.txt의 끝 개행을 포함해 해시하므로 실행기도 파일을 그대로 사용한다. 계획 §6.1의 '끝 개행 없음'과 불일치한다. manifest/과제 담당자가 사전 등록 전에 일관성을 확정해야 한다. fixture 해시는 현재 manifest 알고리즘을 따른다.
- SDK 비용 settle 이후 채점 또는 작업 트리 저장에 실패하면 원장은 유지되지만 실행 행이 기록되지 않을 수 있다. 새 호출은 예약 상한 거부 시 중단한다. 실제 파일시스템 실패 및 크래시 복구는 검증하지 않았다.
- 테스트는 SDK 메시지 형태의 mock으로만 진행했으며 실제 Bash의 비영 종료가 `is_error`로 관측되는지, 실제 실행의 격리·세션·결과를 확인하지 않았다.
