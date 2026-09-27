# jet-router 사용 가이드

## 1. 현재 가능한 것

현재는 **fake 기반 off/shadow 미리보기**입니다. Jev API 키가 필요하지 않으며, 키를 받거나 다른 provider로 자동 전환하지 않습니다. `fake`는 요청을 분석하지 않고 설정된 고정값만 반환합니다.

실제 Jev 연결과 자동 적용(enforce)은 준비 중입니다. 아래 자동 적용 설명은 목표 동작이며 현재 실행 결과가 아닙니다.

## 2. 기본 effort와 프롬프트별 적용

기본 effort는 사용자 설정에 따라 `medium`, `high`, `xhigh` 등이 될 수 있습니다. 라우터는 설정 파일에서 기본값을 추측하지 않고 각 `turn.step`에 들어온 값을 읽습니다.

향후 enforce는 **기본 설정을 바꾸지 않고 한 프롬프트의 턴에만 적용**합니다. “1회 적용”은 모델 HTTP 요청 한 번이 아니라, 해당 프롬프트의 답변이 끝날 때까지 이어지는 도구 루프를 포함합니다.

예를 들어 세션 설정이 `high`인 경우의 목표 동작입니다.

| 프롬프트 | 요청에 들어온 기준값 | 정책 통과 후 턴별 적용 예 |
| --- | --- | --- |
| 오타 수정 | high | low |
| 일반 기능 구현 | high | medium |
| 복잡한 버그 분석 | high | xhigh |

첫 턴에 `low`를 적용해도 다음 프롬프트의 기본값이 `low`로 바뀌지는 않습니다. 사용자가 세션 설정을 `medium`으로 바꾸면 이후 요청에 들어오는 `medium`을 기준으로 판단합니다.

같은 턴에서는 선택한 effort를 재사용하되 수동 조작을 존중해야 합니다. 현재 계약에서는 수동 설정의 출처를 완전히 식별하지 못하므로, 수동 제어가 필요하면 먼저 `/jet-router lock` 또는 `/jet-router off`를 사용합니다. 실제 자동 적용과 수동 변경의 우선순위는 enforce 구현·검증 단계에서 확인해야 합니다.

현재 shadow에서는 위 표의 적용을 하지 않고 요청 effort를 그대로 유지합니다.

## 3. 로컬 폴더에서 적용하기

### 사전 확인

```sh
claude --version
```

오프라인 검증 버전은 `2.1.283`입니다. 플러그인은 Claude가 실행되는 머신에 있어야 합니다. Herdr에서 SSH로 원격 머신의 Claude를 사용하는 경우 로컬 Mac의 파일·설정만으로 원격 Claude에 적용되지 않습니다.

### Function hooks 활성화

기존 `~/.claude/settings.json`의 `env`에 아래 항목을 병합합니다. 파일 전체를 이 예시로 덮어쓰지 마세요. 이미 추가했다면 다시 수정할 필요가 없습니다.

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

설정을 저장하지 않고 한 프로세스에서만 켜려면 실행 명령 앞에 환경 변수를 지정합니다.

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /absolute/path/to/jet-router
```

`/absolute/path/to/jet-router`는 `.claude-plugin/plugin.json`이 있는 폴더입니다. 현재 개발 worktree를 테스트한다면 그 worktree 경로를 사용합니다. 실제 작업할 프로젝트의 디렉터리에서 실행하면 됩니다.

`--plugin-dir`는 해당 세션에만 플러그인을 로드합니다. 전역 marketplace 설치는 필요하지 않습니다. 패키지 설치나 빌드도 필요하지 않습니다. [공식 플러그인 안내](https://code.claude.com/docs/en/plugins)

### 기존 대화 이어서 사용하기

이미 실행 중인 Claude 프로세스에 새 CLI 옵션을 소급 적용할 수는 없습니다. 작업을 정리하고 종료한 뒤, 같은 프로젝트에서 대화를 선택해 재개하는 CLI 형태는 다음과 같습니다.

```sh
claude --resume --plugin-dir /absolute/path/to/jet-router
```

활성화 환경 변수를 설정하지 않았다면 앞에 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`을 붙입니다. 이 조합의 실제 대화 재개는 아직 수동 검증하지 않았습니다. 시작 후 `/jet-router status`로 로드 여부를 확인합니다. 새로 시작·재개한 세션의 라우터는 항상 off입니다.

