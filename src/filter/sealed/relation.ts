// [봉인⑧] 제시문 두 핵심 사이의 관계를 정하는 규칙 — 급소의 방향·층위 대조 (문항분석 명세서-2 §3-2).
// 유사 = 같은 방향 / 대비 = 맞섬 / 실증 = 한쪽이 다른 쪽의 사례·증거.
// [오종래 2026-10-20 확정] 위에서부터 먼저 맞는 것 (유사 → 실증 → 대비). 대조 방법은 6단계 엔진(봉인⑭, thesis/relate.ts)과 같다:
//   1 유사 — 두 핵심이 같은 방향: 한 핵심이 다른 핵심을 품는다 (⑭ 유사와 같은 contains)
//   2 실증 — 하나가 다른 것을 뒷받침: 한 제시문의 노드(자기 핵심 노드 밖)가 다른 제시문의 핵심을 품는다 (⑭ 보완과 같은 대조)
//   3 대비 — 두 핵심이 서로 다르다 (그 밖 전부)
// 핵심이 없는 제시문은 essay.ts가 대조에 넣지 않는다.
import { contains } from '../../fq/v2/passage.ts';
import type { PathNode } from '../../fq/v2/graph.ts';
import type { 급소K } from '../../rubric/types.ts';

export type 관계유형 = '유사' | '대비' | '실증';

export interface 핵심제시문 {
  /** 제시문 표지 (예: "가") */
  id: string;
  핵심: 급소K;
  /** 제시문 인식 노드 — 실증(뒷받침) 대조에 쓴다. 없으면 실증은 보지 않는다 */
  노드?: readonly PathNode[];
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');

/** b의 노드 가운데 (b 자기 핵심 노드 밖에서) a의 핵심을 품은 것이 있는가 */
const 뒷받침 = (a: 핵심제시문, b: 핵심제시문) =>
  (b.노드 ?? []).some((n) => n.color && n.id !== b.핵심.node.id && contains(clean(n.entity), clean(a.핵심.실체)));

export function 봉인8_관계대조(a: 핵심제시문, b: 핵심제시문): 관계유형 {
  if (contains(clean(a.핵심.실체), clean(b.핵심.실체))) return '유사';
  if (뒷받침(a, b) || 뒷받침(b, a)) return '실증';
  return '대비';
}
