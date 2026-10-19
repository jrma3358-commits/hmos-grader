// 논리 펼치기 표지 찾기 (오종래 2026-10-19 — deploy/hmos-spec/논리펼치기_명세서.md §2·§3 ②)
// 인문 채점 3축 「논리 펼치기」 도달 조건 ② — 학생 답에 결론연결·근거제시·대비반론·수렴 표지가 있는가.
// 표지 목록은 봉인 표지사전(봉인/표지사전.json 「논리펼치기」)에 있다 — 이 파일은 받은 목록으로 찾기만 한다 (불변원칙 4).
// 5색을 켜는 표지가 아니다. ① 근거 추출 · ③ 매듭 이어짐은 이 표지로 판정하지 않는다.

/** 갈래 → 표지 목록 (봉인 표지사전 「논리펼치기」 그대로) */
export type LogicMarkerTable = Record<string, readonly string[]>;

/** 표지가 낱말로 서 있는 자리 — 앞은 글머리·공백·문장부호, 뒤는 공백·쉼표·글끝 (「보이는」의 「이는」, 「즉시」의 「즉」은 표지가 아니다) */
const markerAt = (m: string) =>
  new RegExp(`(?:^|[\\s.,!?·「『(\\["'“‘])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,]|$)`, 'u');

/** 글에서 찾은 논리 펼치기 표지 — 갈래마다 찾은 표지 (목록 차례). 판정하지 않는다 */
export function find_logic_markers(text: string, table: LogicMarkerTable): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [kind, markers] of Object.entries(table)) {
    out[kind] = markers.filter((m) => markerAt(m).test(text));
  }
  return out;
}
