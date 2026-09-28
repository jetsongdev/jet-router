# Codex 턴 effort 적용 시점 검증

2026-09-28, Codex CLI/daemon 0.158.0. 제품 기준 소스 `e74f724`.

## 결론

**기존 UserPromptSubmit hook 이후의 `turn/settings/update`는 첫 요청부터 적용하는 enforce 요구를 충족하지 못했다.**
첫 HTTP 요청 전 변경 API가 `applied`를 반환했지만, 첫 요청은 기존 medium이었다.
도구 후 다음 요청은 low, 다음 사용자 턴은 medium이었다. 기본값은 보존됐으나
첫 요청 설정은 이미 고정된 것으로 해석된다. 이는 관측에 기반한 추론이며 내부 실행 경로 전체를 증명하지 않는다.

`applied`를 곧바로 “이번 턴 전체에 적용 완료”라고 표시하면 안 된다.

## proxy 원인과 해결

이전 JSONL probe는 전송 형식이 잘못됐다. `codex app-server proxy`는 stdio 바이트를
그대로 Unix socket에 복사하고, daemon은 그 소켓 위에서 WebSocket handshake를 사용한다.
WebSocket으로 연결하자 initialize와 지정 세션의 metadata 조회가 성공했다.
지정 세션은 `active`, 모델 gpt-6-astra, 설정 effort medium이었다. 사용자 턴은 변경하지 않았다.

공식 소스 확인 기준 `44fe510ce3ee61c8ef623adcbf89b901c73ddd61`:

- [stdio-to-uds 바이트 복사](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/stdio-to-uds/src/lib.rs)
- [daemon WebSocket 연결](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/app-server-daemon/src/client.rs)

실행 바이너리와 이 소스 커밋의 동일성은 증명하지 않았다. 실제 연결 성공이 별도 실행 근거다.

## 격리 실행 방법

```sh
python3 scripts/probe-codex-turn-effort.py
```

외부 Python 패키지 없이 실행한다. 설치된 `codex`와 Python 3, Unix socket 및 loopback listen 권한이 필요하다.
임시 CODEX_HOME에만 설정과 hook 신뢰 해시를 기록하고 자체 app-server를 실행한다.
가짜 Responses HTTP 서버가 도구 호출과 고정 `ok` 응답을 반환한다. 실제 OpenAI/Jev 모델 생성은 없다.
테스트가 끝나면 자체 서버를 종료하고, 임시 산출물 디렉터리를 출력한다.

스크립트는 다음을 검증한다.

1. 생성한 hook 하나의 hash만 신뢰한다. 전역 hook 신뢰 우회는 사용하지 않는다.
2. 새 세션의 기본 effort를 medium으로 둔다.
3. hook에서 입력을 받아 대기한다. hook session/turn ID와 App Server ID가 같은지 확인한다.
4. HTTP 요청이 아직 없음을 확인하고 low 변경 API를 호출한다.
5. hook을 해제하고 첫 요청 → 부작용 없는 가짜 동적 도구 → 두 번째 요청을 캡처한다.
6. 같은 세션에서 다음 사용자 턴을 실행한다. 완료 상태와 `medium, low, medium`을 assert한다.

**이 스크립트의 통과는 알려진 첫 요청 제한의 재현 성공이다. 제품 enforce 성공 테스트가 아니다.**
Codex 버전이 바뀌어 동작이 개선되면 assertion이 실패하므로 근거를 다시 검토한다.

## 결과

| 검사 | 관측 |
| --- | --- |
| 기능 플래그 없이 변경 | `turn settings updates require the step_model_switching feature` 오류 |
| 임시 설정에서 `features.step_model_switching = true` | 변경 API 사용 가능 |
| hook 대기 중 low 변경 | `status: applied` |
| 첫 턴 첫 요청 | medium |
| 첫 턴 도구 후 요청 | low |
| 첫 턴 후 thread 설정 | medium |
| 다음 사용자 턴 요청 | medium |
| 두 턴 완료 상태 | 모두 completed |

도구 없는 선행 검사도 `applied` 이후 `medium, medium`이었다.
도구 포함 검사는 임시 probe와 저장한 재현 스크립트에서 각각 같은 `medium, low, medium`을 관측했다.
저장 스크립트 종료 코드 0. [기계 판독 결과](evidence.json).

한계: command hook을 통제된 대기 지점으로 사용했다. 실제 jet-router MCP·Jev 연결, 실제 모델의
품질/비용, 사용자 TUI 조작, 취소·오류·수동 변경·모델 변경·subagent 전파는 검증하지 않았다.
로컬 가짜 서버에 도착한 HTTP 본문 증거를 실제 OpenAI 서비스 적용 증거로 확대하지 않는다.

## 다음 구현 판단

- MCP 유지 여부와 별개로 **첫 요청이 만들어지기 전** 추천값을 전달해야 한다.
- 다음 후보는 `turn/start` 직전의 클라이언트/프록시 어댑터다. 시작 요청의 사용자 기준값을 따로 보관하고
  추천 effort를 명시한다. 이 API는 다음 턴 기본값에도 영향을 줄 수 있으므로 복귀와 수동 변경을 검증해야 한다.
- 기존 hook 경로로 후속 요청만 변경하는 기능은 별도 제품 범위다. 현재 턴 전체 enforce로 출시하지 않는다.
- 기존 입력창을 유지할 수 있는 프록시 연결 방식부터 검증한다. 별도 입력창을 임의 도입하지 않는다.