## 4. 사용 순서와 명령어

1. `/jet-router status`로 초기 off 상태를 확인합니다.
2. `/jet-router shadow`로 관찰 모드를 켭니다.
3. 일반 프롬프트를 입력하고 답변이 끝나면 요약 줄을 확인합니다.
4. 관찰을 끝내려면 `/jet-router off`를 실행합니다.

| 명령 | 동작 |
| --- | --- |
| `/jet-router status` | 현재 모드·잠금·분류기·외부 전송 여부·최근 완료 결과 |
| `/jet-router shadow` | fake 추천 관찰 시작, 실제 effort 변경 없음 |
| `/jet-router off` | 분류 중지, 진행 중 판단 무효화 |
| `/jet-router lock` | 현재 모드를 유지하며 분류 일시 정지 |
| `/jet-router unlock` | 잠금 해제. off였다면 계속 off |
| `/jet-router enforce` | 아직 사용할 수 없다는 안내만 출력 |

`on` 명령은 없습니다. 잠금 상태에서 shadow를 선택해도 잠금은 유지됩니다. 상태의 “최근 완료”는 이전 턴 기록이며 현재 모드와 다를 수 있습니다. 새 세션에서 초기화됩니다.

## 5. 추천 테스트값 바꾸기

`fakeChoice` 옵션은 `keep`(기본값), `low`, `medium`, `high`, `xhigh`를 받습니다. 잘못된 값은 `keep`으로 처리합니다.

