# Codex CLI 실험적 enforce 프록시

기존 Codex CLI를 `--remote`로 연결해 **turn/start 전에** Jev 추천을 넣는 별도 실행기다.
MCP shadow 설치를 자동 전환하지 않으며 Claude 플러그인과도 별도다.
현재 검증 버전은 Codex 0.158.0, Node 22 이상이다. 기본 모드는 off다.

## 실행

저장소 루트에서 의존성을 설치한다.

```sh
npm ci --prefix codex
node codex/proxy.mjs
```

출력된 `codex --remote unix://.../proxy.sock` 명령을 다른 터미널에서 실행한다.
작업 경로가 다르면 `-C /absolute/project/path`를 붙인다. 이 상태는 off이므로 effort가 바뀌지 않는다.
한 프록시에 동시에 한 CLI만 연결하며 자체 STDIO App Server를 소유한다.
기존 daemon이나 이미 열린 VS Code/데스크톱 세션에 삽입하는 방식이 아니다.
새 테스트 세션에서 사용한다. 실행 중 세션의 중복 resume·fork·여러 클라이언트는 검증 범위 밖이다.

Jev 실험을 명시적으로 켜려면 Git에서 제외된 `.env`에 다음을 설정한다.

```dotenv
JET_ROUTER_MODE=enforce
JET_ROUTER_CLOUD_CONSENT=true
TYPESAFE_API_KEY=your-key
```

```sh
node --env-file=.env codex/proxy.mjs
```

키를 명령 인자나 채팅에 넣지 않는다. Node의 env-file 처리를 사용하며 shell로 source하지 않는다.
사용자 텍스트는 동의·키·모드·모델/후보 검사를 통과한 경우 Jev(TypeSafe)로 전송된다.
기존 MCP UserPromptSubmit shadow hook도 켜져 있으면 별도로 분류해 중복 호출할 수 있다.
이 실험에서는 해당 shadow hook을 비활성화한 설정을 사용한다. 실행기가 전역 hook 설정을 바꾸지는 않는다.

## 적용과 실패 처리

- 정확한 `gpt-6-astra` / `gpt-6-sol` 및 backend `model/list`로 확인한 effort 교집합만 허용한다.
  alias·미확인 모델, max, 비텍스트 입력, 활성 턴 입력은 자동 변경하지 않는다.
- 현재 모델·기준 effort는 같은 backend의 thread 상태와 제출한 요청에서 읽는다.
  MCP의 사용자 지정 참고값을 실제 값처럼 사용하지 않는다.
- Jev는 공통 요청/응답 검증기를 사용한다. 4초 기한·오류·잘못된 후보·keep이면 원래 요청을 보낸다.
- 실험적 구조 검사로 contextScore 0.5 미만은 유지, riskScore 0.5 이상에서는 하향을 막는다.
  이 경계값이 품질을 보장하거나 모델별로 보정됐다는 뜻은 아니다.
- 추천을 turn/start와 명시된 collaborationMode에 함께 넣고 응답은 즉시 CLI에 전달한다.
  이어 후속 턴 설정을 사용자 기준값으로 복귀시킨다. 복귀 전의 설정 변경/다음 턴은 직렬 처리한다.
- 분류 중 취소·수동 설정 변경은 추천을 폐기하고 해당 제출을 취소한다. CLI에 취소 오류를 반환하므로
  필요하면 새 설정에서 다시 제출한다. 이미 실행한 턴의 interrupt는 backend로 전달한다.
- 복귀 실패 시 같은 프록시 프로세스에서 해당 thread의 다음 turn/start를 차단한다.
  명시적인 `thread/settings/update`가 성공하면 차단을 해제한다. 확인 없이 자동 재시도하지 않는다.
- 연결 종료 시 이미 보낸 추천의 복귀를 시도한 뒤 자신이 띄운 backend만 종료한다.

프록시 터미널에 `[jet-router] Jev.enforce(): medium → low (experimental)`처럼 표시한다.
이 메시지는 backend의 시작 응답 기준이며 실제 모델 서비스의 wire 증거를 뜻하지 않는다.
프롬프트·키·원시 backend 오류는 로그로 출력하지 않는다.

## 중지와 복구 한계

프록시 터미널의 Ctrl-C로 종료한다. 정상 종료는 pending 복귀를 기다리지만 프로세스 강제 종료·호스트 장애로
복귀 자체가 불가능할 수 있다. 차단 기록은 메모리이며 **프로세스 재시작을 복구 증거로 취급하지 않는다**.
`restore-failed` 또는 backend 연결 끊김이 발생했다면 표시된 사용자 기준값을 확인하고,
일반 Codex에서 실제 세션 설정을 명시적으로 맞춘 뒤 재개해야 한다.
현재는 이런 장애에 대한 영속 복구 저널·자동 복구를 제공하지 않으므로 상시 운영 기능으로 권장하지 않는다.

이 실험을 종료하고 평소의 `codex` 명령으로 실행하면 프록시를 거치지 않는다.
전역 설정·사용자 기본값 파일·MCP 서버 설정을 자동 수정하지 않는다.

[어댑터 검증 기록](evaluations/codex-adapter-2026-09-28/README.md).

## 검증 범위

```sh
npm test --prefix codex
python3 scripts/probe-codex-start-proxy.py --adapter
npm test
```

- 어댑터 단위 검사: 분류 실패/기한, 동의/키/모델/후보, 기본값 복귀, 복귀 실패 차단,
  분류 중 및 제출 후 취소·disconnect, 수동 변경과 복귀의 순서, collaborationMode 보존.
- 실제 CLI + 실제 Codex App Server + 로컬 가짜 Responses 서버: 첫 요청 low, 다음 medium,
  수동 high 변경 후 low 적용과 다음 high 보존. 5턴 모두 완료.
- 통합 검사에서는 Jev 함수를 고정 응답으로 주입한다. runtime 환경변수로 fake 추천을 활성화하는 기능은 없다.
- 실제 Jev 1회 연결은 확인했지만 contextScore 검사로 low 추천이 보류되어 첫 요청은 medium이었다.
  [실호출 기록](evaluations/codex-live-jev-2026-09-30/README.md). 실제 모델 호출·품질·비용은 미검증이다.
  취소·복귀 실패·경쟁 상태는 단위 검사이며 실제 네트워크 장애 검증으로 확대하지 않는다.
- 실제 CLI의 `/model` 메뉴, 프로세스 크래시, 중복 resume, subagent 전파는 추가 검증이 필요하다.
  Claude 실호출은 토큰 한도로 계속 스킵한다.

[App Server 공식 문서](https://learn.chatgpt.com/docs/app-server)는 turn/start 설정이 이후 턴에도 남을 수 있음을 설명한다.
[프록시 선행 검증](evaluations/codex-start-proxy-2026-09-28/README.md)과 함께 제한을 확인한다.
