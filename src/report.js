// Only normalized router records reach these formatters, never provider text.
export function summary(record, outcome) {
  const effort = record.forwarded === 'unsupported' ? 'effort 확인 불가'
    : record.original === record.forwarded ? `${record.forwarded} 유지`
    : `시작 ${record.original === 'unsupported' ? '미확인' : record.original} → 마지막 요청 ${record.forwarded}`;
  const reasons = {
    'no-consent': '분류 생략(외부 전송 미동의)',
    'missing-key': '분류 생략(API 키 없음 또는 형식 오류)',
    busy: '분류 생략(이전 요청 정리 중)',
    redirect: '추천 없음(redirect 차단)',
    'http-error': '추천 없음(API 오류)',
    'response-too-large': '추천 없음(응답 크기 초과)',
    'invalid-input': '분류 생략(입력 형식 오류)',
    unevaluated: `추천 ${record.recommendation === 'keep' ? '유지' : record.recommendation}(미평가)`,
    context: '추천 보류(맥락 부족)',
    timeout: '추천 없음(시간 초과)',
    'provider-error': '추천 없음(분류 실패)',
    'invalid-response': '추천 없음(응답 형식 오류)',
    correlation: '분류 생략(요청 연결 불확실)',
    max: '분류 생략(max 보호)',
    unsupported: '분류 생략(effort 미지원)',
  };
  const recommendation = reasons[record.reasonCode] ?? `추천 ${record.recommendation === 'keep' ? '유지' : record.recommendation}`;
  const parts = ['[jet-router] 관찰', record.provider === 'jev' ? 'Jev' : 'fake(테스트)', effort, recommendation];
  if (record.latencyMs !== null) parts.push(`분류 ${Math.round(record.latencyMs)}ms`);
  const ending = { aborted: '중단', error: '오류', refusal: '거절' }[outcome];
  if (ending) parts.push(ending);
  return parts.join(' · ');
}

export function status(mode, locked, lastSummary, provider = 'fake', cloudConsent = false) {
  return [
    'jet-router',
    `모드: ${mode === 'off' ? '꺼짐(off)' : '관찰(shadow) — 추천만 표시'}`,
    provider === 'jev'
      ? `분류기: Jev · 외부 전송: ${cloudConsent ? (mode === 'shadow' && !locked ? '허용(분류 대상 입력)' : '중지(동의됨)') : '차단(미동의)'}`
      : '분류기: fake(고정 테스트 결과) · 외부 전송: 없음',
    ...(provider === 'jev' ? ['전송 대상: api.typesafe.ai · 현재 프롬프트·effort만 전송',
      '취소 한계: 대기 종료 후에도 이미 시작한 요청·비용이 남을 수 있음'] : []),
    `수동 잠금: ${locked ? '켜짐 — 분류 일시 정지' : '꺼짐'}`,
    'effort 자동 변경: 미지원',
    `최근 완료: ${lastSummary ?? '없음'}`,
  ].join('\n');
}
