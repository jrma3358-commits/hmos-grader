// 서술형 문항 분석 — 1차 필터 (문항분석 명세서-2 §2). 단독문제, 계단식 단계형의 소문항 하나에 쓴다.
// [오종래 2026-09-30] 급소가 서지 않으면(PivotFailure: NO_B·MULTIPLE_CONVERGENCE) 오류로 끝내지 않고 «거르기»로 판정한다.
//                     = §5 「급소 명확?」 아니오 = §0½ 초석1(의도의 명확성)이 서지 않음.
// 급소가 섰다고 «통과»는 아니다 — 나머지 §5 항목은 뒤 단계가 본다.
import { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PivotFailure } from '../fq/v2/pivot.ts';
import { derive_pieces, f2_input_from_v2 } from '../rubric/f2.ts';
import type { 급소K, 조각뼈대 } from '../rubric/types.ts';
import { summarize_substance, type 서술형실체 } from './substance.ts';

export interface 급소불명거르기 {
  판정: '거르기';
  증상: '급소 명확';
  초석: 1;
  /** v2가 낸 실패 그대로 — flag·후보·메시지 */
  실패: PivotFailure;
}

export interface 서술형분석 {
  판정: null;
  k: 급소K;
  조각들: 조각뼈대[];
  실체: 서술형실체;
}

/**
 * 서술형문항분석(문항텍스트) → 실체 | 거르기(급소 불명)
 * @throws SealedError 봉인②가 비어 있을 때 (F2에서 그대로 올라온다)
 */
export function analyze_descriptive(문항텍스트: string): 서술형분석 | 급소불명거르기 {
  const 입력 = f2_input_from_v2(recognizeV2Analysis(문항텍스트));
  if (!입력.ok) return { 판정: '거르기', 증상: '급소 명확', 초석: 1, 실패: 입력 };
  const { 물음, k, 인식 } = 입력;
  const 조각들 = derive_pieces(물음, k, 인식);
  return { 판정: null, k, 조각들, 실체: summarize_substance(k, 인식, 조각들) };
}
