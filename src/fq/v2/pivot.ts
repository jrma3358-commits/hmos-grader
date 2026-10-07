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
   *  · '서술형태' = 서술형태 제약(apply.formPivot, C-F) 노드라서 급소다 — 이때만 급소가 B가 아니다
   *  · '수량 값 B' = 「몇 ~」 수량 물음(apply.quantityHeads)이라 Q에 접힌 값 B가 급소다 — 노드는 그 Q, 실체는 「몇 ~」 */
  reason: '최수렴 B' | '강한 C 연결 B' | 'Q 직전 B' | '서술형태' | '수량 값 B';
  /** 급소의 실체값 — B 급소는 B가 묻는 실체(이름 뒤의 식·기호, 예: 「일반항 a_n」 → 「a_n」, 없으면 실체 그대로),
   *  서술형태 급소는 표지에서 서술 틀을 떼고 남은 말 (예: 「논박하는 방식으로」 → 「논박」) */
  keyword?: string;
  /** B 급소 실체에서 식·기호 앞의 이름 (예: 「일반항 a_n」 → 「일반항」). 식·기호가 따로 없으면 없다 */
  name?: string;
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

/** `pivots` = 급소 복수 — Q가 둘 이상인 물음에서 Q마다의 급소(Q 직전 B), 앞에서부터. 하나뿐이면 없다.
 *  복합 Q 절마다 서술형태 노드가 하나씩이면 절마다의 서술형태 급소다 */
export type PivotAnalysis = { ok: true; pivot: Pivot; pivots?: Pivot[] } | PivotFailure;

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
  return antecedent(graph, node) ?? keyword;
}

/** 지시어가 가리키는 앞 명사구 — 노드 앞의 가장 가까운 B 노드 실체. 바로 앞 병렬 P(「와」·「과」)가 잇따르면 함께 묶는다 */
function antecedent(graph: PathGraph, node: PathNode): string | undefined {
  let b = graph.nodes.indexOf(node) - 1;
  while (b >= 0 && graph.nodes[b].color !== 'B') b--;
  if (b < 0) return undefined;
  let phrase = graph.nodes[b].entity.trim().replace(/^[\s,]+/, '');
  //   비교구문(`graph.ts`)으로 B가 된 「와/과」 노드도 병렬이다 [오종래 2026-10-07]
  for (let i = b - 1; i >= 0 && (graph.nodes[i].color === 'P' || graph.nodes[i].color === 'B') && PARALLEL.includes(graph.nodes[i].surface); i--) {
    phrase = `${graph.nodes[i].entity.trim()}${graph.nodes[i].surface} ${phrase}`;
  }
  return phrase;
}

/** 간접의문 Q — 간접의문형 표지(인지·는지·은지·을지·ㄴ지·ㄹ지)가 건 노드. 표층이 「~지」 두 글자 이하다 */
function isIndirectQ(node: PathNode): boolean {
  const s = node.surface.trim();
  return s.length <= 2 && s.endsWith('지');
}

/** 작성 형식 블록의 「답」 — 바로 앞 노드가 「~풀이 과정」+「과·와」 P인 B「답」 (「풀이 과정과 답을」) */
function isWritingForm(graph: PathGraph, node: PathNode): boolean {
  if (node.entity.trim() !== '답') return false;
  const prev = graph.nodes[graph.nodes.indexOf(node) - 1];
  return !!prev && prev.color === 'P' && /풀이\s*과정$/.test(prev.entity.trim()) && ['과', '와'].includes(prev.surface.trim());
}

/**
 * B 급소의 실체값 [오종래 2026-10-05] — 급소는 B 노드 이름이 아니라 B가 묻는 실체를 낸다.
 * 실체가 「한글 이름 + 식·기호」(예: 「일반항 a_n」 「점 C(0, -1)」)면 실체값 = 식·기호, 이름은 따로 둔다. 아니면 실체 그대로.
 * [오종래 2026-10-06] 실체 머리의 쉼표·공백은 뗀다 — 앞 조각에서 끌려온 것이다 (수능_3 「, k」 → 「k」). 노드 실체는 그대로다.
 * [오종래 2026-10-06] 끝의 형식 명사 「의 값」도 뗀다 — 실체값은 값을 가진 쪽이다 (서술형2차 수학1 「상수 a, b, c의 값」 → 「a, b, c」).
 * [오종래 2026-10-07] 실체가 지시어(「그것」「이것」「각각」 등, 앞 쉼표를 뗀 뒤)면 가리키는 앞 명사구가 실체값이다 (사회 논제2-2 「, 그것」).
 */
