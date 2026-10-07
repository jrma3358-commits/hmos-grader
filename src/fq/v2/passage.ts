// 제시문 인식 — 단락 서두·말미 → 논제 방향으로 단락 급소 → 논제 연결
//
// 정본: `HMOS_제시문인식원리_구조화.md` · `HMOS_제시문인식원리_원문.md` (2026-10-07 오종래)
//   §3 단락 단위 인식 절차 — 단락을 끊고, P·B·D·C를 잡고, 단락의 급소(무게중심 B)를 잡고, 단락들을 이어 전체 무게중심을 잡는다
//   §2 제시문에서 Q는 표면에 드러나지 않고 B 안에 접혀 있다 · 무대(P)와 신상(D)은 급소가 아니다 — 급소는 B다
//   제시문 급소 규칙 — 단락 급소는 서두의 핵심 B 아니면 말미의 핵심 B. 나머지 B는 부연·가지.
//     제시문 급소는 논제 급소에 닿아 있는 B다 — 논제가 방향을 잡은 뒤 찾는다 (논제 없이는 정하지 않는다)
//   판별 확정 원칙 — ① 서두·말미 = keyword를 가진 B (노드 순서가 아니다) ② 닿는다 = 논제 급소 keyword·관련 정보를 품는다
//     ③ 가운데 급소는 없다 ④ 급소 없는 단락 = 배경지식 단락(background)
//   §4 논제-제시문 연결 — 논제의 기호(㉠·㉡)는 제시문 단락에서 온 B 실체 · 논제의 지정(<가>를 바탕으로)은 그 제시문 급소가 논제의 C가 된 것
//   §5 검증 기준 — 단락별 급소 · 전체 무게중심 하나로 수렴 · 그 무게중심이 논제 급소와 맞물리는가
//
//   [오종래 2026-10-07] 3규칙 — ① 지시어 역추적: 서두·말미 B가 지시어(이러한·그·이·해당 등)면 앞 단락 급소로 대체
//     ② keyword 특이도: 일반 명사(apply.passageKeyExceptions)는 keyword로 인정하지 않는다
//     ③ 서술문 B: 단락 첫 문장이 「X이다.」면 X 전체를 서두 B로 세운다 (「~이다.」 스위치와 같은 층)
//
// 노드는 논제 인식과 같은 5색 규칙이다 — recognizeV2Analysis와 같은 층(normalizeV2 → build_path_graph)을 단락마다 돌린다.
// 의미 정합(원칙 ②의 「의미 정합」)은 표지로 잡을 수 없어 여기서 판정하지 않는다 — keyword 포함만 본다.
// 이 층은 급소를 잡고 연결을 확인하면 멈춘다. 풀지 않는다.

import { normalizeV2, type V2Analysis } from '../pipeline.ts';
import type { SealedTable } from '../sealed/schema.ts';
import type { Color } from '../types.ts';
import { build_path_graph, type PathGraph, type PathNode } from './graph.ts';
import { analyze_pivot, DEICTICS, type Pivot, type PivotAnalysis } from './pivot.ts';

/** 급소가 B 하나로 서지 않은 까닭 — 엔진 플래그(NO_B·MULTIPLE_CONVERGENCE) 그대로, 또는
 *  NOT_B = 급소가 B가 아니다(§2: 급소는 B다) · MULTIPLE = 급소가 둘 이상 */
export type PassagePivotFlag = 'NO_B' | 'MULTIPLE_CONVERGENCE' | 'NOT_B' | 'MULTIPLE';

