// 논술형 문항 분석 — 1차 필터 (문항분석 명세서-2 §3). 인문사회논술에 쓴다.
// 3-1 제시문 각각 → 핵심 (제시문 = 답변 취급, 같은 급소 엔진)
// 3-2 제시문 핵심 쌍 → 관계 (유사/대비/실증)          — 규칙은 sealed/relation.ts([봉인⑧])
// 3-3 논제 급소가 요구하는 관계 ↔ 실제 관계 → 연결점   — 요구를 읽는 규칙은 sealed/thesis.ts([봉인⑨])
// 여기에는 구조만 있다. 일치하면 연결점 성립, 어긋나면 악문 신호(발문-제시문 틈).
// [오종래 2026-09-30] 논제 급소가 서지 않으면(PivotFailure) «거르기» — 서술형과 같다(초석1).
import { recognizeV2Analysis } from '../fq/pipeline.ts';
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
  /** null = 세 유형 어디에도 없음 (봉인⑧) */
  유형: 관계유형 | null;
}

export interface 연결점 {
  요구: 논제요구;
  표적: string;
  /** 도구↔표적의 실제 관계. 한쪽 핵심이 없어 대조하지 못했으면 undefined */
  실제: 관계유형 | null | undefined;
  /** true 성립 / false 악문 신호(요구한 관계가 제시문에 없음) / null 미정(핵심 결손) */
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

function pivotOf(텍스트: string): { k: 급소K } | { 실패: PivotFailure } {
  const p = recognizeV2Analysis(텍스트).pivot;
  return p.ok ? { k: { 실체: p.pivot.node.entity, node: p.pivot.node } } : { 실패: p };
}

/**
 * 논술형문항분석(논제, 제시문들) → 핵심·관계·연결점 | 거르기(논제 급소 불명)
 * @throws SealedError 봉인⑧·⑨가 비어 있을 때
 */
export function analyze_essay(문항: 논술문항): 논술형분석 | 급소불명거르기 {
  const 논제 = pivotOf(문항.논제);
  if ('실패' in 논제) return { 판정: '거르기', 증상: '급소 명확', 초석: 1, 실패: 논제.실패 };

  // 3-1
  const 핵심들: 제시문핵심[] = 문항.제시문.map(({ id, 텍스트 }) => {
    const r = pivotOf(텍스트);
    return 'k' in r ? { id, 핵심: r.k, 실패: null } : { id, 핵심: null, 실패: r.실패 };
  });

  // 3-2 — 쌍 n(n-1)/2. 핵심이 없는 제시문은 대조하지 않는다
  const 선: 핵심제시문[] = 핵심들.flatMap((c) => (c.핵심 ? [{ id: c.id, 핵심: c.핵심 }] : []));
  const 관계: 제시문관계[] = 선.flatMap((a, i) =>
    선.slice(i + 1).map((b) => ({ a: a.id, b: b.id, 유형: 봉인8_관계대조(a, b) })),
  );
  const 관계of = (x: string, y: string) => 관계.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));

  // 3-3
  const 요구들 = 봉인9_논제요구(논제.k, 문항.제시문.map((c) => c.id));
  const 연결: 연결점[] = 요구들.flatMap((요구) =>
    요구.표적.map((표적) => {
      const 실제 = 관계of(요구.도구, 표적)?.유형;
      return { 요구, 표적, 실제, 성립: 실제 === undefined ? null : 실제 === 요구.관계 };
    }),
  );

  const 실체 = 요구들.map(
    (r) => `(${r.도구})를 잣대로 ${r.표적.map((t) => `(${t})`).join('')}의 ${r.관계} 관계를 다룬다 — 논제 급소 「${논제.k.실체}」`,
  );
  return { 판정: null, 논제k: 논제.k, 제시문핵심: 핵심들, 관계, 연결점: 연결, 실체 };
}
