// 정교화 — grader-prompt 결과(G, 바닥) 위에 v2 인식 결과(V, 위층)를 얹는다.
//
//   뜻(방향·실체·렌즈)은 G, 위치·경계·색·수렴은 V.
//   둘이 부딪치면 대신 고르지 않는다 — 플래그로 올린다.
//
// 이 파일은 API를 부르지 않는다. 순수 함수.

import type { V2Analysis } from '../fq/pipeline.ts';
import type { PathNode } from '../fq/v2/graph.ts';

/** grader-prompt.md 출력 형식 중 정교화가 읽는 부분 */
export interface GraderResult {
  layer1_grammar?: {
    grammar_no?: number;
    grammar_name?: string;
    question_direction?: string;
    b_candidates?: string[];
  };
  layer2_symbols?: {
    mappings?: { phrase: string; symbol_no?: number; symbol?: string; guide?: string }[];
    keypoint?: {
      b?: string;
      b_source?: string;
      lens_symbol_no?: number;
      lens_symbol?: string;
      substance?: string;
    };
  };
  layer3_flow?: unknown;
  layer4_atomic?: unknown;
}

/** ```json … ``` 으로 감싸 와도 받는다 (NEXT_SESSION 남은 문제 #3) */
export function parseGrader(text: string): GraderResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((fenced ? fenced[1] : text).trim());
}

export type MatchKind = 'exact' | 'contains' | 'contained' | 'text_only' | 'none';

export interface Anchor {
  g_text: string;
  node_id: string | null;
  color: PathNode['color'] | null;
  entity: string | null;
  index: number | null;
  match: MatchKind;
}

/** 비교용 정규화 — 공백 전부 제거. 원문은 그대로 둔다 */
const norm = (s: string) => s.replace(/\s+/g, '');

/** G 문구 하나를 V 노드에 붙인다. 완전 일치 → 노드가 문구를 포함 → 문구가 노드를 포함 → 텍스트 위치만 */
export function anchor(gText: string, nodes: PathNode[], question: string): Anchor {
  const g = norm(gText);
  const of = (n: PathNode, match: MatchKind): Anchor => ({
    g_text: gText,
    node_id: n.id,
    color: n.color,
    entity: n.entity,
    index: n.index,
    match,
  });
  const live = nodes.filter((n) => norm(n.entity));
  const exact = live.find((n) => norm(n.entity) === g);
  if (exact) return of(exact, 'exact');
  const contains = live.find((n) => norm(n.entity).includes(g));
  if (contains) return of(contains, 'contains');
  // 문구가 여러 노드를 품으면 가장 긴 entity를 고른다 (결정론: 같으면 앞선 노드)
  const contained = live
    .filter((n) => g.includes(norm(n.entity)))
    .sort((a, b) => norm(b.entity).length - norm(a.entity).length)[0];
  if (contained) return of(contained, 'contained');
  const at = question.indexOf(gText);
  return { g_text: gText, node_id: null, color: null, entity: null, index: at >= 0 ? at : null, match: at >= 0 ? 'text_only' : 'none' };
}

export type Flag =
  | 'KEYPOINT_CONFLICT'
  | 'KEYPOINT_NOT_B'
  | 'V_MISSING_NODE'
  | 'V_NO_B'
  | 'V_MULTIPLE_CONVERGENCE'
  | 'TIEBREAK_BY_G'
  | 'G_NO_KEYPOINT';

export interface Refined {
  direction: { grammar_no?: number; grammar_name?: string; question_direction?: string };
  keypoint: {
    verdict: '일치' | '충돌' | '잠정' | '없음';
    b: string | null;
    node_id: string | null;
    g_anchor: Anchor | null;
    v_pivot: { node_id: string; entity: string; reason: string; convergence: number } | null;
    substance?: string;
    lens_symbol_no?: number;
    lens_symbol?: string;
    b_source?: string;
  };
  combination: V2Analysis['form']['colors'];
  b_candidates: { kept: Anchor[]; rejected_by_v2: Anchor[]; unverified: Anchor[] };
  color_conflicts: { phrase: string; guide: string; anchor: Anchor }[];
  flags: Flag[];
  layer3_flow: unknown;
  layer4_atomic: unknown;
  stale: boolean;
}

