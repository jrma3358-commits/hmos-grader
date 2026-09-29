// 문항평가 — 분해에서 난 신호를 모으는 구조는 여기, 신호를 경고로 가르는 규칙은 sealed/item_eval.ts([봉인])에 있다 (구현명세 §5).
import { 봉인_문항평가 } from './sealed/item_eval.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import type { 조각뼈대, 파트 } from './types.ts';

/** §5 «삐걱» 신호 — 세기만 하고 판정하지 않는다 */
export interface 삐걱신호 {
  /** k 중심 조각이 하나도 없다 (급소 불명 문항) */
  중심없음: boolean;
  /** 지수는 있는데 조각이 0개인 파트 (요소 결손) — F5 미배정 */
  결손파트: 파트[];
  /** 한 노드(실체)가 한 파트 안 두 조각 이상에 걸렸다 (중의성 의심). 파트가 다르면 세지 않는다 — ③풀기는 ②와 같은 노드를 일부러 공유한다 */
  겹침: { 파트: 파트; node: PathNode; 조각ids: string[] }[];
}

export function collect_signals(조각들: 조각뼈대[], 결손파트: 파트[]): 삐걱신호 {
  const 묶음 = new Map<string, { 파트: 파트; node: PathNode; 조각ids: string[] }>();
  for (const c of 조각들) {
    if (c.node === null) continue;
    const key = `${c.파트}:${c.node.id}`;
    const g = 묶음.get(key) ?? { 파트: c.파트, node: c.node, 조각ids: [] };
    g.조각ids.push(c.id);
    묶음.set(key, g);
  }
  return {
    중심없음: !조각들.some((c) => c.is_중심),
    결손파트,
    겹침: [...묶음.values()].filter((g) => g.조각ids.length > 1),
  };
}

/**
 * 문항평가(조각[]) → 경고[]
 * @throws SealedError 봉인이 비어 있을 때
 */
export function evaluate_item(조각들: 조각뼈대[], 결손파트: 파트[]): { 신호: 삐걱신호; 경고: string[] } {
  const 신호 = collect_signals(조각들, 결손파트);
  return { 신호, 경고: 봉인_문항평가(신호) };
}
