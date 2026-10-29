import { EFFORTS } from './policy.js';

// This is a heuristic, not a semantic analysis: specifications can still
// contain unquoted trigger words, and indirect rework requests may be missed.
export function reworkSignal(text) {
  if (typeof text !== 'string' || !text.trim()) return 'unknown';
  const cleaned = text.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/^\s*>.*$/gm, '').trim();
  if (!cleaned || cleaned.length > 300) return 'no';
  const pattern = /(?:다시(?!는|금)|안\s*돼|안\s*됨|틀렸|틀린|아직|여전히|그대로(?:야|네|입니다|인데)|오류가\s*나|에러가\s*나|왜\s*안|\bstill\b|\bdoes(?:n't| not) work\b|\bnot working\b|\bwrong\b|\bbroken\b|\btry again\b|\bredo\b|\bthat's not\b)/i;
  return pattern.test(cleaned) ? 'yes' : 'no';
}

export function effortDirection(first, next) {
  const a = EFFORTS.indexOf(first), b = EFFORTS.indexOf(next);
  return a < 0 || b < 0 ? 'unknown' : b > a ? 'up' : b < a ? 'down' : 'same';
}
