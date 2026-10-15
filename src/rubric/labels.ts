// 서술형 B 교사 모범답안 라벨 파싱 (오종래 2026-10-16) — [근거] [세우기] [풀기-n] [답] 구간으로 나눈다.
// 라벨은 ①②④ 조각을 바꾸지 않는다(조각은 엔진 F2). [풀기-n]만 ③ 풀기 조각이 된다 (인식결과.교사풀기 → 봉인2_풀기).
// 받는 꼴: [근거]·[근거대기] · [세우기] · [풀기-1]·[풀기1]·[풀기 1]·[풀기] · [답]·[답구하기]. 줄 머리가 아니어도 받는다.
// [풀기]의 번호는 나온 순서로 다시 매긴다 — 같은 번호가 두 번 나오면 한 구간으로 잇는다.

export interface 라벨구간 {
  /** 라벨이 하나라도 있었는가 — 없으면 루브릭은 지금대로 (풀기 없음) */
  라벨있음: boolean;
  근거: string;
  세우기: string;
  /** 나온 순서대로. 글이 빈 구간은 뺀다 */
  풀기: string[];
  답: string;
  /** 첫 라벨 앞에 있던 글 (라벨 밖이라 어느 파트에도 넣지 않는다) */
  앞글: string;
}

/** 라벨 정규식 — 대시보드 라벨빼기와 같다 */
export const 라벨식 = /\[\s*(근거(?:대기)?|세우기|풀기(?:\s*-?\s*(\d+))?|답(?:구하기)?)\s*\]/g;

export function parse_answer_labels(글: string): 라벨구간 {
  const t = String(글 ?? '');
  const 걸림 = [...t.matchAll(라벨식)];
  const out: 라벨구간 = { 라벨있음: 걸림.length > 0, 근거: '', 세우기: '', 풀기: [], 답: '', 앞글: '' };
  if (!걸림.length) {
    out.앞글 = t.trim();
    return out;
  }
  out.앞글 = t.slice(0, 걸림[0].index).trim();
  const 잇기 = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);
  const 풀기 = new Map<string, string>(); // 키 = 명시 번호 또는 무번호 순번
  let 무번호 = 0;
  걸림.forEach((m, i) => {
    const 끝 = i + 1 < 걸림.length ? 걸림[i + 1].index : t.length;
    const 본문 = t.slice(m.index! + m[0].length, 끝).trim();
    const 이름 = m[1];
    if (이름.startsWith('근거')) out.근거 = 잇기(out.근거, 본문);
    else if (이름 === '세우기') out.세우기 = 잇기(out.세우기, 본문);
    else if (이름.startsWith('답')) out.답 = 잇기(out.답, 본문);
    else {
      const 키 = m[2] != null ? `n${Number(m[2])}` : `u${무번호++}`;
      풀기.set(키, 잇기(풀기.get(키) ?? '', 본문));
    }
  });
  out.풀기 = [...풀기.values()].filter(Boolean);
  return out;
}
