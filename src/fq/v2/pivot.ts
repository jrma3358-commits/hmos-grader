// v2 급소(K) — 회오리 중심 = 최수렴 B
//
// 정본: `HMOS_인식엔진_v2_구현명세.md` §2-4 (2026-09-18 오종래 판정)
//   - 급소 = **간선이 가장 많이 수렴하는 B 노드** (회오리 중심)
//   - **최심점 ≠ 급소** — 경로에서 가장 깊은 노드는 급소가 아니다 (v1의 병, §0 표 4번)
//   - 수렴점은 한 점이다 → 누가 읽어도 같은 급소 = 재현성 (§4)
//   - 급소는 하나. 둘로 수렴하면 **문제 설계 오류로 플래그**한다
//
// 봉인 경계: 규칙(어떻게 세는가)은 **구조**라 여기 있다. 봉인 파일에서 가져오는 것은
//   `apply.convergenceWeights`(간선 종류별 무게) **값**뿐이며, 없으면 균등으로 센다.
//
// 이 층은 급소를 잡으면 멈춘다 (§2-5). 풀이·채점으로 넘어가지 않는다.

import type { SealedTable } from '../sealed/schema.ts';
import type { PathEdge, PathGraph, PathNode } from './graph.ts';

/** 간선 종류별 무게의 기본값 — 봉인 파일의 `apply.convergenceWeights`가 덮어쓴다.
 *
 * 관계 간선(연결어·부사)만 수렴으로 센다. `adjacent`는 표지가 만든 관계가 아니라
 * 노드가 이웃해 있다는 사실뿐이라 0이다 (구현명세 §2-3: 간선은 연결어 표지에서 온다).
 * `접힘`은 판단기준(Q에 접힌 B)으로 판정되는 노드가 보내는 관계 간선이라 1이다 (graph.ts Q→B 추출).
 * `결과`는 결과 B가 조건 노드로 보내는 관계 간선이라 1이다 (graph.ts 결과 묶기).
 */
export const DEFAULT_CONVERGENCE_WEIGHTS: Record<PathEdge['kind'], number> = {
  연결어: 1,
  부사: 1,
  adjacent: 0,
  접힘: 1,
  결과: 1,
};

export interface Pivot {
  node: PathNode;
  reason: '최수렴 B';
  /** 이 노드로 수렴한 간선의 무게 합 */
  convergence: number;
  /** 최심점과 같은 노드인가. 같더라도 '깊어서'가 아니라 '수렴해서' 급소다 */
  sameAsDeepest: boolean;
}

export type PivotFlag =
  /** B 노드가 하나도 없다 — Q→B 추출(구현명세 §2-3)이 필요한 자리 */
  | 'NO_B'
  /** 둘 이상으로 수렴했다 — 문제 설계 오류 (§2-4) */
  | 'MULTIPLE_CONVERGENCE';

export interface PivotFailure {
  ok: false;
  flag: PivotFlag;
  candidates: PathNode[];
  message: string;
}

export type PivotAnalysis = { ok: true; pivot: Pivot } | PivotFailure;

export class PivotError extends Error {
  readonly flag: PivotFlag;
  readonly candidates: PathNode[];
  constructor(failure: PivotFailure) {
    super(failure.message);
    this.name = 'PivotError';
    this.flag = failure.flag;
    this.candidates = failure.candidates;
  }
}

function weightsOf(table?: SealedTable): Record<string, number> {
  const sealed = table?.apply.convergenceWeights;
  return sealed ? { ...DEFAULT_CONVERGENCE_WEIGHTS, ...sealed } : DEFAULT_CONVERGENCE_WEIGHTS;
}

/** 노드로 **들어오는** 간선의 무게 합. 수렴은 들어오는 쪽이다 */
export function convergenceOf(graph: PathGraph, node: PathNode, table?: SealedTable): number {
  const w = weightsOf(table);
  return graph.edges.filter((e) => e.to === node.id).reduce((sum, e) => sum + (w[e.kind] ?? 0), 0);
}

/**
 * 최심점 — 경로에서 가장 깊이 들어간 노드.
 *
 * ★ 이것은 **급소가 아니다.** v1이 이 자리를 급소로 착각했고(`pivot.ts:109`) K가 C로 떨어졌다.
 * 급소와 **구분하기 위해서만** 남긴다 (구현명세 §2-4 "최심점과 구분한다").
 */
export function deepest_node(graph: PathGraph): PathNode | undefined {
  return graph.nodes.at(-1);
}

/**
 * 급소를 산출한다 — 결정론 (구현명세 §2-4).
 * 실패도 값으로 돌려준다: B가 없거나(NO_B) 둘로 수렴하면(MULTIPLE_CONVERGENCE) 플래그.
 */
export function analyze_pivot(graph: PathGraph, table?: SealedTable): PivotAnalysis {
  const bs = graph.nodes.filter((n) => n.color === 'B');
  if (!bs.length) {
    return {
      ok: false,
      flag: 'NO_B',
      candidates: graph.nodes.filter((n) => n.color === 'Q'),
      message:
        'B 노드가 없습니다 — 급소는 항상 B계열입니다 (구현명세 §0 표 2번).\n' +
        'B가 표면에 없으면 Q를 열어 B를 꺼내야 합니다(Q→B 추출, §2-3). ' +
        '그 추출은 표지 판정에 걸려 있어 아직 서지 않았습니다 — 여기서 추측하지 않습니다.',
    };
  }

  const scored = bs.map((node) => ({ node, convergence: convergenceOf(graph, node, table) }));
  const top = Math.max(...scored.map((s) => s.convergence));
  const winners = scored.filter((s) => s.convergence === top);

  if (winners.length > 1) {
    return {
      ok: false,
      flag: 'MULTIPLE_CONVERGENCE',
      candidates: winners.map((w) => w.node),
      message:
        `급소가 ${winners.length}개로 수렴했습니다 (수렴도 ${top} 동점) — 문제 설계 오류로 플래그합니다.\n` +
        `급소는 하나여야 합니다 (구현명세 §2-4). 후보: ${winners.map((w) => `${w.node.id}("${w.node.entity}")`).join(', ')}`,
    };
  }

  const { node, convergence } = winners[0];
  return {
    ok: true,
    pivot: { node, reason: '최수렴 B', convergence, sameAsDeepest: deepest_node(graph)?.id === node.id },
  };
}

/**
 * 급소 = 최수렴 B (회오리 중심).
 * @throws PivotError B가 없거나 둘 이상으로 수렴할 때 — 플래그는 `error.flag`에 있다
 */
export function find_pivot(graph: PathGraph, table?: SealedTable): Pivot {
  const result = analyze_pivot(graph, table);
  if (!result.ok) throw new PivotError(result);
  return result.pivot;
}
