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
  새 프로세스로 MCP 서버에 직접 연결했다. Codex 재시작 후 화면 표시 확인은 별도다.
- 실제 작업 모델을 실행하거나 effort를 변경하지 않았다. 추천 품질·토큰 절감 증거가 아니다.
- 사례별 1회 호출이다. 이전 수동 limiter 사례의 medium과 차이가 있지만,
  이번에는 기준도 v2로 변경되어 반복 안정성이나 개선의 증거로 해석하지 않는다.
- 반환 provider 모델 버전·실제 토큰·비용은 이 MCP 응답에서 확인하지 못했다.

[정규화 실행 결과](harness-v2-live-smoke-2026-09-27.json)
