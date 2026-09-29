// F1 파트투영 — 네 파트를 도는 구조는 여기, 파트마다 물음을 내는 규칙은 sealed/f1.ts([봉인①])에 있다.
// 산출(파트별물음)은 F2가 조각의 확인물음으로 받는다 (구현명세 §3 F1·§4).
import { SealedError } from '../fq/sealed/index.ts';
import { 봉인1_파트투영 } from './sealed/f1.ts';
import type { 파트, 파트별물음, 요소 } from './types.ts';

const 파트들: readonly 파트[] = ['근거대기', '세우기', '풀기', '답구하기'];

/**
 * F1 파트투영(문항텍스트, 조합) → 파트별 확인물음
 * @param 조합 HMOS가 준 요소 조합 (예: ["b","d","c","q"]). 다시 계산하지 않는다 (§1 주의)
 * @throws SealedError 봉인①이 빈 물음을 냈을 때
 */
export function project_parts(문항텍스트: string, 조합: 요소[]): 파트별물음 {
  const 물음 = {} as 파트별물음;
  for (const 파트 of 파트들) {
    const q = 봉인1_파트투영(파트, 문항텍스트, 조합);
    if (q.trim() === '') {
      throw new SealedError(`[봉인①] ${파트}: 확인물음이 비어 있습니다.`);
    }
    물음[파트] = q;
  }
  return 물음;
}
