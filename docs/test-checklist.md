# 실제 Claude 테스트 체크리스트

대상: 0.7.1 이상(off/shadow/enforce, 사용량 기록·대조군·HTML 대시보드). 아래 체크박스는 **미실행** 상태이며 테스트를 직접 확인한 뒤 표시한다. enforce는 `/jet-router enforce`로 켤 때만 동작한다.

설치·설정 절차는 [README](../README.md#jev-사용-설정), 세부 명령은 [사용 가이드](usage.md)를 참고한다. 비민감 테스트 폴더와 합성 문장으로 진행한다. fake라도 일반 Claude 응답의 사용량은 발생하며 Jev는 별도 API 비용이 발생할 수 있다.

## 0. 환경 기록

- 테스트 일시 / OS:
- `claude --version`:
- `node --version` (Jev는 Node 22+):
- 설치 방식: marketplace / `--plugin-dir`
- 실제 설치된 코드 commit SHA (확인 불가하면 unknown):
- 사용 모델 / 시작 effort:
- 결과 기록 위치:

다른 기기에서 clone했다면 그 checkout의 SHA와 실제 Claude에 설치된 플러그인 코드가 같은지도 구분한다. 키·개인 프롬프트·원본 debug 로그를 결과 문서에 붙이지 않는다.

## 1. 설치와 기본 상태

- [ ] README의 설치 절차가 완료되고 `/plugin`에 로드 오류가 없다.
- [ ] function hooks 환경 변수 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`을 확인하고 재시작했다.
- [ ] 새 세션에서 `/jet-router status`가 정상 응답한다.
- [ ] 초기 모드는 off이며 최근 완료는 없음이다.
- [ ] 기본 분류기는 fake이고 외부 전송은 없음으로 표시된다.
- [ ] off에서 합성 문장 하나를 보내도 새 추천 요약이 나오지 않는다.

## 2. Fake shadow — 먼저 확인

- [ ] `/jet-router shadow` 후 status에 관찰 모드가 표시된다.
- [ ] `"Helllo"를 "Hello"로 바꾼 결과만 답해줘.`를 보내고 답변 종료 후 요약이 한 번 나온다.
- [ ] 요약이 `fake.shadow(): <현재 요청 effort> → …(고정값)` 형식으로 표시된다.
- [ ] 기본 fakeChoice=keep에서 `<현재 요청 effort> 유지(고정값)`이 나온다.
- [ ] 답변이 완전히 끝난 뒤 다른 문장을 보내면 새 턴의 요약이 한 번 나온다.
- [ ] Configure options에서 fakeChoice=low로 바꾸고 안내에 따라 reload한 뒤, shadow를 다시 켜면 `→ low(고정값)`이 나온다.
- [ ] fake 추천이 달라도 Claude 세션의 기본 effort 설정은 바뀌지 않는다.
- [ ] 사용 모델이 지원하는 medium/high/xhigh 설정 중 두 가지 이상으로 새 턴을 시험하고, 요약이 실제 기준값을 따라가는지 확인한다. 지원하지 않는 값은 N/A로 기록한다.
- [ ] 비민감 테스트 파일을 읽고 답하는 등 도구를 사용하는 턴에서도 요약은 메인 턴 종료 시 한 번만 나온다.

요약의 `유지`는 hook이 다음 단계에 넘긴 값에 대한 표시다. 이 줄이나 답변 내용만으로 서버 수신 effort·모델 내부 추론량을 검증했다고 표시하지 않는다. 실제 요청 메타데이터를 확인할 수 없으면 해당 부분은 unknown으로 남긴다.

## 3. Off·잠금·세션 경계

- [ ] `/jet-router off` 후 새 프롬프트에는 새 분류 요약이 나오지 않는다.
- [ ] status의 최근 완료가 이전 기록으로 남더라도 현재 모드는 off로 표시된다.
- [ ] shadow에서 `/jet-router lock` 후 새 프롬프트에는 새 분류 요약이 나오지 않는다.
- [ ] `/jet-router unlock` 후 다음 분류 대상 프롬프트에서 추천이 재개된다.
- [ ] off 상태에서 lock/unlock해도 자동으로 shadow가 켜지지 않는다.
- [ ] 새 세션 시작 시 off와 최근 완료 없음으로 초기화되고, `[jet-router] 세션 시작 · 꺼짐(off)` 알림이 한 번 나온다.
- [ ] fake에서 `defaultMode=shadow`로 reload·재시작하면 새 세션이 `세션 시작 · 관찰(shadow)`로 시작한다.
- [ ] Jev에서 `defaultMode=shadow`여도 새 세션은 off로 시작하고 `Jev는 기본 shadow 미적용`이 표시된다.
- [ ] 기존 대화를 재개했을 때도 초기 상태를 확인한다. 재개 방법·결과는 별도 기록한다.
- [ ] `/jet-router enforce` 후 status가 `적용(enforce)`와 `effort 자동 변경: 켜짐`을 표시한다.
- [ ] enforce에서 하향 추천 턴은 `… → … 적용`으로 표시되고, statusline·settings의 effort는 바뀌지 않는다.
- [ ] enforce 턴 도중 `/effort`를 바꾸면 요약 끝에 `사용자 변경으로 적용 중단`이 붙는다.
- [ ] 새 세션은 enforce가 아니라 off(또는 fake shadow 기본값)로 시작한다.
- [ ] shadow·enforce 턴 후 `~/.claude/jet-router/usage/YYYY-MM.jsonl`에 한 줄이 추가되고, 프롬프트 원문이 없다.
- [ ] `node scripts/usage.mjs report --by day`가 방금 턴을 집계한다.
- [ ] `node scripts/usage.mjs report --html`로 만든 파일이 브라우저에서 열리고, 필터를 바꾸면 카드·차트·표가 CLI 결과와 같게 바뀐다.
- [ ] enforce에서 적용 대상 턴 일부가 `대조군 미적용`으로 표시되고, 기록에 `holdout: true`가 남는다.

## 4. Jev 설정과 최소 실호출

외부 전송과 비용에 동의한 경우에만 실행한다. 먼저 cloudConsent=false 상태로 확인한 뒤, 실호출은 아래 합성 문장 3개를 각각 한 번씩만 보낸다. 오류가 나면 반복 호출하지 말고 결과를 기록한다.

- [ ] Configure options에서 provider=jev, cloudConsent=false로 설정하고 reload한다.
- [ ] status가 외부 전송 미동의를 표시하며, shadow에서 분류 대상 입력을 보내면 전송 미동의로 생략된다.
- [ ] API 키는 Configure options의 jevApiKey에 입력한다. 프로젝트 `.env`만으로 전달되지 않는다는 점을 확인한다.
- [ ] cloudConsent=true로 설정하고 reload한 뒤에도 새 세션은 off로 시작한다.
- [ ] shadow를 켠 후 아래 3건의 추천·기준 effort·지연·오류 여부를 기록한다.

| 합성 입력 | 관찰 항목 | 결과 |
| --- | --- | --- |
| `"Helllo"를 "Hello"로 바꾼 결과만 답해줘.` | 단순 요청 추천, 원래 effort 유지 | 미실행 |
| `동시에 저장할 때 최신 수정이 사라지는 문제의 재현 계획을 설명해줘.` | 복잡한 요청 추천, 원래 effort 유지 | 미실행 |
| `아까 말한 방식으로 그렇게 해줘.` | 맥락 부족에 대한 추천, 이전 대화 문맥의 영향 | 미실행 |

- [ ] 요약이 `Jev.shadow(): … → …` 또는 `Jev 생략: …`으로 표시되고 fake로 위장한 결과가 나오지 않는다.
- [ ] 연속 턴에서 이전 추천이 잘못 재사용되지 않는지 확인한다. 같은 추천이 반복되는 것 자체는 실패가 아니다.
- [ ] off로 끝내고 현재 모드를 확인한다.

특정 추천값을 무조건 통과 조건으로 삼지 않는다. 기존 대화에 입력한 후속 지시는 실제 맥락이 있을 수 있으므로, 독립 합성 평가와 구분해서 해석한다. off는 이미 전송한 요청·비용을 회수하지 않는다.

## 5. 확장 검증 — fake로 우선 수행

- [ ] 응답 도중 중단한 뒤 새 프롬프트를 보냈을 때 이전 추천이 새 턴 결과로 나타나지 않는다. 이미 완료된 분류의 중단 요약은 표시될 수 있다.
- [ ] 큐·턴 도중 추가 입력·겹친 제출은 보수적으로 생략되며 다른 턴에 추천이 연결되지 않는다.
- [ ] 첨부파일이나 6,000자 초과 합성 입력은 분류 생략 또는 요약 생략으로 처리된다.
- [ ] 모델이 max를 지원한다면 max 보호로 분류가 생략된다. 미지원이면 N/A다.
- [ ] subagent 동작에서 별도 추천 요약이 중복되지 않는다.
- [ ] 백그라운드 subagent 완료 보고로 열린 턴에는 생략 요약이 출력되지 않는다.
- [ ] 스킬 명령(`/스킬명`) 입력은 `스킬·명령 입력`, 이미지 첨부는 `첨부 포함`으로 생략 사유가 표시된다.
- [ ] 요약·status에 합성 canary 문자열이 포함되지 않는다. 실제 비밀을 canary로 사용하지 않는다.

통신 timeout, redirect, 응답 크기 초과, 키 누락의 결정적 재현은 기존 오프라인 테스트로 확인한다. 수동 확인을 위해 전송 주소를 바꾸거나 실제 키를 로그에 노출하지 않는다.

## 6. 결과와 완료 판단

- 실행한 항목: pass / fail / N/A / unknown으로 구분
- 실패 항목과 재현 순서:
- 기대 결과 / 실제 결과:
- 키를 제거한 최소 오류 메시지·화면:
- 실제 요청 effort 증거: 있음 / unknown (요약 표시와 구분)
- 남은 미검증 항목:

설치·fake·Jev·off/lock·새 세션을 실제로 확인해야 shadow 사용자 동작 검증 완료로 기록한다. 확장 검증에서 건너뛴 항목은 명시한다. 이 체크리스트 통과가 enforce, 일반 분류 정확도, 비용 절감 또는 모든 Claude 버전의 호환성을 의미하지 않는다.

## 7. Codex MCP shadow 검증

Codex MCP 서버와 설정 예시는 별도 구현했다. 오프라인 검증과 실제 host 검증을 구분한
[Codex MCP 가이드·체크리스트](codex-mcp.md#4-검증-기록과-수동-체크리스트)를 사용한다.
MCP 연결/도구 schema/미동의·오류/동시 요청 처리는 오프라인 검증 대상이며,
실제 hook 호출과 UI, 취소 동작은 수동 확인 전이다.

클라이언트가 추천을 실제 적용하는 enforce, 지원 effort 매핑, 기본값 복귀 검증은
이번 구현 범위 밖이며 N/A다.

## Claude Code 실제 코드·토큰 비교

[전용 체크리스트](claude-quality-checklist.md)에 설치 shadow 확인, 무과금 plan, 1과제 smoke,
6과제 반복 비교, 결과 리포트 생성 명령을 정리했다. Codex와 같은 합성 과제·독립 검사를 쓰되
Claude 캐시 읽기/쓰기 집계는 별도로 처리한다. CLI 비교 스크립트는 플러그인 enforce를 실행하지 않는다.
