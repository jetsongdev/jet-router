# subagent 단계 effort 변경 경로 확인

상태: **적용 경로 동작 확인**. subagent 전파 구현·승인이나 추천 품질 평가가 아니다. 메인 턴 경로는 [적용 경로 확인](enforce-path-2026-09-28.md)에 있다.

## 질문

메인 턴에서 적용한 effort를 같은 턴이 만든 subagent에도 넘길 수 있는가.

1. subagent 단계가 자신을 만든 메인 턴과 연결되는가.
2. subagent는 지금 어떤 effort로 요청하는가.
3. subagent 단계에서 effort를 바꾸면 서버가 바뀐 값으로 처리하는가.

## 방법

- Claude Code 2.1.283, Opus 5.5(`claude-opus-5-5`), jet-router 0.9.0(`feat/effort-router` @ `6b06f21`).
- 제품 코드는 바꾸지 않았다. 일회용 프로브 플러그인 두 가지를 `--plugin-dir`로 추가 로드했다.
  - 기록: `turn.start`·`turn.step`·`turn.complete`의 필드 이름·turnId·agentId·effort·출력 토큰만 남긴다. 프롬프트·답변 텍스트는 남기지 않는다(`turn.start`는 텍스트 길이만).
  - 재작성: 기록과 같고, `agentId`가 있는 단계만 `next({ ...e, effort: 'low' })`로 넘긴다. 메인 단계는 건드리지 않는다.
- headless `claude -p --effort xhigh --allowedTools Agent`. 메인에게 general-purpose subagent 1개를 띄워 코딩 과제(괄호 균형 검사 함수 + assert 테스트 6개, 도구·파일 쓰기 금지)를 그대로 시키고 첫 줄만 전달하게 했다. 새 세션마다 한 번씩, 두 조건을 번갈아 3회씩 실행했다.
- 설치된 jet-router는 `--settings`로 `defaultMode=off`를 덮어써 함께 로드했다. 실험 뒤 사용량 로그에 실험 경로의 기록이 없고 settings가 백업과 같음을 확인했다.
- 모델 호출: headless 7회. 결과에 쓴 것은 6회이고, 1회는 `turn.step` 훅을 generator가 아닌 함수로 써서 기록이 남지 않아 버렸다. Jev 호출은 없다.

## 결과

### 이벤트와 연결

한 실행의 순서(재작성 조건, 텍스트 없음):

| 순서 | 훅 | turnId | agentId | effort 입력 → 전송 | 출력 |
| --- | --- | --- | --- | --- | ---: |
| 1 | `turn.start` | 메인 A | – | – | – |
| 2 | `turn.step` #0 (Agent 호출) | 메인 A | – | xhigh → xhigh | 309 |
| 3 | `turn.step` #0 | subagent B | 있음 | xhigh → low | 759 |
| 4 | `turn.step` #1 | subagent B | 있음 | xhigh → low | 215 |
| 5 | `turn.complete` | subagent B | – | – | 974 |
| 6 | `turn.step` #1 | 메인 A | – | xhigh → xhigh | 388 |
| 7 | `turn.complete` | 메인 A | – | – | 697 |

- subagent는 **메인과 다른 turnId**를 받고 자기 `turn.complete`가 따로 온다. 단계 필드는 `agentId, effort, index, messageCount, model, turnId`로, 부모 턴을 가리키는 값이 없다.
- subagent에는 **`turn.start`가 오지 않는다.** subagent 지시문 텍스트는 턴 훅에서 보이지 않는다.
- 동기 subagent는 메인 턴의 Agent 호출 단계와 다음 단계 **사이에** 전부 실행됐다. 연결 근거는 필드가 아니라 이 순서뿐이다.
- 메인 `turn.complete`의 usage(697)에는 subagent 출력(974)이 **포함되지 않는다.** 현재 사용량 기록은 메인 턴만 센다.

### 현재 effort

subagent 단계의 입력 effort는 세션 값(xhigh) 그대로였다. [적용 경로 확인](enforce-path-2026-09-28.md)의 경계 조건 결과(메인 low여도 subagent는 세션 값)와 같다.

### 서버 동작

subagent 단계 출력 토큰 합계, 각 3회:

| 조건 | 1 | 2 | 3 | 평균 | transcript `effort` |
| --- | ---: | ---: | ---: | ---: | --- |
| 그대로(xhigh) | 1,644 | 2,537 | 1,500 | 1,894 | xhigh |
| subagent 단계만 low | 974 | 522 | 1,118 | 871 | low |

재작성 조건이 약 46%이고 subagent transcript의 assistant 항목도 전부 low로 기록됐다. 기록 필드만 바뀐 것이 아니라 서버가 low로 처리했다고 판단한다. 메인 출력은 두 조건 모두 609~962 범위로 차이가 없다.

## 추가 확인: 인터랙티브 병렬 subagent와 `/subtask`

0.9.1 설치 상태에서 인터랙티브 세션 하나에 기록용 프로브를 붙여 확인했다(jet-router는 `--settings`로 off, Jev 호출 없음).

| 경우 | 관측 |
| --- | --- |
| 병렬 subagent 2개 | 인터랙티브에서는 subagent가 **백그라운드로** 실행됐다. 메인 턴은 Agent 호출 단계 다음 단계를 마치고 먼저 끝났고, subagent 단계는 그 뒤에도 이어졌다. 두 subagent의 **첫 단계는 메인 턴이 진행 중일 때**(Agent 호출 단계 종료 후 약 0.03초, 메인 턴 종료 약 2초 전) 시작했다. 완료 보고는 `peer`·`task-notification` 출처의 별도 메인 턴으로 들어왔다. |
| `/subtask` | `prompt.submit`·`turn.start`·메인 턴 없이 agent 단계(`agentId` 형식 `a3-…`)만 들어왔다. 지시문 텍스트와 이어받을 메인 턴이 모두 없다. |
| subagent `turn.complete` | 필드에 `agentId`가 있고 usage는 그 subagent 턴 합계다. |

## 전파 설계에 주는 요구사항

- subagent 단계의 `next({ ...e, effort })` 재작성은 메인 턴과 같은 방식으로 동작한다.
- 부모 턴 필드가 없으므로 연결은 **agentId의 첫 단계가 올 때 진행 중인 메인 턴**에 묶는 방식이어야 한다. 한 번 묶은 agentId는 이후 단계에서 다시 판단하지 않는다.
- 진행 중인 메인 턴이 없으면(연결 불확실) 넘기지 않는다. `/subtask`는 이 경우라 턴 훅만으로는 대상이 될 수 없다.
- 백그라운드 subagent는 메인 턴이 끝난 뒤에도 단계가 이어지므로 묶은 값은 subagent 턴의 `turn.complete`까지 유지해야 한다.
- 알려진 오연결: 메인 턴이 도는 동안 사용자가 `/subtask`를 띄우면 그 subtask도 메인 턴에 묶인다. 구분할 필드가 없다(⚠️ 미확인 대안: `agentId` 형식).
- subagent 사용량은 subagent의 `turn.complete`에서 따로 받을 수 있다. 메인 턴 합계에 더하면 이중 집계가 아니라 누락 보완이지만, 구분 기록이 필요하면 별도 레코드로 남길 수 있다.

## 한계

- subagent 안의 subagent, subagent 실행 중 `/effort` 변경은 확인하지 않았다.
- 과제 1개·3회 비교라 품질·비용 평가가 아니다. subagent에 메인 추천을 넘겼을 때의 품질은 별도 평가가 필요하다.
- 서버 반영(출력 토큰 비교)은 headless 동기 subagent에서만 확인했다.