export interface PassageParagraph {
  /** 단락 머리 기호 — [가]·<가>·(가)의 글자 또는 「단락N:」의 N. 없으면 없다 */
  label?: string;
  /** 머리 기호를 뗀 단락 본문 */
  text: string;
  graph: PathGraph;
  /** 색별 노드 실체 — Q는 표면 노드가 있으면 그대로 싣는다 (제시문에서 Q는 B 안에 접힌다, §2) */
  colors: Record<Color, string[]>;
  /** 서두(첫 문장)의 B 노드 — 급소 후보 자리 */
  head: PathNode[];
  /** 말미(마지막 문장)의 B 노드 — 급소 후보 자리. 한 문장 단락이면 서두와 같다 */
  tail: PathNode[];
}

export interface PassageRecognition {
  paragraphs: PassageParagraph[];
  /** 단락들을 이어 붙인 전체의 그래프 (§3-7) */
  graph: PathGraph;
  /** 전체 급소(무게중심 B). 서지 않았으면 없다 — flag가 까닭이다 */
  pivot?: Pivot;
  flag?: PassagePivotFlag;
  /** 엔진 급소 결과 그대로 */
  analysis: PivotAnalysis;
  /** 제시문 열쇠 예외 (apply.passageKeyExceptions) — 연결 때 쓴다 */
  keyExceptions: string[];
}

/** 단락 머리 기호 — [가] · <가> · (가) · 단락N: */
const HEAD_LABEL = /^\s*(?:\[([가-힣])\]|<([가-힣])>|\(([가-힣])\)|단락\s*(\d+)\s*:)\s*/;
/** 문장 끝 — 마침표·물음표·느낌표 뒤 공백 */
const SENTENCE_END = /[.?!](?=\s|$)/g;

function colorsOf(nodes: PathNode[]): Record<Color, string[]> {
  const out: Record<Color, string[]> = { P: [], B: [], D: [], C: [], Q: [] };
  for (const n of nodes) if (n.color) out[n.color].push(n.entity);
  return out;
}

/** 첫 문장 끝과 마지막 문장 시작 — 서두·말미 자리 (원칙 ③: 그 사이는 가운데) */
function sentenceSpan(text: string): { headEnd: number; tailStart: number } {
  const ends = [...text.trimEnd().matchAll(SENTENCE_END)].map((m) => m.index! + 1);
  const inner = ends.filter((e) => e < text.trimEnd().length);
  return { headEnd: inner[0] ?? text.length, tailStart: inner.at(-1) ?? 0 };
}

/**
 * 제시문 인식 — 단락을 끊고(§3-1, 문단 경계 = 빈 줄, normalizeV2와 같다), 단락마다 5색 노드와 서두·말미의 B를 잡는다.
 * 단락 급소는 여기서 정하지 않는다 — 논제가 방향을 잡은 뒤 `connectPassage`가 정한다 (제시문 급소 규칙).
 * 전체는 단락들을 이어 붙인 그래프에 기존 급소 규칙을 건다 (§3-7).
 */
export function recognizePassage(text: string, table: SealedTable): PassageRecognition {
  const copula = table.switches.find((s) => s.markers.some((m) => m.trim() === '~이다.'));
  const paragraphs = normalizeV2(text)
    .split('\n')
    .map((raw): PassageParagraph => {
      const m = raw.match(HEAD_LABEL);
      const label = m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : undefined;
      const body = m ? raw.slice(m[0].length) : raw;
      const graph = build_path_graph(body, table);
      const { headEnd, tailStart } = sentenceSpan(body);
      const bs = graph.nodes.filter((n) => n.color === 'B');
      const head = bs.filter((n) => n.index < headEnd);
      const tail = bs.filter((n) => n.index >= tailStart);
      const colors = colorsOf(graph.nodes);
      const stated = copula && statementB(body, headEnd, graph.nodes, copula.id);
      if (stated) {
        head.push(stated);
        if (tailStart === 0) tail.push(stated);
        colors.B.push(stated.entity);
      }
      return { label, text: body, graph, colors, head, tail };
    })
    .filter((p) => p.text.trim() !== '');
  const graph = build_path_graph(paragraphs.map((p) => p.text).join('\n'), table);
  const analysis = analyze_pivot(graph, table);
  const whole: Pick<PassageRecognition, 'pivot' | 'flag'> = !analysis.ok
    ? { flag: analysis.flag }
    : analysis.pivots && analysis.pivots.length > 1
      ? { flag: 'MULTIPLE' }
      : analysis.pivot.node.color !== 'B'
        ? { flag: 'NOT_B' }
        : { pivot: analysis.pivot };
  return { paragraphs, graph, analysis, keyExceptions: table.apply.passageKeyExceptions ?? [], ...whole };
}