설치된 플러그인은 `/plugin`의 Installed에서 jet-router를 선택하고 **Configure options**에서 값을 바꿀 수 있습니다. 변경 후 Claude가 안내하는 reload/재시작 절차를 따릅니다. 이 플러그인의 설정 UI 경로는 아직 수동 실행하지 않았습니다. [공식 관리 방법](https://code.claude.com/docs/en/discover-plugins#manage-installed-plugins)

기본 `keep` fixture는 맥락 충분 여부를 false로 반환하므로 “추천 보류(맥락 부족)”라고 표시합니다. `low`로 설정하면 모든 분류 대상에 low를 추천합니다. 어느 쪽도 실제 요청의 난도를 판단한 결과는 아닙니다.

## 6. 메시지 읽기

응답 본문을 수정하지 않고 메인 턴 종료 후 별도의 로그 한 줄을 출력합니다. 도구 요청마다 중복 출력하지 않습니다. 아래 시간은 예시입니다.

추천이 있어도 shadow에서는 원래 effort를 유지합니다.

```text
[jet-router] 관찰 · fake(테스트) · high 유지 · 추천 low · 분류 12ms
[jet-router] 관찰 · fake(테스트) · medium 유지 · 추천 xhigh · 분류 9ms
```

분류를 보류·생략·실패한 경우를 구분합니다. 분류를 생략했으면 지연값도 표시하지 않습니다.

```text
[jet-router] 관찰 · fake(테스트) · high 유지 · 추천 보류(맥락 부족) · 분류 8ms
[jet-router] 관찰 · fake(테스트) · max 유지 · 분류 생략(max 보호)
[jet-router] 관찰 · fake(테스트) · high 유지 · 추천 없음(시간 초과) · 분류 1000ms
```

timeout은 실패 경로의 표시 예시이며 정상 fake는 즉시 결과를 반환합니다. 분류 이후 턴이 중단되면 끝에 `중단`이 붙습니다. 분류 완료 전에 중단되었거나 off·잠금·세션 전환으로 결과가 무효화됐다면 요약은 생략될 수 있습니다.

```text
[jet-router] 관찰 · fake(테스트) · high 유지 · 추천 low · 분류 12ms · 중단
```

상태 조회 예시입니다.

```text
jet-router
모드: 관찰(shadow) — 추천만 표시
분류기: fake(고정 테스트 결과) · 외부 전송: 없음
수동 잠금: 꺼짐
effort 자동 변경: 미지원
최근 완료: [jet-router] 관찰 · fake(테스트) · high 유지 · 추천 low · 분류 12ms
```

향후 enforce 표시안은 다음과 같습니다. **현재 출력되거나 적용되는 기능은 아닙니다.**

```text
[jet-router] 자동 · Jev · medium → low 적용 · 분류 180ms
[jet-router] 자동 · Jev · xhigh → high 적용 · 분류 140ms
[jet-router] 자동 · Jev · high 유지 · 추천 low 미적용(위험 작업) · 분류 170ms
```

`유지`는 라우터가 다음 훅에 넘긴 요청값을 설명합니다. 서버 수신이나 모델 내부 추론량을 증명하지 않습니다. 지연은 전체 Claude 응답 시간이 아니라 분류 대기 시간입니다. 신뢰도·비용 절감량은 현재 표시하지 않습니다.

## 7. 로컬 marketplace 설치와 향후 공개 설치

폴더 직접 로드가 아닌 설치 방식이 필요할 때만 사용합니다. 다음은 Claude 세션 안에서 실행하는 명령이며 사용자 설정·설치 상태를 변경합니다.

```text
/plugin marketplace add /absolute/path/to/jet-router
/plugin install jet-router@jet-router
```

원격 코드와 manifest를 게시한 이후에는 다음 형태로 설치할 수 있습니다. **현재 로컬 구현을 이 작업에서 원격에 푸시하지 않았으므로 지금 사용 가능한 배포 명령으로 보장하지 않습니다.**

```text
/plugin marketplace add jetsongdev/jet-router
/plugin install jet-router@jet-router
```

설치 범위를 확인하고, 로드가 보류되면 화면의 안내를 따릅니다. GitHub marketplace 추가 및 설치 형식의 근거는 [공식 설치 문서](https://code.claude.com/docs/en/discover-plugins#add-a-marketplace)입니다. 이 두 설치 절차는 jet-router에서 실제 실행하지 않았습니다.

## 8. 중지와 문제 해결

| 상황 | 확인할 내용 |
| --- | --- |
| `/jet-router` 명령이 없음 | 폴더 경로, 활성화 환경 변수, `/plugin`의 Errors, 실행 버전 |
| 추천 줄이 안 나옴 | off 또는 lock인지, 턴이 끝났는지, 입력이 생략 조건에 해당하는지 |
| 늘 같은 추천이 나옴 | fake의 정상 동작. Jev 분류가 아님 |
| high가 low로 안 바뀜 | 현재 shadow는 추천만 표시함 |
| 새 세션에서 꺼져 있음 | 초기값 off가 정상. 필요할 때 shadow 실행 |
| 변경한 코드가 안 보임 | 최신 worktree 경로인지 확인하고 세션을 다시 로드 |

큐에 넣은 입력, 턴 도중 추가 입력, 중복 제출, 첨부파일, 추가 숨은 문맥, 비사용자 출처, 다른 훅에서 수정된 입력, 6,000자 초과 입력, 불명확한 턴 연결은 보수적으로 건너뜁니다. subagent·max·미지원 effort도 분류하지 않습니다.

즉시 관찰을 중지하려면 `/jet-router off`를 사용합니다. 직접 로드한 플러그인을 제외하려면 다음 실행에서 `--plugin-dir`를 빼세요. marketplace로 설치했다면 `/plugin`에서 jet-router를 비활성화하거나 제거합니다. 라우터를 중지하려고 다른 플러그인도 사용하는 function-hook 환경 변수를 일괄 제거할 필요는 없습니다.

프롬프트·키·오류 본문은 요약에 넣지 않고 별도 로그 파일도 만들지 않습니다. UI 로그는 Claude 자체 대화 기록에 남을 수 있습니다. 라우터는 외부로 보내지 않지만, 일반 Claude 응답에는 원래 서비스 사용량·비용이 적용됩니다.

## 9. 개발 검증

플러그인 폴더에서 실행합니다. Node 22+가 필요하며 의존성 설치는 필요하지 않습니다.

```sh
npm test
npm run validate
npm run test:hooks
```

현재 기록은 단위 테스트 24개와 Claude 오프라인 hook 테스트 1개 통과입니다. 실제 터미널 표시, 기존 대화 재개, marketplace 설치, Jev/live 모델 호출은 검증하지 않았습니다. 자세한 범위는 [구현 기록](implementation.md), 공식 계약의 한계는 [호환성 조사](compatibility.md)를 참고하세요.
