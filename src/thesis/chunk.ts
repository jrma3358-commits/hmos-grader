// C·논술 논제 급소 덩어리 — Q 앞에 서 있는 B+C (오종래 2026-10-13).
//
// [오종래 2026-10-13] 논술 논제 구조
//   Q(서술하시오·논하시오·설명하시오) = 형식. 급소 아님
//   급소 = Q 앞에 서 있는 B+C 덩어리
//     B = 무엇을 (실체) · C = 어떻게·어디서·어떤 조건으로 (방향·범위 제약)
//   B 위에 C가 붙은 덩어리가 논제의 실제 급소다
//
// [구현 2026-10-13] 덩어리를 잡는 법 — 길(노드 순서)만 본다. 수렴도는 보지 않는다
//   - Q 노드마다 구간을 끊는다 (앞 Q 다음부터 이 Q까지)
//   - 구간 안에서 Q에 가장 가까운 B가 덩어리의 B다
//   - 그 B 바로 앞에 붙은 C들(사이에 다른 색이 없는 C의 연속)과, B와 Q 사이의 C들이 덩어리의 C다
//   - B가 없는 구간의 Q(「무엇」 뒤 「설명하시오」)는 앞 덩어리의 형식 표지다 — 덩어리를 새로 세우지 않는다

import type { PathGraph, PathNode } from '../fq/v2/graph.ts';

export interface 급소덩어리 {
  B: PathNode;
  /** 길 순서. B 앞에 붙은 C가 먼저, B와 Q 사이의 C가 다음 */
  C: PathNode[];
  /** 형식 표지 — 이 덩어리를 닫은 Q들 */
  Q: PathNode[];
  /** 덩어리 실체 — 노드 실체를 길 순서로 */
  실체: string;
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');

/** 논제 그래프 → 급소 덩어리들 (Q 앞 B+C). 덩어리가 하나도 서지 않으면 빈 배열 */
export function essay_pivot_chunks(graph: Pick<PathGraph, 'nodes'>): 급소덩어리[] {
  const nodes = [...graph.nodes].sort((a, b) => a.index - b.index);
  const 덩어리: 급소덩어리[] = [];
  let from = 0;
  nodes.forEach((q, qi) => {
    if (q.color !== 'Q') return;
    const 구간 = nodes.slice(from, qi);
    from = qi + 1;
    const bi = 구간.map((n) => n.color).lastIndexOf('B');
    if (bi < 0) {
      덩어리.at(-1)?.Q.push(q);
      return;
    }
    const 앞C: PathNode[] = [];
    for (let k = bi - 1; k >= 0 && 구간[k].color === 'C'; k--) 앞C.unshift(구간[k]);
    const 뒤C = 구간.slice(bi + 1).filter((n) => n.color === 'C');
    const 길 = [...앞C, 구간[bi], ...뒤C];
    덩어리.push({ B: 구간[bi], C: [...앞C, ...뒤C], Q: [q], 실체: 길.map((n) => clean(n.entity)).join(' · ') });
  });
  return 덩어리;
}