/**
 * 서술문 B [오종래 2026-10-07] — 첫 문장이 「X이다.」면 X 전체가 서두 B다 (「첫 번째 방식은 만장일치에 의한 의사결정이다.」
 * → B「만장일치에 의한 의사결정」). X = 그 문장에서 마지막 노드 뒤부터 「이다.」 앞까지. 색과 스위치는 「~이다.」 스위치(B)의 것이다.
 */
function statementB(body: string, headEnd: number, nodes: PathNode[], switchId: string): PathNode | undefined {
  const sentence = body.slice(0, headEnd);
  const m = sentence.match(/이다\.\s*$/);
  if (!m) return undefined;
  const at = m.index!;
  if (nodes.some((n) => n.index === at)) return undefined; // 그래프가 이미 「~이다.」 노드를 세웠다
  const last = nodes.filter((n) => n.index < at).at(-1);
  const from = last ? last.index + last.surface.length : 0;
  const entity = clean(body.slice(from, at));
  if (!entity) return undefined;
  return { id: 'stated', surface: '이다.', switchId, index: at, color: 'B', entity };
}

export type PassageLinkKind =
  /** 논제 B 실체의 기호(㉠·㉡)가 이 단락에 있다 — 그 단락에서 온 B 실체 (§4) */
  | '기호'
  /** 논제가 이 단락을 지정했다(<가>를 바탕으로) — 단락 급소가 논제의 C(근거 조건)가 된 것 (§4) */
  | '지정'
  /** 이 단락의 급소가 논제 급소 keyword·관련 정보에 닿는다 (원칙 ②) */
  | '급소';

export interface PassageLink {
  kind: PassageLinkKind;
  /** paragraphs의 자리 */
  paragraph: number;
  /** 논제 쪽 노드 id */
  questionNode: string;
}

/** 논제 방향으로 정한 단락 급소 */
export interface ParagraphPivot {
  /** 단락 급소 B 노드 */
  node: PathNode;
  /** 급소의 실체 — 노드 실체, 또는 지시어면 앞 단락 급소의 실체 (지시어 역추적) */
  entity: string;
  /** 지시어 역추적으로 대체됐으면 원래 노드 실체 */
  deixis?: string;
  /** 서두 아니면 말미 (원칙 ③) */
  place: '서두' | '말미';
  /** 닿은 논제 쪽 말 (논제 급소 keyword 또는 관련 정보) */
  key: string;
  /** 닿은 논제 노드 id */
  questionNode: string;
}

export interface PassageConnection {
  /** 단락마다 급소. 없으면 null — 그 단락은 background다 (원칙 ④) */
  pivots: (ParagraphPivot | null)[];
  links: PassageLink[];
  /** 전체 제시문 급소가 논제 급소와 맞물리는가 (§5). 어느 쪽 급소든 서지 않았으면 없다 */
  wholeMatches?: boolean;
  /** 배경지식 단락 — 급소가 없는 단락. 논제 해결을 위해 펼쳐놓은 배경 (원칙 ④) */
  background: number[];
  /** 논제가 참조한 제시문 기호 (「제시문 [가], [나], [다]를 참고하여」 → 가·나·다). 참조가 없으면 없다 — 모든 단락이 후보 */
  scope?: string[];
  /** 참조 범위 밖 단락 — 연결 후보가 아니다 (급소·연결·background 모두 없음) */
  outOfScope: number[];
}

