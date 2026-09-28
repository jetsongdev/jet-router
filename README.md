# jet-router

기존 Claude Code 모델·대화·입력창을 유지하면서 프롬프트마다 필요한 effort를 선택하는 실험적 플러그인입니다.

**현재는 off/shadow 관찰 단계입니다.** 기본 `fake`는 고정 테스트 결과만 반환합니다. 명시적으로 설정한 Jev cloud shadow도 구현했으며 로컬 mock 검증을 마쳤습니다. [합성 입력 12건 실호출](docs/evaluations/jev-smoke-2026-09-27.md)을 마쳤으며, 본격 품질 평가가 남아 있습니다. 로컬 모델 연결은 미지원입니다. effort 자동 변경(enforce)은 `/jet-router enforce`로 켤 때만 해당 턴에 적용합니다.

## Codex MCP shadow — 별도 실험

Codex용 로컬 MCP 서버와 `UserPromptSubmit` hook 설정 예시를 추가했습니다.
자동 추천 관찰용이며 실제 effort는 변경하지 않습니다. MCP 오프라인 연결 테스트는 통과했고,
실제 Codex hook 실행·화면 표시는 수동 검증 전입니다.
**[설치·Jev 설정·중지·테스트 방법](docs/codex-mcp.md)**을 참고하세요.
Claude 플러그인 설정과 키를 자동 공유하지 않습니다.

## 동작 원리

**[Claude Code·Codex 작동 다이어그램](docs/architecture.md)**: 호출 시점, Jev 판정 경로, 메시지 표시와 effort 유지 방식.

목표 흐름은 **사용자 입력 → Jev 추천 → 정책 검사 → 해당 턴의 요청 effort 적용**입니다.

- 기본 effort를 `high`로 고정하지 않습니다. 각 요청의 실제 effort를 읽습니다.
- enforce도 세션의 기본 설정은 유지하고, 해당 프롬프트로 시작한 한 턴에만 적용합니다. 턴 도중 `/effort`를 바꾸면 그 턴의 남은 요청에는 적용하지 않습니다.
- 한 턴 안에서 도구 호출로 모델 요청이 여러 번 발생하면 선택한 effort를 재사용하는 설계입니다.
- 다음 프롬프트에서는 직전 라우터 적용값을 이어받지 않고, 세션 설정을 반영한 요청 effort에서 새로 판단합니다.
- 현재 shadow는 추천만 관찰하며 모든 요청의 effort를 그대로 넘깁니다.

| 모드 | 현재 지원 | 동작 |
| --- | --- | --- |
| off | 지원·초기값 | 분류하지 않음 |
| shadow | fake·선택적 Jev | 추천 결과를 표시하고 원래 effort 유지 |
| enforce | fake·선택적 Jev | 추천 effort(하향·상향, 최대 xhigh)를 해당 턴에만 적용. 세션 시작 기본값으로는 쓰지 않음 |

## 시작하기

공개 저장소에서 설치하려면 Claude 세션 안에서 실행합니다.

```text
/plugin marketplace add jetsongdev/jet-router
/plugin install jet-router@jet-router
```

설치 후 function hooks 활성화 설정을 확인하고 Claude의 reload/재시작 안내를 따릅니다. 원격에서 새로 clone한 코드의 테스트·manifest 검증은 통과했으며, 위 marketplace 설치와 실제 설정 UI는 아직 수동 검증하지 않았습니다. 자세한 활성화 방법은 [사용 가이드](docs/usage.md)를 참고하세요.

