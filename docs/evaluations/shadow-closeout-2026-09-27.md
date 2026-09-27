# Shadow 마무리 검증 — 2026-09-27

범위는 취소·복구, Codex 모델 지원 범위 연결, 회귀 검사다. enforce·병합·release는 제외한다.
Claude 실제 UI 검증은 사용자 토큰 부족으로 보류하며 mock 성공으로 대체하지 않는다.

## 취소와 다음 턴

- MCP SDK 2.1.0의 `ctx.mcpReq.signal`을 분류 함수와 helper 프로세스에 전달했다.
- 실제 SDK STDIO client의 요청 취소 → fixture classifier 취소 → 다음 요청 정상 반환을 검증했다.
- Codex 0.157.1 / Herdr 오른쪽 pane에서 **외부 Jev를 호출하지 않는 fixture**가 시작한 후 Escape를 보냈다.
  UI는 중단됐지만 fixture에 즉각적인 MCP 취소 신호는 관측되지 않았다.
- 서버 측 4초 제한 후 fixture의 `aborted`를 확인했다. 다음 턴에는
  `[jet-router] Jev.shadow(): medium → low (90%)`와 `OK`가 출력됐다.
  90%는 fixture의 고정 합성값이다. 실제 Jev 응답·품질 증거가 아니다.
- 기존 실제 helper도 HTTP 3초/프로세스 4초 제한이 있다. 이번 변경은 MCP 분류 경계에도
  제한과 취소 전달을 명시한다. 이미 전송한 HTTP 요청·비용 회수는 보장하지 않는다.
- 취소 후 늦은 결과 억제, 정리 전 single-flight 유지, 다음 턴 복구는 자동 테스트로 확인했다.
  실제 Jev HTTP 요청 진행 중 원격 서버가 중단됐는지는 검증하지 않았다.
- 테스트 fixture 실행은 종료했으며 사용자 설정 파일에는 fixture를 저장하지 않았다.

## Codex 모델·지원 effort

설치된 Codex 0.157.1의 별도 `app-server --stdio`에 initialize / model/list만 요청했다.
구현한 `discoverCodexModels()`로 재검증해 종료 코드 0, 7개 모델을 얻었다.
thread/turn 실행이나 작업 프롬프트 전송은 하지 않았다.

| 모델 | 이번 host 조회 결과 |
| --- | --- |
| gpt-6-astra, gpt-6-sol | low, medium, high, xhigh, max, ultra |
| gpt-6-luna, gpt-5.6-luna | low, medium, high, xhigh, max |
| gpt-5.6-sol, gpt-5.6-terra | low, medium, high, xhigh, max, ultra |
| gpt-5.5 | low, medium, high, xhigh |

이 표는 이 계정/host의 당시 관측값이며 코드에 고정하지 않았다. API 문서의 범위와
동일하다고 가정하지 않는다. `none/max/ultra`는 이번 추천 후보에 추가하지 않는다.

- 선택 옵션 `JET_ROUTER_CODEX_DISCOVERY=true`: MCP 시작 때만 조회한다.
- hook 예시에 `${model}` 추가. 전달된 정확한 slug의 지원값과 기존 후보를 교차하고 keep을 유지한다.
- 미확인 모델·조회 실패는 지원 정보 unknown인 기존 실험 shadow 경로를 유지한다.
- 참고 effort가 조회한 지원 범위 밖이면 분류를 생략한다. 실제 effort는 계속 미확인이다.
- 같은 세션의 새 hook에서 다른 모델이 관측되면 진행 중인 이전 결과를 폐기한다.
  추가 hook 없이 발생하는 모델 변경은 감지할 수 없다.
- 모델 필드/지원 후보/오래된 결과 폐기는 오프라인으로 검증했다.
  수정한 `${model}` hook의 실제 UI 재승인 및 모델 전환 시나리오는 아직 수동 검증 전이다.

공식 근거: [Hooks의 model 입력](https://learn.chatgpt.com/docs/hooks),
[App Server model/list](https://learn.chatgpt.com/docs/app-server).

## 후속 범위

Claude 실제 설치·UI, 수정한 모델 hook의 native 전환 검증, 실제 요청 effort trace,
Jev 추천 품질 비교는 남아 있다. shadow 구현 마무리와 제품 전체 검증 완료를 구분한다.


## 최종 회귀 검사

아래 명령은 모두 종료 코드 0이었다.

- `npm test`: 공통·Claude 단위 테스트 73개 통과.
- `npm --prefix mcp test`: MCP 테스트 29개 통과.
- `npm run test:hooks`: Claude 오프라인 hook 2개 통과.
- `npm run validate`: 플러그인·marketplace strict 검증 통과.
- `git diff --check`: 공백 오류 없음.

모델 지원 조회의 실패·잘못된 값·페이지 반복·시간 제한과 후보 제한,
모델 변경 후 이전 결과 폐기를 포함한다. 전체 결과는 실제 요청 effort 변경의 증거가 아니다.
