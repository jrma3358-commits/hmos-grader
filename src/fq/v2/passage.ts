// 제시문 인식 — 단락 급소 → 전체 급소 → 논제 연결
//
// 정본: `HMOS_제시문인식원리_구조화.md` · `HMOS_제시문인식원리_원문.md` (2026-10-07 오종래)
//   §3 단락 단위 인식 절차 — 단락을 끊고, P·B·D·C를 잡고, 단락의 급소(무게중심 B)를 잡고, 단락들을 이어 전체 무게중심을 잡는다
//   §2 제시문에서 Q는 표면에 드러나지 않고 B 안에 접혀 있다 · 무대(P)와 신상(D)은 급소가 아니다 — 급소는 B다
//   §4 논제-제시문 연결 — 논제의 기호(㉠·㉡)는 제시문 단락에서 온 B 실체 · 논제의 지정(<가>를 바탕으로)은 그 제시문 급소가 논제의 C가 된 것
//   §5 검증 기준 — 단락별 급소 · 전체 무게중심 하나로 수렴 · 그 무게중심이 논제 급소와 맞물리는가
//
// 노드와 급소는 논제 인식과 같은 5색 규칙이다 — recognizeV2Analysis와 같은 층(normalizeV2 → build_path_graph → analyze_pivot)을 단락마다 돌린다.
// 이 층은 급소를 잡고 연결을 확인하면 멈춘다. 풀지 않는다.

import { normalizeV2, type V2Analysis } from '../pipeline.ts';
import type { SealedTable } from '../sealed/schema.ts';
import type { Color } from '../types.ts';
import { build_path_graph, type PathGraph, type PathNode } from './graph.ts';
import { analyze_pivot, type Pivot, type PivotAnalysis } from './pivot.ts';

/** 급소가 B 하나로 서지 않은 까닭 — 엔진 플래그(NO_B·MULTIPLE_CONVERGENCE) 그대로, 또는
 *  NOT_B = 급소가 B가 아니다(§2: 급소는 B다) · MULTIPLE = 급소가 둘 이상 (단락의 급소는 하나다) */
export type PassagePivotFlag = 'NO_B' | 'MULTIPLE_CONVERGENCE' | 'NOT_B' | 'MULTIPLE';

export interface PassagePivot {
  /** 급소(무게중심 B). 서지 않았으면 없다 — flag가 까닭이다 */
  pivot?: Pivot;
  flag?: PassagePivotFlag;
  /** 엔진 급소 결과 그대로 */
  analysis: PivotAnalysis;
}

export interface PassageParagraph extends PassagePivot {
  /** 단락 머리 기호 — [가]·<가>·(가)의 글자 또는 「단락N:」의 N. 없으면 없다 */
  label?: string;
  /** 머리 기호를 뗀 단락 본문 */
  text: string;
  graph: PathGraph;
  /** 색별 노드 실체 — Q는 표면 노드가 있으면 그대로 싣는다 (제시문에서 Q는 B 안에 접힌다, §2) */
  colors: Record<Color, string[]>;
}

export interface PassageRecognition extends PassagePivot {
  paragraphs: PassageParagraph[];
  /** 단락들을 이어 붙인 전체의 그래프 (§3-7) */
  graph: PathGraph;
}

/** 단락 머리 기호 — [가] · <가> · (가) · 단락N: */
const HEAD_LABEL = /^\s*(?:\[([가-힣])\]|<([가-힣])>|\(([가-힣])\)|단락\s*(\d+)\s*:)\s*/;

function pivotOf(graph: PathGraph, table: SealedTable): PassagePivot {
  const analysis = analyze_pivot(graph, table);
  if (!analysis.ok) return { analysis, flag: analysis.flag };
  if (analysis.pivots && analysis.pivots.length > 1) return { analysis, flag: 'MULTIPLE' };
  if (analysis.pivot.node.color !== 'B') return { analysis, flag: 'NOT_B' };
  return { analysis, pivot: analysis.pivot };
}

