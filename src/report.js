// Only normalized router records reach these formatters, never provider text.
export function summary(record, outcome) {
  const effort = record.forwarded === 'unsupported' ? 'effort 확인 불가'
    : record.original === record.forwarded ? `${record.forwarded} 유지`
    : `시작 ${record.original === 'unsupported' ? '미확인' : record.original} → 마지막 요청 ${record.forwarded}`;
  const reasons = {
    context: '추천 보류(맥락 부족)',
    timeout: '추천 없음(시간 초과)',
    'provider-error': '추천 없음(분류 실패)',
    'invalid-response': '추천 없음(응답 형식 오류)',
    correlation: '분류 생략(요청 연결 불확실)',
    max: '분류 생략(max 보호)',
    unsupported: '분류 생략(effort 미지원)',
  };
  const recommendation = reasons[record.reasonCode] ?? `추천 ${record.recommendation === 'keep' ? '유지' : record.recommendation}`;
  const parts = ['[jet-router] 관찰', 'fake(테스트)', effort, recommendation];
  if (record.latencyMs !== null) parts.push(`분류 ${Math.round(record.latencyMs)}ms`);
  const ending = { aborted: '중단', error: '오류', refusal: '거절' }[outcome];
  if (ending) parts.push(ending);
  return parts.join(' · ');
}

export function status(mode, locked, lastSummary) {
  return [
    'jet-router',
    `모드: ${mode === 'off' ? '꺼짐(off)' : '관찰(shadow) — 추천만 표시'}`,
    `분류기: fake(고정 테스트 결과) · 외부 전송: 없음`,
    `수동 잠금: ${locked ? '켜짐 — 분류 일시 정지' : '꺼짐'}`,
    'effort 자동 변경: 미지원',
    `최근 완료: ${lastSummary ?? '없음'}`,
  ].join('\n');
}