function bValue(node: PathNode, graph: PathGraph): Pick<Pivot, 'keyword' | 'name'> {
  const entity = node.entity.trim().replace(/^[\s,]+/, '').replace(/\s*의\s*값$/, '');
  if (DEICTICS.includes(entity)) return { keyword: antecedent(graph, node) ?? entity };
  const m = entity.match(/^(.*[가-힣ㄱ-ㅎㅏ-ㅣ])\s+([^가-힣ㄱ-ㅎㅏ-ㅣ\s][^가-힣ㄱ-ㅎㅏ-ㅣ]*)$/);
  const symbol = m?.[2].replace(/[\s,]+$/, '');
  return m && symbol ? { keyword: symbol, name: m[1].trim() } : { keyword: entity };
}

/** 서술어 Q — 바로 뒤에 「있」이 오는 「~고 있는/있다」 (예: 「설명하고 있는 현상」) */
function isProgressive(question: string, node: PathNode): boolean {
  return /^\s*있/.test(question.slice(node.index + node.surface.length));
}

/** 공통 발문 Q — 소문항 전체에 거는 지시 (예: 「물음에 답하시오」) */
const COMMON_Q = ['답하시오', '답하여라', '답하라'];

/** 작성 지시 블록의 시작 — 한 줄로 선 <작성 방법>·<작성 조건>·<조건> 머리. 없으면 끝 */
function writingBlockStart(question: string): number {
  const m = /(^|\n)[^\S\n]*<\s*(작성\s*방법|작성\s*조건|조\s*건)\s*>[^\S\n]*(?=\n|$)/.exec(question);
  return m ? m.index + m[1].length : Infinity;
}

/** 서술형태 핵심어에서 앞 명사구로 넘기는 지시어 */
const DEICTICS = ['각각', '각', '이', '그', '이것', '그것', '이들', '그들', '이러한', '그러한'];
/** 앞 명사구를 이어 붙이는 병렬 표지 */
const PARALLEL = ['와', '과'];

/** 서술형태 노드가 둘 이상이면 뒤로 미는 표지(apply.formPerspective)의 노드를 뺀다 — 하나가 남을 때만 */
function narrowForms(forms: PathNode[], perspectives: string[]): PathNode[] {
  if (forms.length < 2) return forms;
  const rest = forms.filter((n) => !perspectives.includes(n.surface.trim()));
  return rest.length === 1 ? rest : forms;
}

/** 복합 Q 절을 나누는 Q 끝 — 이 말로 끝나는 Q 바로 뒤에 쉼표가 오면 절 경계다
 *  [오종래 2026-10-06] 「하고」에 「나타내고」「고르고」「쓰고」 추가
 *  [오종래 2026-10-07] 「기술하고」「요약하고」 명시 (논제1-1·2-1)
 *  [오종래 2026-10-07] 「찾고」 추가 (논제4-1·4-3 「모두 찾고, 그 이유를」) */
const CLAUSE_ENDS = ['하고', '기술하고', '요약하고', '나타내고', '고르고', '쓰고', '찾고'];

/** 서술방법 표지 — B 노드가 있으면 서술형태 급소 후보에서 빠진다 [오종래 2026-10-07] */
const METHOD_MARKERS = ['비판적으로', '비판하여', '입장에서', '관점에서', '참고하여', '참조하여', '바탕으로', '근거하여'];

/**
 * 복합 Q 절 나누기 — 「~하고,」「~나타내고,」「~고르고,」「~쓰고,」 Q(바로 뒤 쉼표)에서 물음을 절로 자른다.
 * 절마다 서술형태 노드가 꼭 하나씩이고 마지막 절에도 Q가 있으면 절 순서대로 그 노드들을, 아니면 undefined.
 */
function formClauses(graph: PathGraph, forms: PathNode[], perspectives: string[]): PathNode[] | undefined {
  const cuts = graph.nodes.filter(
    (n) =>
      n.color === 'Q' &&
      CLAUSE_ENDS.some((e) => n.surface.trim().endsWith(e)) &&
      /^\s*,/.test(graph.question.slice(n.index + n.surface.length)),
  );
  if (!cuts.length) return undefined;
  const picked: PathNode[] = [];
  let start = -1;
  for (const end of [...cuts.map((n) => n.index), Infinity]) {
    const one = narrowForms(forms.filter((n) => n.index > start && n.index < end), perspectives);
    if (one.length !== 1) return undefined;
    if (end === Infinity && !graph.nodes.some((n) => n.color === 'Q' && n.index > start)) return undefined;
    picked.push(one[0]);
    start = end;
  }
  return picked;
}

/**
 * 급소를 산출한다 — 결정론 (구현명세 §2-4).
 * 실패도 값으로 돌려준다: B가 없거나(NO_B) 둘로 수렴하면(MULTIPLE_CONVERGENCE) 플래그.
 */
