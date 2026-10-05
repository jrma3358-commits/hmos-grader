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
 * `빈칸`은 제시문·보기 B가 발문의 빈칸 노드로 보내는 관계 간선이라 1이다 (graph.ts 빈칸 수렴).
 * `보기`는 보기 B가 발문의 하나뿐인 B로 보내는 관계 간선이라 1이다 (graph.ts 보기 수렴).
 */
export const DEFAULT_CONVERGENCE_WEIGHTS: Record<PathEdge['kind'], number> = {
  연결어: 1,
  부사: 1,
  adjacent: 0,
  접힘: 1,
  결과: 1,
  빈칸: 1,
  보기: 1,
};

export interface Pivot {
  node: PathNode;
  /** '강한 C 연결 B' = 강한 C(apply.strongC)에 연결된 B라서 급소다 (graph.ts) · 'Q 직전 B' = 마지막 Q 바로 앞의 B라서 급소다
   *  · '서술형태' = 서술형태 제약(apply.formPivot, C-F) 노드라서 급소다 — 이때만 급소가 B가 아니다 */
  reason: '최수렴 B' | '강한 C 연결 B' | 'Q 직전 B' | '서술형태';
  /** 서술형태 급소의 핵심어 — 표지에서 서술 틀을 떼고 남은 말 (예: 「논박하는 방식으로」 → 「논박」). 그 밖의 급소에는 없다 */
  keyword?: string;
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
 * 서술형태 급소의 핵심어 — 표지에서 서술 틀을 떼고 남은 말.
 * 앞말을 끄는 표지(「~의 관점에서」)는 실체가 이미 틀 밖의 앞말이다. 어휘형 표지(「논박하는 방식으로」)는
 * 같은 스위치의 틀 표지(앞에 '~'가 붙은 표지, 예: 「~하는 방식으로」) 중 가장 긴 것을 끝에서 뗀다.
 */
function formKeyword(graph: PathGraph, node: PathNode, table: SealedTable): string {
  let keyword: string;
  if (node.entity !== node.surface) keyword = node.entity.trim();
  else {
    const sw = table.switches.find((s) => s.id === node.switchId);
    const frame = (sw?.markers ?? [])
      .filter((m) => m.startsWith('~'))
      .map((m) => m.slice(1).trim())
      .filter((f) => f && node.surface.endsWith(f) && node.surface.length > f.length)
      .sort((a, b) => b.length - a.length)[0];
    keyword = frame ? node.surface.slice(0, -frame.length).trim() : node.surface.trim();
  }
  // 지시어 핵심어 [오종래 2026-10-05] — 핵심어가 지시어(「각각」 등)면 그것이 가리키는 앞 명사구가 핵심어다.
  //   앞 명사구 = C-F 노드 앞의 가장 가까운 B 노드 실체. 그 바로 앞에 병렬 P 노드(「와」·「과」)가 잇따르면 함께 묶는다
  //   (예: 윤리12 「응보주의와 공리주의가 있다. 각각의 관점에서」 → 「응보주의와 공리주의」).
  if (!DEICTICS.includes(keyword)) return keyword;
  const at = graph.nodes.indexOf(node);
  let b = at - 1;
  while (b >= 0 && graph.nodes[b].color !== 'B') b--;
  if (b < 0) return keyword;
  let phrase = graph.nodes[b].entity.trim();
  for (let i = b - 1; i >= 0 && graph.nodes[i].color === 'P' && PARALLEL.includes(graph.nodes[i].surface); i--) {
    phrase = `${graph.nodes[i].entity.trim()}${graph.nodes[i].surface} ${phrase}`;
  }
  return phrase;
}

/** 서술형태 핵심어에서 앞 명사구로 넘기는 지시어 */
const DEICTICS = ['각각', '각', '이', '그', '이것', '그것', '이들', '그들', '이러한', '그러한'];
/** 앞 명사구를 이어 붙이는 병렬 표지 */
const PARALLEL = ['와', '과'];

/**
 * 급소를 산출한다 — 결정론 (구현명세 §2-4).
 * 실패도 값으로 돌려준다: B가 없거나(NO_B) 둘로 수렴하면(MULTIPLE_CONVERGENCE) 플래그.
 */
export function analyze_pivot(graph: PathGraph, table?: SealedTable): PivotAnalysis {
  // 서술형태 급소 [오종래 2026-10-05] — 서술형태 제약(apply.formPivot, C-F) 노드가 있으면 다른 급소 규칙보다 먼저
  //   그 노드가 급소이고, 실체는 그 안의 핵심어다 (예: 인문논술_문1 「논박하는 방식으로」 → 「논박」).
  //   「급소는 B」의 예외다 — 이 규칙에서만 급소가 C 노드다. 둘 이상이면 급소가 둘 — 문제 설계 오류로 플래그한다.
  const formIds = table?.apply.formPivot ?? [];
  const forms = graph.nodes.filter((n) => formIds.includes(n.switchId));
  if (forms.length > 1) {
    return {
      ok: false,
      flag: 'MULTIPLE_CONVERGENCE',
      candidates: forms,
      message:
        `서술형태 제약 노드가 ${forms.length}개입니다 — 문제 설계 오류로 플래그합니다.\n` +
        `급소는 하나여야 합니다 (구현명세 §2-4). 후보: ${forms.map((n) => `${n.id}("${n.entity}")`).join(', ')}`,
    };
  }
  if (forms.length === 1 && table) {
    const node = forms[0];
    return {
      ok: true,
      pivot: {
        node,
        reason: '서술형태',
        keyword: formKeyword(graph, node, table),
        convergence: convergenceOf(graph, node, table),
        sameAsDeepest: deepest_node(graph)?.id === node.id,
      },
    };
  }

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

  // 강한 C 연결 B [오종래 2026-10-01] — 강한 C(apply.strongC)에 연결된 B가 있으면 수렴도보다 먼저 그 B가 급소다.
  //   둘 이상이면 급소가 둘 — 수렴 동점과 같이 문제 설계 오류로 플래그한다.
  const anchored = bs.filter((n) => n.anchoredBy !== undefined);
  if (anchored.length > 1) {
    return {
      ok: false,
      flag: 'MULTIPLE_CONVERGENCE',
      candidates: anchored,
      message:
        `강한 C에 연결된 B가 ${anchored.length}개입니다 — 문제 설계 오류로 플래그합니다.\n` +
        `급소는 하나여야 합니다 (구현명세 §2-4). 후보: ${anchored.map((n) => `${n.id}("${n.entity}")`).join(', ')}`,
    };
  }
  if (anchored.length === 1) {
    const node = anchored[0];
    return {
      ok: true,
      pivot: {
        node,
        reason: '강한 C 연결 B',
        convergence: convergenceOf(graph, node, table),
        sameAsDeepest: deepest_node(graph)?.id === node.id,
      },
    };
  }

  // Q 직전 B [오종래 2026-10-02] — 판단기준(apply.foldToB)도 강한 C(apply.strongC)도 없으면, 마지막 Q 바로 앞의 B 노드가 급소다 (수리논술_문_1~4).
  //   C·D에서 B로 접힌 조건 노드(「할 때」 결과 묶기 등)는 건너뛴다 — 급소가 조건 쪽으로 끌리지 않게. 그 사이의 C·D 노드도 건너뛴다.
  //   판단기준·강한 C가 있으면 이 규칙을 걸지 않는다 — 판단기준 우선·강한 C 연결 규칙이 먼저다 (화학_문_1·경제_문__4 등).
  const judgeIds = table?.apply.foldToB ?? [];
  const strongIds = table?.apply.strongC ?? [];
  //   표지표 없이 불려도 판단기준을 알아본다 — 판단기준으로 판정되는 노드는 '접힘' 간선을 보낸다 (graph.ts Q→B 추출)
  const isJudge = (n: PathNode) => judgeIds.includes(n.switchId) || graph.edges.some((e) => e.kind === '접힘' && e.to === n.id);
  const hasJudge = graph.nodes.some(isJudge);
  const hasStrongC = graph.nodes.some((n) => strongIds.includes(n.switchId));
  //   지시어 「이」 [오종래 2026-10-02] — 판단기준 뒤에 그 조건을 받는 지시어 B「이」(예: 「이를 만족하는」)가 있으면
  //   조건은 묻는 대상에 흡수된 것이다 → 판단기준이 있어도 Q 직전 B가 급소다
  //   (예: 수리논술_문_3 (2) 「4π/3일 때 이를 만족하는 실수 a」 → 「만족하는 실수 a」. 수리논술_문_1은 지시어가 없어 「점 C(0, -1)」 그대로).
  const judgeAt = graph.nodes.findIndex(isJudge);
  const pointsBack = judgeAt >= 0 && graph.nodes.slice(judgeAt + 1).some((n) => n.color === 'B' && n.entity.trim() === '이');
  let lastQ = -1;
  for (let i = (hasJudge && !pointsBack) || hasStrongC ? -1 : graph.nodes.length - 1; i >= 0; i--) {
    if (graph.nodes[i].color === 'Q') {
      lastQ = i;
      break;
    }
  }
  for (let i = lastQ - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    if (node.color !== 'B' || node.foldedFrom === 'C' || node.foldedFrom === 'D') continue;
    if (pointsBack && node.entity.trim() === '이') continue; // 지시어 자체는 급소가 아니다
    // 형식 명사 「값」 [오종래 2026-10-02] — 「값」은 급소가 될 수 없다. Q 직전 B로 잡히면 그 앞 B가 급소다
    //   (예: 수리논술_문_4 「lim_{m→1-} f(m)/g(m)의 값을 구하시오」 → 「lim_{m→1-} f(m)/g(m)」).
    if (node.entity.trim() === '값') continue;
    return {
      ok: true,
      pivot: { node, reason: 'Q 직전 B', convergence: convergenceOf(graph, node, table), sameAsDeepest: deepest_node(graph)?.id === node.id },
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
