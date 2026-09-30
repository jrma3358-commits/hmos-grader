// 계단식 단계형 문항 분석 — 1차 필터 (문항분석 명세서-2 §2).
// [오종래 2026-09-30] 소문항마다 따로 서술형 절차를 돌린다. 나누는 규칙은 sealed/stepwise.ts([봉인⑦]).
// 소문항 결과를 모아 문항 전체를 통과/거르기로 묶는 일은 여기서 하지 않는다 — 필터 판정(§5) 단계가 본다.
import { analyze_descriptive, type 급소불명거르기, type 서술형분석 } from './descriptive.ts';
import { 봉인7_소문항분리, type 소문항 } from './sealed/stepwise.ts';

export interface 소문항분석 {
  소문항: 소문항;
  결과: 서술형분석 | 급소불명거르기;
}

/**
 * 계단식문항분석(문항텍스트) → 소문항마다의 서술형 분석
 * @throws SealedError 봉인⑦이 비어 있을 때, 또는 소문항의 F2(봉인②)에서
 */
export function analyze_stepwise(문항텍스트: string): 소문항분석[] {
  return 봉인7_소문항분리(문항텍스트).map((s) => ({ 소문항: s, 결과: analyze_descriptive(s.텍스트) }));
}