/** 원문자 기호 ㉠~㉻ */
const CIRCLED = /[㉠-㉻]/g;
/** 괄호 기호 순서 — 범위 「(나)~(라)」를 펼 때 쓴다 */
const LABEL_ORDER = '가나다라마바사아자차카타파하';

/** 노드 실체 속 제시문 지정 기호의 글자들 — [가]·<가>·(가), 나열과 범위 포함 */
function designatedLabels(entity: string): string[] {
  const out: string[] = [];
  const re = /[[<(]([가-힣])[\]>)](?:\s*[~∼～]\s*[[<(]([가-힣])[\]>)])?/g;
  for (const m of entity.matchAll(re)) {
    const from = LABEL_ORDER.indexOf(m[1]);
    const to = m[2] ? LABEL_ORDER.indexOf(m[2]) : -1;
    if (from >= 0 && to > from) out.push(...LABEL_ORDER.slice(from, to + 1));
    else out.push(m[1], ...(m[2] ? [m[2]] : []));
  }
  return out;
}

/** 논제의 제시문 참조 — 「제시문」 뒤 기호 나열·범위 ([가], [나], [다] · (나)~(라) · <가>·<나>) */
const PASSAGE_REFERENCE = /제시문\s*((?:[[<(][가-힣][\]>)](?:\s*(?:[,·~∼～]|및|와|과)\s*)?)+)/g;

/**
 * 논제가 참조한 제시문 기호 — 마지막 참조를 쓴다 (공통 발문의 「제시문 [가]~[마]」 뒤에 소문항 자신의 참조가 온다).
 * 참조가 없으면 undefined.
 */
function referencedLabels(question: string): string[] | undefined {
  const last = [...question.matchAll(PASSAGE_REFERENCE)].at(-1);
  const labels = last && designatedLabels(last[1]);
  return labels?.length ? labels : undefined;
}

const clean = (s: string) => s.trim().replace(/^[\s,]+/, '');
/** keyword 포함 (원칙 ②) — 한쪽이 다른 쪽을 품는다. 품기는 쪽은 두 글자 이상 (한 글자 조각은 어디에나 들어 있다) */
const contains = (a: string, b: string) => (b.length >= 2 && a.includes(b)) || (a.length >= 2 && b.includes(a));

/**
 * 논제 방향의 열쇠 — 논제 급소 keyword가 먼저, 관련 정보(논제의 다른 B 노드 실체)가 다음 (원칙 ②).
 * 서술형태 급소(「논박」)처럼 B가 아닌 급소도 keyword는 그대로 열쇠다.
 */
function questionKeys(question: V2Analysis): { key: string; node: string }[] {
  const keys: { key: string; node: string }[] = [];
  const add = (key: string, node: string) => {
    const k = clean(key);
    if (k && !keys.some((x) => x.key === k)) keys.push({ key: k, node });
  };
  if (question.pivot.ok) for (const p of question.pivot.pivots ?? [question.pivot.pivot]) add(p.keyword ?? p.node.entity, p.node.id);
  for (const n of question.graph.nodes) if (n.color === 'B') add(n.entity, n.id);
  return keys;
}

/** 지시어 — 논제 급소의 지시어(pivot.ts)에 「해당」을 더한다. 실체 첫 어절이 지시어면 지시어 B다 */
const PASSAGE_DEICTICS = [...DEICTICS, '해당'];
const isDeictic = (entity: string) => PASSAGE_DEICTICS.includes(clean(entity).split(/\s+/)[0]);

/**
 * 단락 급소 — 서두·말미의 B 가운데 열쇠를 품은 B (원칙 ①②③). 열쇠 순서가 앞선 것, 같으면 서두가 먼저.
 * 지시어 B는 앞 단락 급소의 실체로 대체해 본다 (지시어 역추적). 열쇠 예외 낱말 그대로인 실체는 닿지 않는다 (keyword 특이도).
 */