/** 기호26 유도등 문자열에서 5색 글자만 꺼낸다 (예: "B", "C(제약)") — 못 꺼내면 null */
const guideColor = (guide: string) => guide.match(/^[BCPDQ](?![A-Za-z])/)?.[0] ?? null;

export function refine(G: GraderResult, V: V2Analysis): Refined {
  const nodes = V.graph.nodes;
  const flags: Flag[] = [];
  const kp = G.layer2_symbols?.keypoint;

  const vPivot = V.pivot.ok
    ? { node_id: V.pivot.pivot.node.id, entity: V.pivot.pivot.node.entity, reason: V.pivot.pivot.reason, convergence: V.pivot.pivot.convergence }
    : null;
  if (!V.pivot.ok) flags.push(V.pivot.flag === 'NO_B' ? 'V_NO_B' : 'V_MULTIPLE_CONVERGENCE');

  const gAnchor = kp?.b ? anchor(kp.b, nodes, V.question) : null;
  let verdict: Refined['keypoint']['verdict'] = '없음';
  let b: string | null = null;
  let nodeId: string | null = null;

  if (!gAnchor) {
    flags.push('G_NO_KEYPOINT');
    if (vPivot) [verdict, b, nodeId] = ['잠정', vPivot.entity, vPivot.node_id];
  } else if (!gAnchor.node_id) {
    flags.push('V_MISSING_NODE');
    [verdict, b] = ['잠정', gAnchor.g_text];
  } else if (gAnchor.color !== 'B') {
    flags.push('KEYPOINT_NOT_B');
    verdict = '충돌';
    if (vPivot) [b, nodeId] = [vPivot.entity, vPivot.node_id];
  } else if (vPivot && gAnchor.node_id === vPivot.node_id) {
    [verdict, b, nodeId] = ['일치', vPivot.entity, vPivot.node_id];
  } else if (vPivot) {
    flags.push('KEYPOINT_CONFLICT');
    verdict = '충돌';
  } else if (!V.pivot.ok && V.pivot.flag === 'MULTIPLE_CONVERGENCE' && V.pivot.candidates.some((c) => c.id === gAnchor.node_id)) {
    flags.push('TIEBREAK_BY_G');
    [verdict, b, nodeId] = ['잠정', gAnchor.entity, gAnchor.node_id];
  } else {
    [verdict, b, nodeId] = ['잠정', gAnchor.entity, gAnchor.node_id];
  }

  const b_candidates: Refined['b_candidates'] = { kept: [], rejected_by_v2: [], unverified: [] };
  for (const c of G.layer1_grammar?.b_candidates ?? []) {
    if (!c.trim()) continue;
    const a = anchor(c, nodes, V.question);
    if (!a.node_id) b_candidates.unverified.push(a);
    else if (a.color === 'B') b_candidates.kept.push(a);
    else b_candidates.rejected_by_v2.push(a);
  }

  const color_conflicts: Refined['color_conflicts'] = [];
  for (const m of G.layer2_symbols?.mappings ?? []) {
    const gc = m.guide ? guideColor(m.guide) : null;
    if (!gc || !m.phrase) continue;
    const a = anchor(m.phrase, nodes, V.question);
    if (a.node_id && a.color !== gc) color_conflicts.push({ phrase: m.phrase, guide: m.guide!, anchor: a });
  }

  return {
    direction: {
      grammar_no: G.layer1_grammar?.grammar_no,
      grammar_name: G.layer1_grammar?.grammar_name,
      question_direction: G.layer1_grammar?.question_direction,
    },
    keypoint: {
      verdict,
      b,
      node_id: nodeId,
      g_anchor: gAnchor,
      v_pivot: vPivot,
      substance: kp?.substance,
      lens_symbol_no: kp?.lens_symbol_no,
      lens_symbol: kp?.lens_symbol,
      b_source: kp?.b_source,
    },
    combination: V.form.colors,
    b_candidates,
    color_conflicts,
    flags,
    layer3_flow: G.layer3_flow,
    layer4_atomic: G.layer4_atomic,
    stale: verdict !== '일치' && verdict !== '없음' && b !== null && kp?.b !== undefined && norm(b) !== norm(kp.b),
  };
}
