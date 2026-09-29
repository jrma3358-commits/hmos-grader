// F2 조각역산 — 호출부. 규칙 본체는 sealed/f2.ts([봉인②])에 있다.
import type { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PivotFailure } from '../fq/v2/pivot.ts';
import { 봉인2_조각역산 } from './sealed/f2.ts';
import type { 급소K, 인식결과, 조각뼈대, 파트별물음 } from './types.ts';

type V2Analysis = ReturnType<typeof recognizeV2Analysis>;

/** v2 출력 → F2 입력. 급소가 서지 않았으면(NO_B·MULTIPLE_CONVERGENCE) 넘기지 않고 그대로 돌려준다 */
export function f2_input_from_v2(
  v2: V2Analysis,
): { ok: true; k: 급소K; 인식: 인식결과 } | PivotFailure {
  if (!v2.pivot.ok) return v2.pivot;
  const { node } = v2.pivot.pivot;
  return {
    ok: true,
    k: { 실체: node.entity, node },
    인식: { 조합: v2.form.colors, nodes: v2.graph.nodes },
  };
}

/**
 * F2 조각역산(파트별물음, 급소_k, 5색인식결과) → 조각뼈대[]  (구현명세 §3 F2)
 * @throws SealedError 봉인②가 비어 있을 때
 */
export function derive_pieces(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과): 조각뼈대[] {
  return 봉인2_조각역산(물음, k, 인식);
}
