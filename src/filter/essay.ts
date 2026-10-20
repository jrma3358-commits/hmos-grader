// 논술형 문항 분석 — 1차 필터 (문항분석 명세서-2 §3). 인문사회논술에 쓴다.
// 3-1 제시문 각각 → 핵심 (제시문 = 답변 취급, 같은 급소 엔진)
// 3-2 제시문 핵심 쌍 → 관계 (유사/대비/실증)          — 규칙은 sealed/relation.ts([봉인⑧])
// 3-3 논제가 제시문에 요구하는 것(표적·관계·도구) → 연결점 — 요구를 읽는 규칙은 sealed/thesis.ts([봉인⑨])
// 여기에는 구조만 있다. 관계·표적 요구는 ⑧ 관계가 서면 성립, 도구 요구는 제시문이 있으면 성립 (오종래 2026-10-20).
// [오종래 2026-09-30] 논제 급소가 서지 않으면(PivotFailure) «거르기» — 서술형과 같다(초석1).
import { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import type { PivotFailure } from '../fq/v2/pivot.ts';
import type { 급소K } from '../rubric/types.ts';
import type { 급소불명거르기 } from './descriptive.ts';
import { 봉인8_관계대조, type 관계유형, type 핵심제시문 } from './sealed/relation.ts';
import { 봉인9_논제요구, type 논제요구 } from './sealed/thesis.ts';

export interface 논술문항 {
  논제: string;
  제시문: { id: string; 텍스트: string }[];
}

/** 3-1 산출. 제시문에서 급소가 서지 않으면 핵심 null + 실패를 그대로 싣는다 (판정하지 않는다) */
export interface 제시문핵심 {
  id: string;
  핵심: 급소K | null;
  실패: PivotFailure | null;
}

export interface 제시문관계 {
  a: string;
  b: string;
  유형: 관계유형;
}

/**
 * [오종래 2026-10-20 확정] 연결 — 관계 · 표적 요구는 ⑧ 관계가 있어야 하고, 도구 요구는 제시문이 있기만 하면 된다.
 *   관계 · 표적: 요구가 부른 제시문 쌍마다(하나만 불렀으면 그 제시문과 다른 제시문 쌍마다) ⑧ 관계. 한 쌍이라도 서면 성립, 하나도 못 대면 미정(핵심 결손)
 *   도구: 성립 (부른 제시문이 받은 제시문에 있는지는 재료 완결이 본다)
 */
export interface 연결점 {
  요구: 논제요구;
  /** 관계 · 표적 요구가 본 제시문 쌍과 ⑧ 관계 (도구는 빈 배열). 한쪽 핵심이 없어 대조하지 못한 쌍은 실제 undefined */
  쌍: { a: string; b: string; 실제: 관계유형 | undefined }[];
  /** true 성립 / null 미정(핵심 결손으로 ⑧ 관계를 하나도 못 댐) */
  성립: boolean | null;
}

export interface 논술형분석 {
  판정: null;
  논제k: 급소K;
  제시문핵심: 제시문핵심[];
  관계: 제시문관계[];
  연결점: 연결점[];
  /** 실체 요약 — 요구 하나당 한 줄 (§3 논술형 실체 요약) */
  실체: string[];
}

function pivotOf(텍스트: string): ({ k: 급소K } | { 실패: PivotFailure }) & { 노드: readonly PathNode[] } {
  const a = recognizeV2Analysis(텍스트);
  const p = a.pivot;
  return p.ok ? { k: { 실체: p.pivot.node.entity, node: p.pivot.node }, 노드: a.graph.nodes } : { 실패: p, 노드: a.graph.nodes };
}

/**
 * 논술형문항분석(논제, 제시문들) → 핵심·관계·연결점 | 거르기(논제 급소 불명)
 * @throws SealedError 봉인⑧·⑨가 비어 있을 때
 */
export function analyze_essay(문항: 논술문항): 논술형분석 | 급소불명거르기 {
  const 논제 = pivotOf(문항.논제);
  if ('실패' in 논제) return { 판정: '거르기', 증상: '급소 명확', 초석: 1, 실패: 논제.실패 };

  // 3-1
  const 인식들 = 문항.제시문.map(({ id, 텍스트 }) => ({ id, r: pivotOf(텍스트) }));
  const 핵심들: 제시문핵심[] = 인식들.map(({ id, r }) => ('k' in r ? { id, 핵심: r.k, 실패: null } : { id, 핵심: null, 실패: r.실패 }));

  // 3-2 — 쌍 n(n-1)/2. 핵심이 없는 제시문은 대조하지 않는다
  const 선: 핵심제시문[] = 인식들.flatMap(({ id, r }) => ('k' in r ? [{ id, 핵심: r.k, 노드: r.노드 }] : []));
  const 관계: 제시문관계[] = 선.flatMap((a, i) =>
    선.slice(i + 1).map((b) => ({ a: a.id, b: b.id, 유형: 봉인8_관계대조(a, b) })),
  );
  const 관계of = (x: string, y: string) => 관계.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));

  // 3-3
  const ids = 문항.제시문.map((c) => c.id);
  const 요구들 = 봉인9_논제요구(논제.k, ids, 문항.논제);
  const 연결: 연결점[] = 요구들.map((요구) => {
    if (요구.종류 === '도구') return { 요구, 쌍: [], 성립: true };
    const 짝들 = 요구.제시문.length > 1
      ? 요구.제시문.flatMap((a, i) => 요구.제시문.slice(i + 1).map((b) => [a, b] as const))
      : 요구.제시문.flatMap((a) => ids.filter((b) => b !== a).map((b) => [a, b] as const));
    const 쌍 = 짝들.map(([a, b]) => ({ a, b, 실제: 관계of(a, b)?.유형 }));
    return { 요구, 쌍, 성립: 쌍.some((x) => x.실제) ? true : null };
  });

  const 실체 = 연결.map(
    (c) => `${c.요구.제시문.map((t) => `(${t})`).join('')}를 ${c.요구.종류}로 — ${c.요구.표지 ? `표지 「${c.요구.표지}」` : '표지 없음(기본값)'}${c.쌍.length ? ` · ⑧ ${c.쌍.map((x) => `(${x.a})↔(${x.b}) ${x.실제 ?? '대조 못 함'}`).join(', ')}` : ''} — 논제 급소 「${논제.k.실체}」`,
  );
  return { 판정: null, 논제k: 논제.k, 제시문핵심: 핵심들, 관계, 연결점: 연결, 실체 };
}
