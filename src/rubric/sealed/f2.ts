// [봉인②] 조각 수를 «급소에서 역산한 최소 핵심 수»로 세는 규칙 — 오종래가 채운다.
// 코드가 대신 세지 않는다. 비어 있으면 소리 내어 실패한다 (구현명세 §7).
//
// 채워진 칸 (2026-09-28 오종래):
//   ① 근거대기 = nodes 중 B·D 노드 수
//   ② 세우기   = nodes 중 C·P 노드 수 — 단, Q의 대상(Q 노드 바로 앞 노드)은 ④로 간다
//   ③ 풀기     = ② 조각마다 완성된 식의 결과 하나 (1:1)
//   ④ 답구하기 = Q 노드마다 그 대상 하나 («대상-값 일치» 짝)
import type { Color } from '../../fq/types.ts';
import type { PathNode } from '../../fq/v2/graph.ts';
import type { 급소K, 인식결과, 조각뼈대, 파트, 파트별물음, 요소 } from '../types.ts';

/** Q의 대상 — Q 노드 바로 앞 노드. 질문이 «무엇을» 요구하는가 */
function qTargets(인식: 인식결과): PathNode[] {
  return 인식.nodes.filter((_, i) => 인식.nodes[i + 1]?.color === 'Q');
}

/** 파트 안의 노드 하나 = 조각 하나. 색이 미결(null)인 노드는 세지 않는다 */
function piecesFromNodes(
  파트: 파트,
  colors: Color[],
  물음: 파트별물음 | null,
  k: 급소K,
  인식: 인식결과,
  exclude: PathNode[] = [],
): 조각뼈대[] {
  return 인식.nodes
    .filter((n) => n.color !== null && colors.includes(n.color) && !exclude.includes(n))
    .map((n, i) => ({
      id: `${파트}-${i + 1}`,
      파트,
      요소: n.color!.toLowerCase() as 요소,
      수행질: null,
      확인물음: 물음?.[파트] ?? '',
      is_중심: n.id === k.node.id,
      node: n,
    }));
}

/** ① 근거대기 = B·D 노드 수 */
export function 봉인2_근거대기(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과): 조각뼈대[] {
  return piecesFromNodes('근거대기', ['B', 'D'], 물음, k, 인식);
}

/** ② 세우기 = C·P 노드 수 (Q의 대상은 빼서 ④로) */
export function 봉인2_세우기(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과): 조각뼈대[] {
  return piecesFromNodes('세우기', ['C', 'P'], 물음, k, 인식, qTargets(인식));
}

/**
 * ③ 풀기 = 세워진 식(②)마다 «완성된 식의 결과» 하나 — ② 조각과 1:1.
 * 같은 노드를 가리키므로 ②가 X면 그 노드의 ③도 X로 내릴 수 있다 (게이트, 구현명세 §3 F2).
 * 요소가 아니라 수행이다: 요소 null, 수행질 "정확성" (F3 ③).
 */
export function 봉인2_풀기(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과): 조각뼈대[] {
  return 봉인2_세우기(물음, k, 인식).map((p, i) => ({
    id: `풀기-${i + 1}`,
    파트: '풀기',
    요소: null,
    수행질: '정확성',
    확인물음: 물음?.풀기 ?? '',
    is_중심: p.is_중심,
    node: p.node,
  }));
}

/**
 * ④ 답구하기 = Q의 대상마다 조각 하나 («대상-값 일치» 짝).
 * 요소는 k·q 한 몸이라 노드 색에서 가져오지 않는다 — F3(봉인③)이 정한다.
 */
export function 봉인2_답구하기(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과): 조각뼈대[] {
  return qTargets(인식).map((n, i) => ({
    id: `답구하기-${i + 1}`,
    파트: '답구하기',
    요소: null,
    수행질: null,
    확인물음: 물음?.답구하기 ?? '',
    is_중심: n.id === k.node.id,
    node: n,
  }));
}

/** 네 파트 전부 */
export function 봉인2_조각역산(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과): 조각뼈대[] {
  return [
    ...봉인2_근거대기(물음, k, 인식),
    ...봉인2_세우기(물음, k, 인식),
    ...봉인2_풀기(물음, k, 인식),
    ...봉인2_답구하기(물음, k, 인식),
  ];
}
