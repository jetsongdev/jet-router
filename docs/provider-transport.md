# Jev shadow 전송 방식 결정안

상태: **구현 전 검토안**. 실제 Jev 호출·키 접근·외부 전송은 하지 않았다.

## 조사 결과

공식 타입의 `HttpInit`에는 redirect, signal, timeoutMs, 최대 응답 크기 옵션이 없다.
설치된 Claude Code 2.1.283 바이너리의 내장 HTTP 코드를 읽기 전용으로 확인했다.

- 바이너리 SHA-256: `d8cb1e5c79684cc12a8bfc813e3a2073406921b6245744b3009be3ab5651d21e`
- 내장 HTTP 구현은 최대 5회 redirect를 따라간다.
- 301/302의 POST와 303은 GET으로 전환하고 본문을 비우지만, 307/308은 본문을 유지한다.
- origin이 달라지면 Authorization 등의 헤더는 제거하지만 POST 본문은 남을 수 있다.
- URL 검사에서는 HTTP/HTTPS와 URL 내 자격 증명 금지 등을 확인한다. 원래 origin 고정 검사는 확인되지 않았다.
- 호스트 자체의 30초 timeout과 4 MiB 크기 제한은 존재한다. 플러그인이 더 좁은 전송 제한을 지정하는 옵션은 없다.

이는 해당 바이너리에 대한 정적 조사다. 로컬 서버나 실제 TypeSafe 대상으로 redirect를 실행한 네트워크 검증은 아니다. 향후 Claude 업데이트에 그대로 적용되는 공식 안정 계약으로 취급하지 않는다.

기존 조사에서 “응답 크기 제한 옵션 없음”은 “호스트에 아무 크기 제한도 없음”이라는 뜻이 아니었다. 이번 조사로 호스트 기본 한계를 추가 확인했다.

## 추천안: 단발 Node 전송 helper

사용자 승인을 받은 뒤 다음 범위로 구현한다.

1. 기존 function hook과 `turn.step` 연결은 유지한다. effort를 바꾸기 위해 프록시·설정파일 편집·지시문 주입으로 대체하지 않는다.
2. 네트워크 요청 부분만 Node 기본 HTTPS 모듈을 사용하는 짧은 단발 helper로 분리한다. daemon·서버·추가 패키지는 없다.
3. Jev URL은 `https://api.typesafe.ai/v1/systemone`으로 고정한다. 모든 3xx를 거부하고 재시도·대체 provider·custom baseUrl을 제공하지 않는다.
4. helper는 입력과 응답을 크기 제한하고, 3초 제한에서 연결을 종료한다. 응답 본문은 최대 64 KiB이며 초과 시 실패한다. 이 값은 전송 가드 제안이며 품질 평가 임계값이 아니다.
5. 키와 입력은 argv에 넣지 않고 stdin으로 전달한다. helper의 stdout에는 allowlist된 결과만, 실패에는 고정 오류 코드만 출력한다. 키 저장 방식과 Claude의 process/debug 로그에서 stdin이 기록되는지도 연결 전에 검증한다.
6. 기본 provider는 fake, 기본 모드는 off를 유지한다. Jev 선택과 cloud 전송 동의가 모두 있어야 shadow에서 전송하며, 전송 내용·대상·취소 한계를 안내한다.
7. hook에서 결과 대기를 그만두는 것과 subprocess/서버 취소를 구분한다. 지원되지 않는 중단은 늦은 결과 폐기와 helper의 유한 timeout으로 제한하고 남는 요청·비용 가능성을 표시한다.

예상 변경 경로: `src/providers/jev.js`, `scripts/jev-request.mjs`, `hooks/register.js`, 플러그인 옵션·상태 표시, 관련 테스트와 사용 가이드. 이 경로들은 아직 생성·연결하지 않았다.

검증은 mock 응답으로 먼저 수행한다: 2xx 정상, malformed, 잘못된 수치, 3xx redirect 거부, timeout, 응답 초과, 키 없음, 전송 미동의, 중단·늦은 응답, stdout/stderr canary 미노출. 필요 시 비민감 loopback 서버로 helper만 검증하며 외부 API는 호출하지 않는다.

## 대안과 다음 승인

- 공식 API가 필요한 제어를 제공할 때까지 fake 유지: 가장 좁은 범위지만 Jev 연결은 보류된다.
- 위 단발 helper 도입: Node가 테스트 도구뿐 아니라 Jev 실행 의존성도 된다. 제어 가능한 전송을 확보하는 대신 subprocess 경계 검증이 추가된다.

고정 handoff의 “미지원이면 blocker로 보고하고 다른 방식으로 임의 대체하지 않는다” 경계를 따라 전송 방식 변경을 승인받기 전에는 연결하지 않는다.

helper 구현 승인은 실제 Jev 요청·비용·개인 작업 전송 승인이 아니다. 구현 후 합성 입력 목록, 호출 수, 비용 상한 및 키 입력 방법을 정리한 별도 live 평가 승인이 필요하다. enforce는 평가 기준과 결과 확인 이후에도 별도로 활성화한다.
