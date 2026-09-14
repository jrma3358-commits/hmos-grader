/** 주격 조사 이/가 선택 — 한글은 받침, 영문자·숫자는 한국어 읽기의 끝소리 기준 */
export function subjectParticle(word: string): '이' | '가' {
  const ch = word.at(-1) ?? '';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '가' : '이';
  if (/[lmnr]/i.test(ch)) return '이'; // 엘 엠 엔 알
  if (/[013678]/.test(ch)) return '이'; // 영 일 삼 육 칠 팔
  return '가';
}

export function countItems(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  return counts;
}

export function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
