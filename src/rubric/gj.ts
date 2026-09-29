// GJ 급소일치판정 — 답을 입구 로직에 태워 급소를 뽑는 구조는 여기, 두 급소를 대보는 규칙은 sealed/gj.ts([봉인⑤⑥])에 있다.
// 봉인⑤(출구 검산)와 봉인⑥(이분 경계)은 하나의 판정기다 — 모범답안 검산(F6)과 학생답 채점(G1)이 같이 쓴다 (구현명세 §3 GJ).
// 답 전체를 질문의 급소 하나와 대본다. 조각별 대조는 G1의 몫이다.
import { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PivotFailure } from '../fq/v2/pivot.ts';
import { boundary_of, type 경계 } from './f4.ts';
import { 봉인56_급소일치 } from './sealed/gj.ts';
import type { 계열, 급소K } from './types.ts';

/**
 * O/X — 답의 급소가 섰고, 질문의 급소와 대봤다.
 * 판정불가 — 답에서 급소가 서지 않았다(NO_B·MULTIPLE_CONVERGENCE). X와 섞지 않는다.
 */
export type 급소판정 =
  | { 결과: 'O' | 'X'; 경계: 경계; 답급소: 급소K }
  | { 결과: '판정불가'; 경계: 경계; 실패: PivotFailure };

/**
 * GJ 급소일치판정(답, 질문요구, 계열) → O | X | 판정불가
 * @throws SealedError 봉인⑤⑥이 비어 있을 때 (입구 로직의 봉인이 비어 있을 때도 그대로 올라간다)
 */
export function judge_pivot_match(답: string, 질문급소: 급소K, 계열: 계열): 급소판정 {
  const 경계 = boundary_of(계열);
  const { pivot } = recognizeV2Analysis(답);
  if (!pivot.ok) return { 결과: '판정불가', 경계, 실패: pivot };
  const 답급소: 급소K = { 실체: pivot.pivot.node.entity, node: pivot.pivot.node };
  return { 결과: 봉인56_급소일치(답급소, 질문급소, 경계) ? 'O' : 'X', 경계, 답급소 };
}
