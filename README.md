# jet-router

기존 Claude Code 모델·대화·입력창을 유지하면서 프롬프트마다 필요한 effort를 선택하는 실험적 플러그인입니다.

**현재는 off/shadow 관찰 단계입니다.** 기본 `fake`는 고정 테스트 결과만 반환합니다. 명시적으로 설정한 Jev cloud shadow도 구현했으며 로컬 mock 검증을 마쳤습니다. 실제 Jev 호출·품질 평가는 아직 하지 않았고, 로컬 모델 연결과 effort 자동 변경(enforce)은 미지원입니다.

## 동작 원리

목표 흐름은 **사용자 입력 → Jev 추천 → 정책 검사 → 해당 턴의 요청 effort 적용**입니다.

- 기본 effort를 `high`로 고정하지 않습니다. 각 요청의 실제 effort를 읽습니다.
- 향후 enforce에서도 세션의 기본 설정은 유지하고, 해당 프롬프트로 시작한 한 턴에만 적용합니다.
- 한 턴 안에서 도구 호출로 모델 요청이 여러 번 발생하면 선택한 effort를 재사용하는 설계입니다.
- 다음 프롬프트에서는 직전 라우터 적용값을 이어받지 않고, 세션 설정을 반영한 요청 effort에서 새로 판단합니다.
- 현재 shadow는 추천만 관찰하며 모든 요청의 effort를 그대로 넘깁니다.

| 모드 | 현재 지원 | 동작 |
| --- | --- | --- |
| off | 지원·초기값 | 분류하지 않음 |
| shadow | fake·선택적 Jev | 추천 결과를 표시하고 원래 effort 유지 |
| enforce | 미지원 | 향후 정책을 통과한 추천을 해당 턴에 적용 |

## 시작하기

플러그인 코드가 있는 로컬 폴더를 지정합니다. 아래 경로는 실제 경로로 바꾸세요.

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
[jet-router] 관찰 · fake(테스트) · high 유지 · 추천 보류(맥락 부족) · 분류 0ms
```

이 문구는 실제 난도 분석 결과가 아니라 fake의 고정 결과입니다. 일반 Claude 응답에는 구독 사용량/API 비용이 발생할 수 있습니다. 기본 fake는 외부 요청을 보내지 않습니다. Jev는 별도 선택·전송 동의·키 설정 후 shadow에서만 현재 입력을 전송합니다.

**[전체 사용 가이드](docs/usage.md)**: 설정, 기존 대화에 적용하기, 로컬/공개 설치, 명령어, 메시지 예시, 중지·문제 해결.

## 검증과 지원 범위

Claude Code **2.1.283**에서 manifest와 오프라인 hook 테스트를 검증했습니다. Function hooks는 early access이며 다른 버전은 미검증입니다. Herdr와 SDD 문서는 실행에 필요하지 않습니다.

Jev helper 실행과 개발 검증에는 Node 22+가 필요하며 의존성 설치·빌드가 필요하지 않습니다.

```sh
npm test
npm run validate
npm run test:hooks
```

`test:hooks`는 임시 플러그인 사본의 fake/Jev 두 설정에서 설치된 Claude 테스트 도구를 실행합니다. 모델·UI·process를 mock하며 실제 키나 사용자 설정을 읽지 않습니다. 실제 provider 호출이나 대화 세션 검증과는 다릅니다.

- [공식 계약·호환성 조사](docs/compatibility.md)
- [구현 범위·검증 기록·남은 제한](docs/implementation.md)

현재 구현은 로컬 브랜치에 있으며 이 작업에서는 원격에 게시하지 않았습니다. 공개 설치 전에 코드 게시와 배포 라이선스 선택이 필요합니다.