function colorsOf(nodes: PathNode[]): Record<Color, string[]> {
  const out: Record<Color, string[]> = { P: [], B: [], D: [], C: [], Q: [] };
  for (const n of nodes) if (n.color) out[n.color].push(n.entity);
  return out;
}

/**
 * 제시문 인식 — 단락을 끊고(§3-1, 문단 경계 = 빈 줄, normalizeV2와 같다), 단락마다 5색 노드와 급소를 잡고,
 * 단락들을 이어 붙인 전체에 같은 급소 규칙을 걸어 전체 무게중심을 잡는다 (§3-7).
 */
export function recognizePassage(text: string, table: SealedTable): PassageRecognition {
  const paragraphs = normalizeV2(text)
    .split('\n')
    .map((raw): PassageParagraph => {
      const m = raw.match(HEAD_LABEL);
      const label = m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : undefined;
      const body = m ? raw.slice(m[0].length) : raw;
      const graph = build_path_graph(body, table);
      return { label, text: body, graph, colors: colorsOf(graph.nodes), ...pivotOf(graph, table) };
    })
    .filter((p) => p.text.trim() !== '');
  const graph = build_path_graph(paragraphs.map((p) => p.text).join('\n'), table);
  return { paragraphs, graph, ...pivotOf(graph, table) };
}

export type PassageLinkKind =
  /** 논제 B 실체의 기호(㉠·㉡)가 이 단락에 있다 — 그 단락에서 온 B 실체 (§4) */
  | '기호'
  /** 논제가 이 단락을 지정했다(<가>를 바탕으로) — 단락 급소가 논제의 C(근거 조건)가 된 것 (§4) */
  | '지정'
  /** 논제 급소와 단락 급소의 실체값이 같거나 한쪽이 다른 쪽을 품는다 (§4 「맞물린다」) */
  | '맞물림';

export interface PassageLink {
  kind: PassageLinkKind;
  /** paragraphs의 자리 */
  paragraph: number;
  /** 논제 쪽 노드 id */
  questionNode: string;
}

export interface PassageConnection {
  links: PassageLink[];
  /** 전체 제시문 급소가 논제 급소와 맞물리는가 (§5). 어느 쪽 급소든 서지 않았으면 없다 */
  wholeMatches?: boolean;
  /** 놀고 있는 급소 — 단락 급소가 섰는데 논제와 어떤 연결도 없는 단락 (추가 논제 후보) */
  idle: number[];
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

const keywordOf = (p: Pivot) => (p.keyword ?? p.node.entity).trim();
const meshes = (a: string, b: string) => a !== '' && b !== '' && (a.includes(b) || b.includes(a));

/**
 * 논제-제시문 연결 확인 (§4·§5) — 기호 · 지정 · 급소 맞물림. 어느 연결도 없는 단락 급소는 놀고 있는 급소다.
 * 어긋남(설계 오류인지 인식 갭인지)은 판정하지 않는다 — 연결이 없다는 사실만 낸다.
 */
export function connectPassage(question: V2Analysis, passage: PassageRecognition): PassageConnection {
  const links: PassageLink[] = [];
  const add = (kind: PassageLinkKind, paragraph: number, questionNode: string) => {
    if (!links.some((l) => l.kind === kind && l.paragraph === paragraph && l.questionNode === questionNode)) {
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

  const qPivots = question.pivot.ok ? (question.pivot.pivots ?? [question.pivot.pivot]) : [];
  for (const q of qPivots) {
    passage.paragraphs.forEach((p, i) => p.pivot && meshes(keywordOf(q), keywordOf(p.pivot)) && add('맞물림', i, q.node.id));
  }

  const wholeMatches =
    passage.pivot && qPivots.length ? qPivots.some((q) => meshes(keywordOf(q), keywordOf(passage.pivot!))) : undefined;
  const idle = passage.paragraphs.flatMap((p, i) => (p.pivot && !links.some((l) => l.paragraph === i) ? [i] : []));
  return { links, wholeMatches, idle };
}
