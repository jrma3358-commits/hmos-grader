// 서술형 실체 요약 — 1차 필터 (문항분석 명세서-2 §2). 단독문제, 계단식 단계형의 소문항 하나에 쓴다.
// 새로 판단하지 않고 급소 인식(v2)의 5색 노드를 받아 형식화한다 (§1).
// [오종래 2026-09-30] 분류는 F3 요소가 아니라 node.color로 읽는다 — F3는 세우기 C를 p로 덮어쓰기 때문이다.
//                     바탕 = B·D·P / 도달 = C·K·Q. 급소 K 노드는 색과 상관없이 도달로 간다.
import type { Color } from '../fq/types.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import type { 급소K, 인식결과, 조각뼈대 } from '../rubric/types.ts';

const 바탕색: Color[] = ['B', 'D', 'P'];
const 도달색: Color[] = ['C', 'Q'];

export interface 실체요소 {
  node: PathNode;
  /** 표시용 표지 — 급소면 'K', 아니면 노드 색 */
  표지: Color | 'K';
  /** 이 노드를 가리키는 조각 id (루브릭과 같은 조각, §0 연동). 풀기는 세우기와 같은 노드라 뺀다 */
  조각ids: string[];
}

export interface 서술형실체 {
  바탕: 실체요소[];
  도달: 실체요소[];
  /** 색이 미결(null)인 노드 — 추측해서 어느 쪽에도 넣지 않는다 */
  미결: PathNode[];
  /** 자취용 한 줄 */
  요약: string;
}

/** 서술형실체요약(급소_k, 5색인식결과, F2조각뼈대) → 바탕 → 도달 관계 */
export function summarize_substance(k: 급소K, 인식: 인식결과, 조각들: 조각뼈대[]): 서술형실체 {
  const 조각ids = (n: PathNode) => 조각들.filter((c) => c.파트 !== '풀기' && c.node?.id === n.id).map((c) => c.id);

  const 바탕: 실체요소[] = [];
  const 도달: 실체요소[] = [];
  const 미결: PathNode[] = [];
  for (const n of 인식.nodes) {
    if (n.id === k.node.id) 도달.push({ node: n, 표지: 'K', 조각ids: 조각ids(n) });
    else if (n.color === null) 미결.push(n);
    else if (바탕색.includes(n.color)) 바탕.push({ node: n, 표지: n.color, 조각ids: 조각ids(n) });
    else if (도달색.includes(n.color)) 도달.push({ node: n, 표지: n.color, 조각ids: 조각ids(n) });
  }

  const 줄 = (xs: 실체요소[]) => (xs.length ? xs.map((x) => `${x.표지}「${x.node.entity}」`).join(' · ') : '(없음)');
  return { 바탕, 도달, 미결, 요약: `${줄(바탕)} → ${줄(도달)}` };
}
