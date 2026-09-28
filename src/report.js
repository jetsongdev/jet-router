// Only normalized router records reach these formatters, never provider text.
// Same shape as the Codex MCP shadow messages (mcp/shadow.mjs).
export function summary(record, outcome) {
  const provider = record.provider === 'jev' ? 'Jev' : 'fake';
  const skipped = {
    'no-consent': '전송 미동의',
    'missing-key': 'API 키 누락 또는 형식 오류',
    busy: '이전 분류 진행 중',
    redirect: 'redirect 차단',
    'http-error': 'API 오류',
    'response-too-large': '응답 크기 초과',
    'invalid-input': '입력 형식 오류',
    timeout: '시간 초과',
    'provider-error': '분류 실패',
    'invalid-response': '응답 형식 오류',
    correlation: '요청 연결 불확실',
    overlap: '입력 겹침',
    queued: '대기 중 입력',
    attachment: '첨부 포함',
    'hidden-context': '숨은 문맥 포함',
    empty: '빈 입력',
    'too-long': '6,000자 초과',
    command: '스킬·명령 입력',
    rewritten: '입력 변경됨',
    max: 'max 보호',
    unsupported: 'effort 미지원',
  }[record.reasonCode];
  const parts = [];
  if (skipped) {
    parts.push(`[jet-router] ${provider} 생략: ${skipped}`, 'shadow');
  } else {
    const original = record.original === 'unsupported' ? '미확인' : record.original;
    const percentage = record.probability === undefined ? '' : ` (${Math.round(record.probability * 100)}%)`;
    const fixture = provider === 'fake' ? '(고정값)' : '';
    const target = record.recommendation === 'keep' ? `${original} 유지` : `${original} → ${record.recommendation}`;
    parts.push(`[jet-router] ${provider}.shadow(): ${target}${fixture}${percentage}`);
    if (record.latencyMs !== null) parts.push(`${Math.round(record.latencyMs)}ms`);
    if (record.original !== record.forwarded) {
      parts.push(`마지막 요청 ${record.forwarded === 'unsupported' ? '확인 불가' : record.forwarded}`);
    }
  }
  const ending = { aborted: '중단', error: '오류', refusal: '거절' }[outcome];
  if (ending) parts.push(ending);
  return parts.join(' · ');
}

export function sessionNotice(mode, provider, requestedShadow = false) {
  const classifier = provider === 'jev' ? 'Jev' : 'fake(외부 전송 없음)';
  if (mode === 'shadow') return `[jet-router] 세션 시작 · 관찰(shadow) · ${classifier}`;
  const blocked = requestedShadow && provider === 'jev' ? ' · Jev는 기본 shadow 미적용' : '';
  return `[jet-router] 세션 시작 · 꺼짐(off) · ${classifier}${blocked} · 켜기: /jet-router shadow`;
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
