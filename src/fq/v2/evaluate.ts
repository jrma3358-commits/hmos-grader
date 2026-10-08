// 문항 평가 — 급소(analyze_pivot)를 받아 실체·서술 정합성·결론·대안을 낸다
//
// [오종래 2026-10-08] 설계 확정
//   실체   keyword가 형식어(FORM_WORDS, 전체 일치)면 실체 아님, 아니면 실체
//   8  「Q 연결」 = 급소 노드와 그 뒤 첫 Q 사이에 다른 B가 없다
//   9  「P에만 있음」 = 급소 keyword가 P 노드 실체에만 있고, P 아닌 노드 실체(급소 노드 포함)에는 없다
//   10 「지시대상 불명확」 = keyword 첫 어절이 지시어(DEICTICS)다
//   11 형식어 → 실체: 같은 Q 절에서 형식어 급소 앞의 실체 B를 꺼내 「X의 값을 구하고, 그 형식어를」로 바꾼다.
//      꺼낸 실체에 수식 기호(등호·부등호)가 있으면 값을 구할 대상이 아니다 → 대안 불가
//   12 지시대상 불명확이면 대안 불가 — 대안 문장을 만들지 않고 막는다
//   13 대안은 해당하는 규칙 수만큼, 최대 2개
//   결론   실체✅+정합✅ → 통과 · 실체✅+정합⚠️ → 보완 권장 · 실체❌ → 수정 필요
//
//   [오종래 2026-10-08] B계열 재추적은 하지 않는다 — 서술형태(C-F) 급소는 그대로 평가한다 (문항5 「반례」)
//   [오종래 2026-10-08] 보완 권장인데 대안이 막히거나 없으면 결론은 그대로, 「대안 불가」·「대안 없음」으로 둔다
// 이 층은 평가하고 멈춘다. 풀지 않는다.

import type { PathGraph, PathNode } from './graph.ts';
import { DEICTICS, type Pivot, type PivotAnalysis, type PivotFlag } from './pivot.ts';

/** 형식어 — 실체 아님. 지시에 적힌 네 낱말, keyword 전체 일치 [오종래 2026-10-08 확정] */
export const FORM_WORDS = ['과정', '성립함', '나타내시오', '설명하시오'];

/** 수식 기호 — 꺼낸 실체에 있으면 식·명제라 「X의 값」 대안을 막는다 */
const FORMULA_SIGNS = /[=<>≤≥≠]/;

export interface Coherence {
  /** 8 — 급소와 그 뒤 첫 Q 사이에 다른 B가 없다 */
  linked: boolean;
  /** 9 — 급소 keyword가 P 노드 실체에만 있다 */
  passageOnly: boolean;
  /** 10 — keyword 첫 어절이 지시어다 */
  deictic: boolean;
  /** 셋 다 문제없으면 true(✅), 아니면 false(⚠️) */
  ok: boolean;
}

export interface Alternative {
  rule: '형식어→실체';
  /** 원문(정규화된 물음)에서 바꾼 부분 */
  from: string;
  to: string;
  /** 바꾼 물음 전체 — 문단 경계는 줄바꿈 하나 (graph.question과 같다) */
  question: string;
}

export type EvaluationVerdict = '통과' | '보완 권장' | '수정 필요';

export interface PivotEvaluation {
  pivot: Pivot;
  /** keyword가 형식어가 아니다 */
  substance: boolean;
  coherence: Coherence;
  verdict: EvaluationVerdict;
  alternatives: Alternative[];
  /** 대안을 막은 까닭 — 12 지시대상 불명확 · 11 꺼낸 실체에 수식 기호 */
  blocked?: '지시대상 불명확' | '실체에 수식 기호';
}

export type Evaluation = { ok: true; items: PivotEvaluation[] } | { ok: false; flag: PivotFlag };

const clean = (s: string) => s.trim().replace(/^[\s,]+/, '');
const keywordOf = (p: Pivot) => clean(p.keyword ?? p.node.entity);
const isDeictic = (s: string) => DEICTICS.includes(s.split(/\s+/)[0]);

/** 받침 유무로 조사를 고른다. 한글 음절이 아니면 둘 다 적는다 (generate.ts와 같다) */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.at(-1)!.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${withFinal}(${withoutFinal})`;
  return (code - 0xac00) % 28 ? withFinal : withoutFinal;
}

function coherence(graph: PathGraph, p: Pivot): Coherence {
  const kw = keywordOf(p);
  let linked = false;
  for (const n of graph.nodes.slice(graph.nodes.indexOf(p.node) + 1)) {
    if (n.color === 'Q') {
      linked = true;
      break;
    }
    if (n.color === 'B') break;
  }
  const inP = graph.nodes.some((n) => n.color === 'P' && n.entity.includes(kw));
  const elsewhere = graph.nodes.some((n) => n.color !== 'P' && n.entity.includes(kw));
  const passageOnly = inP && !elsewhere;
  const deictic = isDeictic(kw);
  return { linked, passageOnly, deictic, ok: linked && !passageOnly && !deictic };
}

/** 11 — 형식어 급소 앞, 같은 Q 절 안의 실체 B를 꺼낸다. 실체에 수식 기호가 있으면 막는다 */
function formToEntity(graph: PathGraph, p: Pivot): Alternative | 'blocked' | undefined {
  const kw = keywordOf(p);
  if (!FORM_WORDS.includes(kw)) return undefined;
  let x: PathNode | undefined;
  for (let i = graph.nodes.indexOf(p.node) - 1; i >= 0; i--) {
    const n = graph.nodes[i];
    if (n.color === 'Q') break;
    const e = clean(n.entity);
    if (n.color === 'B' && e && !FORM_WORDS.includes(e) && !isDeictic(e)) {
      x = n;
      break;
    }
  }
  if (!x) return undefined;
  const ex = clean(x.entity);
  if (FORMULA_SIGNS.test(ex)) return 'blocked';
  const found = graph.question.lastIndexOf(ex, x.index);
  const start = found >= 0 ? found : x.index;
  const end = p.node.index + p.node.surface.length;
  const to = `${ex}의 값을 구하고, 그 ${kw}${josa(kw, '을', '를')}`;
  return { rule: '형식어→실체', from: graph.question.slice(start, end), to, question: graph.question.slice(0, start) + to + graph.question.slice(end) };
}

function evaluateOne(graph: PathGraph, pivot: Pivot): PivotEvaluation {
  const substance = !FORM_WORDS.includes(keywordOf(pivot));
  const c = coherence(graph, pivot);
  const verdict: EvaluationVerdict = !substance ? '수정 필요' : c.ok ? '통과' : '보완 권장';
  const base = { pivot, substance, coherence: c, verdict };
  if (verdict === '통과') return { ...base, alternatives: [] };
  if (c.deictic) return { ...base, alternatives: [], blocked: '지시대상 불명확' };
  const form = formToEntity(graph, pivot);
  if (form === 'blocked') return { ...base, alternatives: [], blocked: '실체에 수식 기호' };
  return { ...base, alternatives: form ? [form].slice(0, 2) : [] };
}

/** 급소마다 실체·정합·결론·대안. 급소가 플래그로 서지 않았으면 평가하지 않는다 */
export function evaluate_pivot(analysis: PivotAnalysis, graph: PathGraph): Evaluation {
  if (!analysis.ok) return { ok: false, flag: analysis.flag };
  return { ok: true, items: (analysis.pivots ?? [analysis.pivot]).map((p) => evaluateOne(graph, p)) };
}