로컬 폴더에서 직접 로드하려면 플러그인 코드가 있는 폴더를 지정합니다. 아래 경로는 실제 경로로 바꾸세요.

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /absolute/path/to/jet-router
```

열린 Claude 세션에서 다음 순서로 입력합니다.

```text
/jet-router status
/jet-router shadow
안녕
/jet-router off
```

기본 테스트 결과는 `keep`입니다. 응답 종료 후 다음 형태의 별도 로그 한 줄을 출력합니다. 시간은 예시이며 실제 터미널의 배치는 아직 수동 검증하지 않았습니다.

```text
[jet-router] fake.shadow(): high 유지(고정값) · 0ms
```

이 문구는 실제 난도 분석 결과가 아니라 fake의 고정 결과입니다. 일반 Claude 응답에는 구독 사용량/API 비용이 발생할 수 있습니다. 기본 fake는 외부 요청을 보내지 않습니다. Jev는 별도 선택·전송 동의·키 설정 후 shadow에서만 현재 입력을 전송합니다.

**[전체 사용 가이드](docs/usage.md)**: 설정, 기존 대화에 적용하기, 로컬/공개 설치, 명령어, 메시지 예시, 중지·문제 해결.

## Jev 사용 설정

Jev helper가 실행되는 머신에 Node 22+가 필요합니다. 플러그인을 로드한 뒤 Claude에서 `/plugin` → **Installed → jet-router → Configure options**를 엽니다.

| 옵션 | 설정 |
| --- | --- |
| `provider` | `jev` 선택. 기본값 `fake`는 외부 호출 없는 고정 테스트 결과 |
| `cloudConsent` | TypeSafe로 현재 입력을 전송하는 데 동의하면 `true`. 기본값 `false` |
| `jevApiKey` | TypeSafe API 키 입력. sensitive 옵션으로 Claude secure storage에 저장하도록 선언됨 |

키는 채팅·명령 인자·Git 파일에 넣지 마세요. 키 입력 UI와 secure storage 재로드는 아직 수동 검증하지 않았습니다. Configure options의 세부 위치는 Claude 버전에 따라 달라질 수 있습니다. 저장 후 Claude가 안내하는 reload/재시작 절차를 따릅니다. [공식 플러그인 설정 안내](https://code.claude.com/docs/en/plugins-reference#user-configuration)

Jev를 쓰는 세션은 시작·재개할 때 항상 off입니다. 모든 세션의 프롬프트가 자동으로 전송되지 않도록 `defaultMode=shadow`도 Jev에는 적용하지 않습니다. 세션을 시작할 때 `[jet-router] 세션 시작 · 꺼짐(off) · Jev · 켜기: /jet-router shadow`처럼 현재 모드가 한 줄 표시됩니다. 다음 명령으로 상태를 확인하고 관찰을 켭니다.

```text
/jet-router status
/jet-router shadow
```

Jev 선택·전송 동의·키가 모두 있어야 분류합니다. 현재 프롬프트와 effort를 `api.typesafe.ai`로 보내며 API 비용이 발생할 수 있습니다. 전체 대화나 파일은 수집하지 않습니다. 데이터 처리 정책을 확인하고 민감한 입력 전에는 `/jet-router off` 또는 `/jet-router lock`을 사용하세요. off는 이미 보낸 요청을 회수하지 않습니다.

응답 종료 후 다음과 같은 별도 요약이 나옵니다. 시간은 예시입니다.

```text
[jet-router] Jev.shadow(): medium → low (70%) · 180ms
```

shadow는 추천만 표시합니다. 세션 기본 effort와 실제 요청 effort는 변경하지 않습니다. 추천 품질은 자동 적용에 필요한 본격 품질·정책 평가를 마치지 않은 미평가 상태입니다. `(70%)`는 선택된 후보의 확률이며 신뢰도나 성공 확률이 아닙니다.

### 개발 평가용 `.env`와의 차이

**플러그인은 프로젝트 `.env`를 자동으로 읽지 않습니다.** 일반 사용자는 위 Configure options를 사용합니다. 이번 개발 평가에서는 프로젝트 루트 `.env`의 `TYPESAFE_API_KEY`만 별도 평가 실행기에 전달했습니다. `.env`는 Git에서 제외되어 있습니다.

외부 호출 없이 평가 준비를 확인하려면 플러그인 폴더에서 실행합니다.

```sh
node scripts/evaluate-jev.mjs --dry-run
```

실제 API 호출·비용을 승인한 개발 평가에서만 다음을 사용합니다. 경로는 본인의 `.env` 경로로 바꿉니다. 실행기는 해당 파일의 `TYPESAFE_API_KEY`만 읽고 키를 출력하지 않습니다.

```sh
node scripts/evaluate-jev.mjs --live --key-file /absolute/path/to/project/.env
```

합성 입력 최대 12건을 순차 호출하며 첫 통신·응답 오류에서 중단하고 재시도하지 않습니다. 이 명령은 플러그인을 설치하거나 설정을 저장하지 않습니다.

## 검증과 지원 범위

Claude Code **2.1.283**에서 manifest와 오프라인 hook 테스트를 검증했습니다. Function hooks는 early access이며 다른 버전은 미검증입니다. Herdr와 SDD 문서는 실행에 필요하지 않습니다.

Jev helper 실행과 개발 검증에는 Node 22+가 필요하며 의존성 설치·빌드가 필요하지 않습니다.

```sh
npm test
npm run validate
npm run test:hooks
```

`test:hooks`는 임시 플러그인 사본의 fake/Jev 두 설정에서 설치된 Claude 테스트 도구를 실행합니다. 모델·UI·process를 mock하며 실제 키나 사용자 설정을 읽지 않습니다. 실제 provider 호출이나 대화 세션 검증과는 다릅니다. 별도 실호출 결과는 위 평가 기록을 참고하세요.

- [실제 Claude 테스트 체크리스트](docs/test-checklist.md) — 설치·fake·Jev·off/lock 확인
- [공통 요청 하네스](docs/harness.md) — Claude/Codex shadow 연결·불확실성 표시·요청별 응답 검사
- [구현 작업 목록](TASKS.md) — 모델별 추천 범위·품질 하네스·enforce 선행 조건
- [향후 기능 후보](docs/planned/feature-candidates.md) — 미구현 후보와 선행 조건
- [공식 계약·호환성 조사](docs/compatibility.md)
- [구현 범위·검증 기록·남은 제한](docs/implementation.md)

코드는 [공개 저장소](https://github.com/jetsongdev/jet-router)에 게시했습니다. 현재 원격 기본 브랜치는 `feat/effort-router`이며 정식 release/tag는 없습니다. 배포 라이선스는 아직 선택하지 않았습니다.

Shadow 마무리 상태: Codex hook·연속 입력·취소 복구를 확인했고 선택적 모델 지원 목록 조회를 연결했습니다. Claude 실제 UI 검증은 토큰 부족으로 보류했습니다. [검증 범위·남은 작업](docs/evaluations/shadow-closeout-2026-09-27.md), [모델 조회 설정](docs/codex-mcp.md#모델별-추천-후보-조회-선택)을 참고하세요.

추천 품질 평가 준비: [파일럿 평가셋·채점 방법](docs/quality-evaluation.md). 조정용/검증용 사례를 분리했고 [첫 12건 실호출](docs/evaluations/quality-pilot-v1-live-2026-09-27.md)을 기록했습니다. 기대 범위 일치는 실제 작업 성공률과 다릅니다.

[판정 지침 개선 실험](docs/evaluations/autoresearch-2026-09-27/README.md): 4개 변경안·336건 호출 후 첫 변경안만 채택했습니다. 이후 3회 연속 추가 개선이 없어 중단했으며, 새 holdout에서 회귀는 없었습니다.

[실제 코드 품질 비교·그래프](docs/evaluations/task-quality-2026-09-27/README.md): Codex gpt-6-astra의 48개 독립 실행을 저장·재검사했습니다. 세 지침 변경안은 모두 기준선과 동률이라 폐기했습니다. 작은 합성 과제군에서 품질 향상은 확인하지 못했으며, enforce 활성화 근거로 사용하지 않습니다.

[하향 추천 적용 시 토큰·예상 비용 비교](docs/evaluations/downshift-2026-09-28/README.md): 기본 xhigh와 Jev 추천 medium/high를 24회 실제 실행했습니다. 하향 추천된 4과제에서 검사 통과를 유지하며 출력 토큰 47.9% 감소를 관측했습니다. 공식 단가 예상 비용은 관측 캐시 기준 19.0%, 동일 캐시 비율 가정에서 13.1% 감소했으며 Jev 비용은 제외했습니다.

[Claude 하향 추천 적용 비교](docs/evaluations/downshift-claude-2026-09-28/README.md): Opus 5.5에서 같은 6과제를 Claude shadow 경로로 분류하고 하향 추천 4과제를 24회 실행했습니다. 검사 통과를 유지하며 출력 토큰 47.3%, CLI 보고 비용 41.3% 감소를 관측해 사전 합격선을 통과했습니다. enforce 활성화 승인은 아닙니다.

[Claude Code 동일 과제 비교 체크리스트·스크립트](docs/claude-quality-checklist.md): shadow 설치 확인과 CLI 명시적 effort 비교를 구분합니다. `node scripts/claude-quality.mjs plan eval/claude-quality/smoke.json`은 모델 호출 없이 실행 계획을 확인합니다. 실제 Claude 생성 검증은 아직 보류이며 enforce 구현을 의미하지 않습니다.
