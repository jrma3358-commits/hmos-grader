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
import { 곁B, isIndirectQ, SUBJECT_MARKERS, type PivotAnalysis } from '../fq/v2/pivot.ts';

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
/** 케이스 분류 C 스위치 — 봉인 LS-52 「~에 따라」 */
const 케이스분류 = 'LS-52';

/**
 * 실체 명사 급소 덩어리 [오종래 2026-10-20 확정] — 서술 방향을 급소에서 빼는 형식(서술형 B · 인문논술 C-1a)이면 엔진 급소(실체 명사 B)가 덩어리의 B다.
 * 덩어리에 C는 넣지 않는다 — 급소는 실체 명사만 (오종래 2026-10-20 확정: 「살아가」「활용하여」 같은 C·서술 방향 C-F·케이스 분류 LS-52 모두 ✕)
 * (「그 이유를 아래에 제시된 두 가지 의사결정 형태를 논박하는 방식으로 설명하시오」 → 「그 이유」,
 *  「… 시대를 살아가는 인간의 삶에 미칠 수 있는 영향을 … 모두 활용하여 논하시오」 → 「인간의 삶에 미칠 수 있는 영향」)
 */
function 실체명사덩어리(nodes: PathNode[], 급소들: PathNode[]): 급소덩어리[] {
  return 급소들.flatMap((b) => {
    const bi = nodes.findIndex((n) => n.id === b.id);
    const qi = nodes.findIndex((n, i) => i > bi && n.color === 'Q');
    if (bi < 0 || qi < 0) return [];
    return [{ B: b, C: [], Q: [nodes[qi]], 실체: clean(b.entity) }];
  });
}

/**
 * 계산 문항 두 급소 [오종래 2026-10-20 확정] (숭실대 경상계열 문항 1) — 「몇 N인지」(결과) + 「계산 근거」(과정)가 함께 있으면 두 덩어리.
 *   결과 = 「몇 N」 Q 바로 앞 B와 그 B 앞에 붙은 C (「30시간 이상인 여학생 몇 명」) — 앞 조건 B(「28,000명이」)는 넣지 않는다
 *   과정 = 「계산 근거」 노드(「도」로 P가 되어도) — Q는 그 뒤 첫 Q
 */
const 몇re = /^몇\s*\S+$/;
function 계산덩어리(nodes: PathNode[]): 급소덩어리[] | null {
  const qi = nodes.findIndex((n) => n.color === 'Q' && 몇re.test(clean(n.entity)));
  if (qi < 0) return null;
  const gi = nodes.findIndex((n, i) => i > qi && /계산\s*근거/.test(clean(n.entity)));
  if (gi < 0) return null;
  let bi = qi - 1;
  while (bi >= 0 && nodes[bi].color !== 'B') bi--;
  if (bi < 0) return null;
  const 앞C: PathNode[] = [];
  for (let k = bi - 1; k >= 0 && nodes[k].color === 'C' && nodes[k].switchId !== 케이스분류; k--) 앞C.unshift(nodes[k]);
  const 결과 = [...앞C.map((c) => clean(c.entity) + c.surface.trim()), clean(nodes[bi].entity), clean(nodes[qi].entity)].join(' ');
  const 뒤Q = nodes.find((n, i) => i > gi && n.color === 'Q');
  return [
    { B: nodes[bi], C: 앞C, Q: [nodes[qi]], 실체: 결과 },
    { B: nodes[gi], C: [], Q: 뒤Q ? [뒤Q] : [], 실체: clean(nodes[gi].entity) },
  ];
}

/**
 * 논제 그래프 → 급소 덩어리들 (Q 앞 B+C). 덩어리가 하나도 서지 않으면 빈 배열.
 * 급소(엔진 analyze_pivot 결과)를 주고 그 급소가 실체 명사 B(서술 방향 제외 형식)면 그 급소로 덩어리를 세운다 (2026-10-20)
 */
export function essay_pivot_chunks(graph: Pick<PathGraph, 'nodes'>, 급소?: PivotAnalysis): 급소덩어리[] {
  const nodes = [...graph.nodes].sort((a, b) => a.index - b.index);
  const 계산 = 계산덩어리(nodes);
  if (계산) return 계산;
  const 실체급소 = 급소?.ok ? (급소.pivots ?? [급소.pivot]).filter((p) => p.reason === '실체 명사 B').map((p) => p.node) : [];
  if (실체급소.length) return 실체명사덩어리(nodes, 실체급소);
  const 덩어리: 급소덩어리[] = [];
  let from = 0;
  nodes.forEach((q, qi) => {
    if (q.color !== 'Q') return;
    const 구간 = nodes.slice(from, qi);
    from = qi + 1;
    // 곁 B(관점 앞 B 「…의 경쟁력 측면에서」 · 소유격 수식 B 「B국 기업의 경쟁력과」)는 덩어리의 B가 아니다 — 구간에 다른 B가 있으면 그 B [오종래 2026-10-13]
    const bs = 구간.flatMap((n, k) => (n.color === 'B' ? [k] : []));
    const 대상 = bs.filter((k) => !곁B(nodes, 구간[k]));
    // 간접의문 절의 주어 [오종래 2026-10-13] — 구간에 간접의문 Q(「~는지」「~인지」)가 있고 그 앞에 주격 B가 있으면 첫 주격 B가 덩어리의 B
    //   (pivot.ts 「Q 직전 B」와 같은 판정 — 「그 조치가 … 목적을 이루는 데 기여하는지 설명하시오」 → 「그 조치」)
    //   덩어리는 Q마다 끊으므로 간접의문 Q가 이 구간을 닫는 Q 자신일 수 있다 — 그때는 구간 전체가 그 절이다
    const iq = isIndirectQ(q) ? 구간.length : 구간.findIndex((n) => n.color === 'Q' && isIndirectQ(n));
    const 주어 = iq < 0 ? -1 : 대상.find((k) => k < iq && SUBJECT_MARKERS.includes(구간[k].surface.trim())) ?? -1;
    const bi = 주어 >= 0 ? 주어 : (대상.length ? 대상 : bs).at(-1) ?? -1;
    if (bi < 0) {
      덩어리.at(-1)?.Q.push(q);
      return;
    }
    // 케이스 분류 C(봉인 LS-52 「~에 따라」, 오종래 2026-10-20)는 덩어리에 넣지 않는다 — 급소는 「조사하시오」 앞 실체 명사, 「실수 k의 값에 따라」는 제약
    const 덩어리C = (n: PathNode) => n.color === 'C' && n.switchId !== 케이스분류;
    const 앞C: PathNode[] = [];
    for (let k = bi - 1; k >= 0 && 덩어리C(구간[k]); k--) 앞C.unshift(구간[k]);
    const 뒤C = 구간.slice(bi + 1).filter(덩어리C);
    const 길 = [...앞C, 구간[bi], ...뒤C];
    덩어리.push({ B: 구간[bi], C: [...앞C, ...뒤C], Q: [q], 실체: 길.map((n) => clean(n.entity)).join(' · ') });
  });
  return 덩어리;
}
