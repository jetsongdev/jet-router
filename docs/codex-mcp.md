# Codex MCP shadow 사용 가이드

현재 구현은 **로컬 STDIO MCP 서버 + Codex UserPromptSubmit hook 설정 예시**다.
MCP 연결·도구 호출은 오프라인 테스트로 검증했다. 실제 Codex hook 신뢰 승인,
이벤트 연결과 화면 표시는 아직 수동 확인 전이다. 기존 Claude 플러그인은 그대로다.
Codex용 marketplace 플러그인 패키지나 npm 공개 배포는 이번 범위에 포함하지 않는다.

## 동작과 제한

전체 비교는 [Claude Code·Codex 작동 다이어그램](architecture.md)을 참고한다.

```text
Codex 프롬프트 제출 → UserPromptSubmit → jet_router_shadow → 안내 → 정상 작업 계속
```

- 설치/설정 전에는 자동 호출되지 않는다. 연결된 MCP 서버와 신뢰한 hook이 필요하다.
- 이 서버는 모델·effort·설정 파일을 변경하지 않는다. `enforce`는 지원하지 않는다.
- 기본 실행은 `off` / `fake`다. 아래 예시는 연결 확인을 위해 `shadow` / `fake`를 명시한다.
- `fake`는 항상 keep을 반환하는 테스트 결과다. 실제 난도 판정이 아니다.
- Codex hook에는 현재 effort가 문서화되어 있지 않다. Jev의 필수 입력에는 사용자가
  지정한 **참고 effort**를 사용하며, 이것을 현재 적용값이라고 표시하지 않는다.
- 현재 모델의 지원 effort를 조회하지 않는다. 추천은 미평가이며 적용 가능한 값이라는 보장도 없다.
- 안내는 입력 시점의 hook `systemMessage`다. Claude처럼 답변 종료 후 footer가 아니다.
  Codex는 이를 UI 경고/이벤트로 처리하며 실제 배치는 클라이언트에서 확인해야 한다.
- transcript, 파일, 이전 대화, 첨부 내용은 읽지 않는다. 텍스트만 평가하므로 후속 지시나
  첨부가 있는 작업의 맥락이 부족할 수 있다. Claude의 첨부/subagent/현재 max 감지와 동일하지 않다.
- Jev helper의 HTTPS 제한과 파서를 재사용한다. 3초 HTTP 절대 제한, 4초 프로세스 제한,
  5초 hook 설정이며 실패 시 재시도·fake fallback 없이 생략한다.
- 동시 Jev 분류는 프로세스당 1개다. 겹친 호출은 생략하며 대기열에 쌓지 않는다.
  최근 256개의 session_id/turn_id만 메모리에 보관해 중복 호출·표시를 억제한다.
  재시작·다른 MCP 프로세스·256개 이후에는 중복 억제가 보장되지 않는다.
- 키·입력·원시 응답을 로그에 쓰지 않는다. Codex 자체의 transcript/MCP 기록 보관 정책은 별개다.
  hook timeout/사용자 취소/중지는 이미 전송한 요청이나 비용을 회수하지 않는다.

## 1. 설치와 fake 연결

Node 22+가 필요하다. 저장소 전체를 받은 뒤 루트에서 실행한다. MCP 패키지에만 의존성이 추가되며
기존 Claude 실행에는 이 설치가 필요 없다.

```sh
npm --prefix mcp ci --ignore-scripts
npm --prefix mcp test
```

[설정 예시](../examples/codex/config.toml)의 내용을 사용할 Codex host의
`~/.codex/config.toml` 또는 신뢰한 프로젝트의 `.codex/config.toml`에 병합한다.
**기존 파일을 덮어쓰지 않는다.** 서버 경로를 해당 기기의 절대 경로로 바꾼다.
GUI에서 `node`를 찾지 못하면 `command`도 `which node`로 확인한 절대 경로로 바꾼다.

같은 hook을 전역·프로젝트·hooks.json에 중복 등록하지 않는다. 예시의 이름은
MCP 서버 `jet_router`, 도구 `jet_router_shadow`다. 이름을 바꾸면 양쪽을 함께 변경한다.

Codex를 재시작하고 `/mcp`에서 연결을 확인한다. `/hooks`에서 새 hook의 정의를 검토하고
신뢰한다. 정의 변경 후에는 재검토가 필요할 수 있다. hook 신뢰는 별도의 Codex 절차이며
MCP 등록만으로 자동 승인되지 않는다.

합성 프롬프트 하나를 보내면 다음 안내를 기대한다. **실제 UI 검증 전의 예상 표시**다.

```text
[jet-router] shadow · fake(테스트) · 추천 keep(고정값) · 실제 effort 미확인·변경 없음
```

별도 MCP 호출을 모델에게 요청할 필요는 없다. 이 도구는 hook용이며 모델이 자율적으로
추가 호출하지 않도록 서버 지침에 명시한다. 단, 도구 입력의 event id는 인증 정보가 아니다.
클라이언트가 도구를 직접 호출해도 서버의 동일한 설정·동의 조건이 적용된다.

## 2. Jev로 전환

합성 입력의 외부 전송과 TypeSafe API 비용에 동의할 때만 활성화한다.
MCP hook은 매 호출마다 도구 승인 창을 띄우지 않으므로, **활성화 이후 제출하는 텍스트가
자동 전송될 수 있다는 점을 먼저 확인한다.** 설정 변경 후 서버/Codex를 재시작한다.

기존 `[mcp_servers.jet_router]`에 다음 항목을 추가한다.

```toml
env_vars = ["TYPESAFE_API_KEY"]
```