export function analyze_pivot(graph: PathGraph, table?: SealedTable): PivotAnalysis {
  // 서술형태 급소 [오종래 2026-10-05] — 서술형태 제약(apply.formPivot, C-F) 노드가 있으면 다른 급소 규칙보다 먼저
  //   그 노드가 급소이고, 실체는 그 안의 핵심어다 (예: 인문논술_문1 「논박하는 방식으로」 → 「논박」).
  //   「급소는 B」의 예외다 — 이 규칙에서만 급소가 C 노드다. 둘 이상이면 급소가 둘 — 문제 설계 오류로 플래그한다.
  //   [오종래 2026-10-07] 서술방법 표지(METHOD_MARKERS)의 노드는 B 노드가 있으면 급소 후보에서 빠진다 — B가 급소다
  //   (사회 논제2-2 「비판적으로」 · 논제3-2 「참고하여」). 나머지 서술형태 표지는 그대로 B보다 먼저다.
  const formIds = table?.apply.formPivot ?? [];
  const hasB = graph.nodes.some((n) => n.color === 'B');
  let forms = graph.nodes.filter(
    (n) => formIds.includes(n.switchId) && !(hasB && METHOD_MARKERS.some((m) => n.surface.includes(m))),
  );
  // 서술 형태 우선 [오종래 2026-10-06] — 서술형태 노드가 둘 이상이면 입장·관점 표지(apply.formPerspective, 「입장에서」 등)가
  //   세운 노드를 뺀다. 서술 형태 표지(「비판적으로」 등)가 급소다 (논제1 「(나)의 입장에서 비판적으로 성찰하되」 → 「비판적으로」).
  //   빼고 하나가 남지 않으면 플래그 그대로.
  //   [오종래 2026-10-06] 참고 표지(「참고하여」)도 같이 뒤로 민다 — 수단 표지(「활용하여」「이용하여」)가 「참고하여」「관점에서」
  //   「입장에서」보다 먼저 급소다 (과학 G 「(가)의 개념을 활용하여 … (라)를 참고하여」 → 「활용하여」).
  //   [오종래 2026-10-07] 「활용하여」「이용하여」「토대로」는 C-F에서 빠져 일반 C(LS-43)다 — 서술형태 급소 후보가 아니다.
  const perspectives = (table?.apply.formPerspective ?? []).map((m) => m.replace(/^~/, '').trim());
  forms = narrowForms(forms, perspectives);
  const atForm = (node: PathNode, t: SealedTable): Pivot => ({
    node,
    reason: '서술형태',
    keyword: formKeyword(graph, node, t),
    convergence: convergenceOf(graph, node, t),
    sameAsDeepest: deepest_node(graph)?.id === node.id,
  });
  // 복합 Q 분리 [오종래 2026-10-06] — 서술형태 노드가 둘 이상이어도 「~하고,」 등 Q(CLAUSE_ENDS)로 절이 나뉘고 절마다 하나씩이면
  //   각 절이 독립 물음이다 → 절마다 그 서술형태 노드가 급소 (급소 복수). `pivot`은 마지막 절의 급소.
  //   (예: 과학 논제K 「(조건)에 맞추어 설명하고, 이를 연관지어 … 제안하시오」 → 「맞추어」 / 「연관지어」)
  if (forms.length > 1 && table) {
    const perClause = formClauses(graph, forms, perspectives);
    if (perClause) {
      const pivots = perClause.map((n) => atForm(n, table));
      return { ok: true, pivot: pivots[pivots.length - 1], pivots };
    }
  }
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
  if (forms.length === 1 && table) return { ok: true, pivot: atForm(forms[0], table) };

  // 수량 값 B [오종래 2026-10-06] — 실체가 「몇」(apply.quantityHeads)으로 시작하는 Q(「몇 N인가?」·「몇 g 넣어야 하는지」)는
  //   Q에 접힌 값 B가 묻는 대상이다. 대상 B(Q 직전 B)보다 먼저 그 값 B가 급소다. 실체 = 「몇」과 바로 뒤 어절
  //   (국어·과학 논제4 「몇 N」 · 논제6 「몇 g」). 여럿이면 Q마다 급소 (급소 복수), `pivot`은 마지막.
  const quantityHeads = table?.apply.quantityHeads ?? [];
  const quantities = graph.nodes.filter((n) => n.color === 'Q' && quantityHeads.some((h) => n.entity.trim().startsWith(h)));
  if (quantities.length) {
    const atQuantity = (node: PathNode): Pivot => {
      const head = quantityHeads.find((h) => node.entity.trim().startsWith(h))!;
      const rest = node.entity.trim().slice(head.length).trim().split(/\s+/)[0] ?? '';
      return {
        node,
        reason: '수량 값 B',
        keyword: `${head} ${rest.replace(/(인가|인지)?[?？]?$/, '')}`.trim(),
        convergence: convergenceOf(graph, node, table),
        sameAsDeepest: deepest_node(graph)?.id === node.id,
      };
    };
    const pivots = quantities.map(atQuantity);
    return pivots.length > 1 ? { ok: true, pivot: pivots[pivots.length - 1], pivots } : { ok: true, pivot: pivots[0] };
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
        ...bValue(node, graph),
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
  //   접히지 않고 C로 남은 판단기준 스위치 노드(부등호 조건, graph.ts)는 판단기준이 아니다
  const isJudge = (n: PathNode) => (judgeIds.includes(n.switchId) && n.color === 'B') || graph.edges.some((e) => e.kind === '접힘' && e.to === n.id);
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
  const eligible = (node: PathNode) => {
    if (node.color !== 'B' || node.foldedFrom === 'C' || node.foldedFrom === 'D') return false;
    if (pointsBack && node.entity.trim() === '이') return false; // 지시어 자체는 급소가 아니다
    // 형식 명사 「값」 [오종래 2026-10-02] — 「값」은 급소가 될 수 없다. Q 직전 B로 잡히면 그 앞 B가 급소다
    //   (예: 수리논술_문_4 「lim_{m→1-} f(m)/g(m)의 값을 구하시오」 → 「lim_{m→1-} f(m)/g(m)」).
    if (node.entity.trim() === '값') return false;
    // 작성 형식 블록 [오종래 2026-10-05] — 「풀이 과정과 답을 서술하시오」의 「풀이 과정」(P)과 「답」(B)은 한 묶음의 작성 형식이라
    //   급소가 될 수 없다. 그 앞 B가 급소다 (예: 수학서술형 12 「일반항 a_n을 구하는 풀이 과정과 답을」 → 「일반항 a_n」).
    return !isWritingForm(graph, node);
  };
  const atQ = (node: PathNode): Pivot => ({
    node,
    reason: 'Q 직전 B',
    ...bValue(node, graph),
    convergence: convergenceOf(graph, node, table),
    sameAsDeepest: deepest_node(graph)?.id === node.id,
  });
  for (let i = lastQ - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    if (!eligible(node)) continue;
    // 급소 복수 [오종래 2026-10-05] — Q가 둘 이상이면 Q마다 그 Q 직전 B가 급소다 (서논술형 직렬 물음,
    //   예: 홍익자연논술 (2) 「…을 이용하여 …이 성립함을 보이고, 이를 이용하여 …이 성립함을 보이시오」).
    //   찾는 범위는 앞 Q 뒤부터 그 Q 앞까지 — 사이에 B가 없는 Q(「몇 개인지 구하시오」의 「구하시오」)는 앞 Q와 한 물음이다.
    //   `pivot`은 마지막 Q의 급소 그대로다.
    //   세는 Q는 발문·물음 문단의 직접 Q뿐이다 [오종래 2026-10-05] — 간접의문(「~인지」「~는지」 등)은 Q로 세지 않는다
    //   (제시문 속 「왜 저러는지」·<작성 조건>의 「얼마인지」가 급소를 늘리지 않게).
    //   작성 지시·서술어·공통 발문도 직접 Q가 아니다 [오종래 2026-10-05] — <작성 방법>·<작성 조건>·<조건> 블록 안의 Q(물리13 「서술하시오」 반복),
    //   「~고 있는」 서술어(윤리13 「설명하고 있는」), 공통 발문 「답하시오」(논서술형1)는 세지 않는다.
    const blockAt = writingBlockStart(graph.question);
    const counted = (n: PathNode) => n.color === 'Q' && !isIndirectQ(n) && !isProgressive(graph.question, n) && !COMMON_Q.includes(n.surface.trim()) && n.index < blockAt;
    const pivots: Pivot[] = [];
    let from = 0;
    for (let q = 0; q <= lastQ; q++) {
      if (!counted(graph.nodes[q])) continue;
      for (let j = q - 1; j >= from; j--) {
        if (eligible(graph.nodes[j])) {
          pivots.push(atQ(graph.nodes[j]));
          break;
        }
      }
      from = q + 1;
    }
    return pivots.length > 1 ? { ok: true, pivot: atQ(node), pivots } : { ok: true, pivot: atQ(node) };
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
    pivot: { node, reason: '최수렴 B', ...bValue(node, graph), convergence, sameAsDeepest: deepest_node(graph)?.id === node.id },
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
