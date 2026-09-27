# 하네스 v2 실제 MCP/Jev 연결 확인

- 실행일: 2026-09-27, 대상 커밋: `75a49d9`
- 경로: MCP SDK client → 실제 STDIO server → 공통 하네스 v2 → helper → Jev
- 설정: shadow / Jev / 전송 동의 true / 사용자 참고 effort medium
- 테스트 폴더의 Node 실행 파일·서버·`--env-file` 경로를 사용했다. 키는 출력하거나 기록하지 않았다.
- 승인된 합성 프롬프트 3건을 순차 호출했다. 재시도 0회, stderr 0바이트.

| 입력 | 추천 | MCP callTool 왕복 시간 |
| --- | --- | --- |
| greeting의 Helllo → Hello 오타 수정 | low | 289ms |
| countItems의 null/undefined/배열/TypeError 처리와 node:test 작성 | medium | 297ms |
| limiter의 동기 throw/reject, 큐 진행, 동시 실행 수 및 오류 전달 검증 | high | 292ms |

세 응답 모두 continue=true와 허용된 추천 표시 형식을 반환했다.
시간은 클라이언트 측 MCP 호출 전체 구간이며 Jev 서버 처리 시간이나 청구량이 아니다.

## 검증 한계

- Codex 입력창의 UserPromptSubmit 훅을 이번 실행에서 호출한 것은 아니다.
  새 프로세스로 MCP 서버에 직접 연결했다. 이후 Herdr로 별도 검증한 결과는 아래에 기록한다.
- 실제 작업 모델을 실행하거나 effort를 변경하지 않았다. 추천 품질·토큰 절감 증거가 아니다.
- 사례별 1회 호출이다. 이전 수동 limiter 사례의 medium과 차이가 있지만,
  이번에는 기준도 v2로 변경되어 반복 안정성이나 개선의 증거로 해석하지 않는다.
- 반환 provider 모델 버전·실제 토큰·비용은 이 MCP 응답에서 확인하지 못했다.

[정규화 실행 결과](harness-v2-live-smoke-2026-09-27.json)


## 실제 Codex 입력창 확인 — Herdr

- 2026-09-27 22:25 KST, 오른쪽 테스트 pane `w10:p4`, agent `jet-router-smoke`.
- Codex 0.157.1을 테스트 폴더에서 새로 시작했다. 화면 모델은 GPT-6-Astra medium.
- 같은 greeting 오타 프롬프트 1건을 `herdr agent prompt`로 입력창에 제출했다.
- `herdr agent read --source recent-unwrapped`에서 다음을 확인했다:

```text
↳ Hook · [jet-router] Jev.shadow(): medium → low
```

Codex는 Hello로 수정한 함수 코드를 반환하고 idle로 돌아왔다. 턴 종료 후 화면 설정도 medium이다.
이는 native UserPromptSubmit → MCP → 새 하네스 → Jev → 표시 → 응답 흐름의 단일 사례 증거다.
실제 요청의 effort wire trace, 반복 안정성, Claude 입력창은 검증하지 않았다.
테스트 pane은 사용자가 확인할 수 있도록 열어 두었다.


## 같은 Codex 세션의 2·3번째 턴

같은 `jet-router-smoke` 세션에서 두 프롬프트를 순서대로 제출했다. 재시도는 하지 않았다.

| 턴 | 입력 | 실제 hook 안내 | 작업 결과 |
| --- | --- | --- | --- |
| 1 | 오타 | Jev.shadow(): medium → low | 수정 코드 반환 |
| 2 | countItems | Jev 생략: invalid-response · shadow | 수정 코드와 테스트 반환 |
| 3 | limiter | Jev.shadow(): medium → high | 수정 코드와 테스트 반환 |

- 각 입력에서 hook 안내가 다시 나왔다. 두 번째 실패 뒤에도 세 번째 Jev 추천이 정상 표시됐다.
- 세 턴 모두 Codex가 응답을 완료하고 idle로 돌아왔다. 화면 설정은 medium이었다.
- native 호출은 추천 성공 2/3, 응답 검증 거부 1/3이다. 전체 성공으로 기록하지 않는다.
- invalid-response는 정규화된 사유만 남으며 원문 응답/세부 검사 실패 지점은 보존하지 않는다.
  분포 합계, 후보, 점수 등 어느 검사에서 실패했는지 이 화면만으로 단정할 수 없다.
  앞선 MCP 직접 호출 3/3 성공과 구분한다.

Codex는 코드와 실행 명령을 출력했으며 직접 테스트를 실행하지 않았다.
검증자는 Herdr 출력에서 count-items/limiter의 코드와 테스트를 그대로 `/tmp/jet-router-native-output-wulb6mdt`에 추출했다.
`node --test <임시폴더>/count-items.test.mjs <임시폴더>/limiter.test.mjs` 종료 코드 0, 6/6 통과.
null/undefined, 배열, 잘못된 입력, FIFO/동시 실행 수 1, sync throw/reject 이후 큐 진행 및 원래 오류 전달을 검사했다.
이는 현재 Codex 설정의 생성 코드에 대한 로컬 테스트이며 Jev 추천 effort로 실행한 품질 비교가 아니다.