function paragraphPivot(
  p: PassageParagraph,
  keys: { key: string; node: string }[],
  prev: ParagraphPivot | null,
  exceptions: string[],
): ParagraphPivot | null {
  const resolve = (n: PathNode) => (isDeictic(n.entity) && prev ? { entity: prev.entity, deixis: clean(n.entity) } : { entity: clean(n.entity) });
  for (const { key, node } of keys) {
    for (const [place, nodes] of [['서두', p.head], ['말미', p.tail]] as const) {
      for (const n of nodes) {
        const r = resolve(n);
        if (!exceptions.includes(r.entity) && contains(r.entity, key)) return { node: n, ...r, place, key, questionNode: node };
      }
    }
  }
  return null;
}

/**
 * 단락마다 속한 제시문 기호 — 머리 기호가 없는 단락은 앞 단락의 기호를 잇는다 (한 제시문의 이어진 단락).
 * 숫자 머리(단락N:)는 제시문 기호가 아니다.
 */
export function passageLabels(paragraphs: PassageParagraph[]): (string | undefined)[] {
  let current: string | undefined;
  return paragraphs.map((p) => (current = p.label && LABEL_ORDER.includes(p.label) ? p.label : p.label ? undefined : current));
}

/**
 * 논제-제시문 연결 (§4·§5·제시문 급소 규칙) — 논제가 방향을 잡고, 단락마다 서두·말미에서 닿는 B를 급소로 정한다.
 * 급소가 없는 단락은 배경지식 단락이다. 기호·지정 연결은 급소와 따로 본다.
 * 논제가 참조 제시문을 밝혔으면(「제시문 [가], [나], [다]를 참고하여」) 그 단락만 연결 후보다 — keyword만으로는 논제별 참조 범위를 모른다.
 */
export function connectPassage(question: V2Analysis, passage: PassageRecognition): PassageConnection {
  const exceptions = passage.keyExceptions;
  const keys = questionKeys(question).filter((k) => !exceptions.includes(k.key));
  const scope = referencedLabels(question.question);
  const labels = passageLabels(passage.paragraphs);
  const inScope = (i: number) => !scope || (labels[i] !== undefined && scope.includes(labels[i]!));
  const outOfScope = passage.paragraphs.flatMap((_, i) => (inScope(i) ? [] : [i]));
  const pivots: (ParagraphPivot | null)[] = [];
  passage.paragraphs.forEach((p, i) => pivots.push(inScope(i) ? paragraphPivot(p, keys, pivots.at(-1) ?? null, exceptions) : null));

  const links: PassageLink[] = [];
  const add = (kind: PassageLinkKind, paragraph: number, questionNode: string) => {
    if (inScope(paragraph) && !links.some((l) => l.kind === kind && l.paragraph === paragraph && l.questionNode === questionNode)) {
      links.push({ kind, paragraph, questionNode });
    }
  };
  for (const n of question.graph.nodes) {
    if (n.color === 'B') {
      for (const sym of n.entity.match(CIRCLED) ?? []) {
        passage.paragraphs.forEach((p, i) => p.text.includes(sym) && add('기호', i, n.id));
      }
    }
    for (const label of designatedLabels(n.entity)) {
      passage.paragraphs.forEach((p, i) => p.label === label && add('지정', i, n.id));
    }
  }
  pivots.forEach((pv, i) => pv && add('급소', i, pv.questionNode));

  const wholeKey = passage.pivot && clean(passage.pivot.keyword ?? passage.pivot.node.entity);
  const wholeMatches = wholeKey !== undefined && keys.length ? keys.some((k) => contains(wholeKey, k.key)) : undefined;
  const background = pivots.flatMap((pv, i) => (pv || !inScope(i) ? [] : [i]));
  return { pivots, links, wholeMatches, background, ...(scope && { scope }), outOfScope };
}
