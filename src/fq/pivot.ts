// STEP 6. K(급소) 추출 — 논문4 §3.3~§3.6, 정리2, 명제4
// θ°(질문) → 1패스 역추적 → K(최심) → 2패스 순방향 → θ*(답)
// K는 G에 조건부다(방법 상대적) — 풀이법 M마다 G_M에서 K_M과 경로를 따로 계산한다
// 연산요소(B·C): 양 날개 대칭 / 확정요소(D·P): 인바운드에만, 아웃바운드에서 생략될 수 있음(단축)
// 이 층은 경로·K 인식까지 — θ* 값은 계산하지 않는다

import type {
  ColorElement,
  CoreColors,
  DependencyGraph,
  GNode,
  MethodInput,
  MethodResult,
  NodeColor,
  PivotNode,
  RegressionPath,
} from './types.ts';
import { countItems } from './util.ts';

const CONFIRMING: NodeColor[] = ['P', 'D'];
const NODE_COLORS: NodeColor[] = ['B', 'C', 'P', 'D'];

/**
 * 기본 G(추정)의 인바운드 순서: θ에서 가까운 B → P → D → C(최심).
 * 논문4 §5.2 6번(θ B C B θ)·§5.4 19번(θ B D C B θ)에 맞춘 추정이며,
 * P의 자리와 4번(θ B₂ C B₁ C B₂ θ)처럼 순서가 문장과 다른 경우는 조사·어미만으로 정해지지 않는다 → 풀이법 G로 준다.
 */
const DEFAULT_ORDER: NodeColor[] = ['B', 'P', 'D', 'C'];

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (n: number) => [...String(n)].map((d) => SUBSCRIPT[Number(d)]).join('');

/** 같은 색이 둘 이상이면 문장 순서대로 C₁, C₂ ... */
export function defaultGraph(elements: ColorElement[]): DependencyGraph {
  const ordered = DEFAULT_ORDER.flatMap((c) => elements.filter((e) => e.color === c));
  const total = countItems(ordered.map((e) => e.color!));
  const seen = new Map<string, number>();
  return {
    nodes: ordered.map((e) => {
      const color = e.color as NodeColor;
      const n = (seen.get(color) ?? 0) + 1;
      seen.set(color, n);
      return { id: total.get(color)! > 1 ? color + subscript(n) : color, color, content: e.content };
    }),
  };
}

/** 풀이법 G 검사 — 문제가 없으면 undefined */
export function validateGraph(G: DependencyGraph): string | undefined {
  if (!G || !Array.isArray(G.nodes)) return 'G.nodes 배열이 없습니다';
  if (G.branches !== undefined && !Array.isArray(G.branches)) return 'branches는 배열이어야 합니다';
  // 빈 branches는 분기가 없는 사슬이다. 가지가 하나라도 있으면 명제3 조건을 모두 검사한다
  if (G.branches?.length) {
    if (G.branches.length < 2) return '분기는 가지가 둘 이상이어야 합니다';
    if (G.branches.some((b) => !Array.isArray(b) || b.length === 0)) return '빈 가지가 있습니다';
    if (!G.merge) return '분기에는 병합점(merge)이 있어야 합니다';
  } else if (G.merge) {
    return '가지(branches) 없이 병합점(merge)만 있습니다';
  }

  const all = [...G.nodes, ...(G.branches ?? []).flat(), ...(G.merge ? [G.merge] : [])];
  const ids = new Set<string>();
  for (const n of all) {
    if (!n.id) return 'id가 빈 노드가 있습니다';
    if (ids.has(n.id)) return `id "${n.id}"가 중복됩니다`;
    if (!NODE_COLORS.includes(n.color)) return `"${n.id}"의 색 "${n.color}"는 B·C·P·D가 아닙니다 (Q는 θ로 양 끝에 놓인다)`;
    ids.add(n.id);
  }
  return undefined;
}

const skipsOutbound = (n: GNode) => n.skipOutbound ?? CONFIRMING.includes(n.color);
const ids = (ns: GNode[]) => ns.map((n) => n.id);
/** 인바운드 순서의 노드들 → 아웃바운드 (역순, 생략 요소 제외) */
const outboundOf = (ns: GNode[]) => ns.filter((n) => !skipsOutbound(n)).reverse();

/**
 * 정리2 (사슬): θ—x₁—…—xₙ → θ° x₁ … [xₙ] … x₁ θ*
 * 명제3 (분기): 공통 앞부분 → (가지₁ | 가지₂ …) → [병합점] → (가지₁ 역순 | 가지₂ 역순 …) → 앞부분 역순
 * 어느 쪽이든 생략 요소(기본 D·P)는 아웃바운드에서 뺀다
 */
export function encode(G: DependencyGraph, q: string): { K: PivotNode; path: RegressionPath } {
  if (G.branches?.length && G.merge) {
    const K = G.merge;
    const prefixOut = outboundOf(G.nodes);
    const branchOut = G.branches.map(outboundOf).filter((b) => b.length);
    const group = (bs: GNode[][]) => `(${bs.map((b) => ids(b).join('→')).join(' | ')})`;
    const all = [...G.nodes, ...G.branches.flat()];
    return {
      K,
      path: {
        kind: 'branch',
        inbound: ids(all),
        outbound: [...ids(branchOut.flat()), ...ids(prefixOut)],
        shortened: ids(all.filter(skipsOutbound)),
        notation: [
          'θ°',
          ...ids(G.nodes),
          group(G.branches),
          `[${K.id}]`,
          ...(branchOut.length ? [group(branchOut)] : []),
          ...ids(prefixOut),
          'θ*',
        ].join('→'),
      },
    };
  }

  const K = G.nodes.at(-1);
  if (!K) {
    return {
      K: { id: 'Q', color: 'Q', content: q },
      path: { kind: 'chain', inbound: [], outbound: [], shortened: [], notation: 'θ°→[Q]→θ*' },
    };
  }
  const above = G.nodes.slice(0, -1);
  const outbound = ids(outboundOf(above));
  return {
    K,
    path: {
      kind: 'chain',
      inbound: ids(above),
      outbound,
      shortened: ids(above.filter(skipsOutbound)),
      notation: ['θ°', ...ids(above), `[${K.id}]`, ...outbound, 'θ*'].join('→'),
    },
  };
}

/** 풀이법이 주어지면 각 G_M으로, 없으면 기본(추정) G 하나로 */
export function regress(core: CoreColors, methods?: MethodInput[]): MethodResult[] {
  const inputs = methods?.length
    ? methods.map((m) => ({ ...m, estimated: false }))
    : [{ name: '기본', G: defaultGraph(core.elements), estimated: true }];
  return inputs.map(({ name, G, estimated }) => ({ name, estimated, G, ...encode(G, core.colors.Q) }));
}