기존 `[mcp_servers.jet_router.env]`는 다음처럼 수정한다.

```toml
JET_ROUTER_MODE = "shadow"
JET_ROUTER_PROVIDER = "jev"
JET_ROUTER_CLOUD_CONSENT = "true"
JET_ROUTER_REFERENCE_EFFORT = "medium"
```

`medium`은 예시다. 참고값은 `low` / `medium` / `high` / `xhigh` / `max` 중 직접 선택한다.
누락·알 수 없는 값이면 분류하지 않으며 `max`도 보호를 위해 생략한다.
Codex에서 effort를 바꿔도 이 참고값은 자동으로 동기화되지 않는다.

`TYPESAFE_API_KEY`는 Codex를 실행하는 프로세스 환경으로 전달한다. 터미널 zsh에서는
키를 명령 인자로 쓰지 않고 다음처럼 입력할 수 있다.

```zsh
read -rs 'TYPESAFE_API_KEY?TypeSafe API key: '
printf '\n'
export TYPESAFE_API_KEY
codex
unset TYPESAFE_API_KEY
```

GUI 클라이언트는 이 터미널 환경을 자동 상속하지 않을 수 있다. 사용하는 host의 환경 전달 방법을
확인한다. 키를 Git 파일·hook 입력·채팅·명령 인자에 넣지 않는다.
**이 서버는 프로젝트 `.env`를 자동으로 읽지 않는다.** Claude Configure options와도 공유하지 않는다.

예상 안내:

```text
[jet-router] shadow · Jev · 참고 medium(사용자 지정) · 추천 low(미평가) · 실제 effort 미확인·변경 없음
[jet-router] shadow · Jev 생략: 전송 미동의 · 실제 effort 미확인·변경 없음
```

## 3. 중지와 문제 해결

- 중지: 서버 설정의 `JET_ROUTER_MODE = "off"`로 바꾸고 재시작하거나 `/hooks`에서 이 hook을 비활성화한다.
  Claude의 `/jet-router off`, lock/unlock 명령은 Codex에는 없다.
- 연결 오류: 절대 경로, Node 버전, `npm --prefix mcp ci` 완료, `/mcp` 상태를 확인한다.
- 안내 없음: off, 미신뢰/비활성 hook, 서버 미연결, 중복 이벤트 가능성을 확인한다.
- 서버 미연결·도구 오류는 공식 hook 계약상 원래 작업을 막지 않는다. 서버는 정상 결과에 항상
  `continue: true`만 반환하며 `decision: block`, `additionalContext`, effort 변경 명령을 만들지 않는다.
- Jev 생략: 전송 동의·환경변수 키·참고 effort·5초 제한을 확인한다. 자동 재시도하지 않는다.

## 4. 검증 기록과 수동 체크리스트

2026-09-27, Node 23.11.0에서 MCP 테스트 18개와 공통·Claude 테스트 45개/hook mock 2개 통과.
공식 SDK v2.1.0, Zod v4.6.5를 잠금 파일로 고정했다. Codex CLI 0.157.1의 설치된 스키마에는
`mcpTool` hook이 존재한다. 이것은 실제 hook 실행·화면 표시·실제 요청 effort 증거와 구분한다.
이번 작업에서는 실제 키 조회, Jev/OpenAI 실호출, 사용자 설정 변경을 하지 않았다.

오프라인 재검증:

```sh
npm --prefix mcp test
npm test
npm run test:hooks
npm run validate
```

실사용 확인 전에는 아래 항목을 완료로 표시하지 않는다.

- [ ] `/mcp`: 서버 연결 및 `jet_router_shadow` 도구 확인.
- [ ] `/hooks`: UserPromptSubmit 정의·신뢰·활성 상태 확인.
- [ ] fake로 한 입력당 안내 1회, 실제 UI 위치 확인.
- [ ] 한 세션에서 연속 프롬프트 3개가 각각 처리되는지 확인.
- [ ] Codex effort medium/high/xhigh 변경과 무관하게 현재 effort를 추정해 표시하지 않는지 확인.
- [ ] off 또는 hook 비활성화 후 안내·분류가 멈추는지 확인.
- [ ] 서버 미연결 상태에서도 원래 Codex 작업이 계속되는지 확인.
- [ ] Jev 미동의/키 누락/참고 effort 누락에서 생략 확인.
- [ ] 명시적 전송 동의 후 합성 입력 1건으로 Jev 안내 확인; 실패하면 반복하지 않고 기록.
- [ ] 취소·겹친 입력·첨부/후속 지시에서 안내 의미와 한계 확인.
- [ ] 요청 추적 증거가 있다면 실제 effort 불변을 확인; UI 설정 표시만 있으면 unknown으로 기록.

## 근거와 다음 단계

- [Codex Hooks 공식 문서](https://learn.chatgpt.com/docs/hooks): MCP hook, 신뢰, 입력, 출력, 실패 처리.
- [Codex MCP 공식 문서](https://learn.chatgpt.com/docs/extend/mcp?surface=cli): STDIO 설정과 환경 전달.
- [공식 설정 스키마](https://learn.chatgpt.com/docs/config-schema.json): 예시 설정의 필드 검증 기준.
- [공식 MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk): 프로토콜·스키마·STDIO 처리.

실제 적용은 별도의 [App Server](https://learn.chatgpt.com/docs/app-server) 제어 클라이언트가 필요하다.
`turn/start.effort`는 이후 턴의 기본값에도 영향을 준다. 따라서 향후 enforce에서는 사용자 기본값과
수동 변경을 따로 추적하고 매 턴 명시적으로 적용해야 하며, 이번 MCP 서버로 자동 복귀를 보장하지 않는다.
