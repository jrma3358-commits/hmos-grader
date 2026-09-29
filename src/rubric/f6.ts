// F6 모범조각생성 — 파트가 펴는 재료를 고르는 구조는 여기, 재료를 글로 펴는 규칙은 sealed/f6.ts([봉인⑤])에 있다.
// 조각 단위다: 조각 하나 → 모범조각 하나. 한 답으로 엮는 일은 별도 모듈(엮기)이 한다 (구현명세 §4).
// GJ 검산은 아직 없다 — 편 조각을 대보지 않고 그대로 돌려준다.
import { SealedError } from '../fq/sealed/index.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import { 봉인5_모범조각 } from './sealed/f6.ts';
import type { 급소K, 조각뼈대 } from './types.ts';

/**
 * 파트별로 펴는 재료 (구현명세 §3 F6)
 *   근거대기 — 인식이 호출한 b·d 노드를 명시
 *   세우기   — 인식이 준 c·p 노드를 식/논지로
 *   풀기     — 세운 식을 연산해 결과로 (조각 단위라 다른 조각의 식은 여기 오지 않는다)
 *   답구하기 — 급소 대상에 요구값을 맞춰 도달
 */
export type 재료 =
  | { 파트: '근거대기'; node: PathNode }
  | { 파트: '세우기'; node: PathNode }
  | { 파트: '풀기' }
  | { 파트: '답구하기'; k: 급소K };

/** 조각 → 재료. ①②는 노드에서 온 조각이어야 한다 (F2가 node를 채운다) */
export function material_of(조각: 조각뼈대, k: 급소K): 재료 {
  switch (조각.파트) {
    case '근거대기':
    case '세우기':
      if (조각.node === null) {
        throw new Error(`${조각.id}(${조각.파트}): 노드 없는 조각입니다 — ①②는 인식 노드에서 와야 합니다.`);
      }
      return { 파트: 조각.파트, node: 조각.node };
    case '풀기':
      return { 파트: '풀기' };
    case '답구하기':
      return { 파트: '답구하기', k };
  }
}

/**
 * F6 모범조각생성(조각, 급소_k) → string
 * @throws SealedError 봉인⑤가 비어 있거나, 봉인⑤가 빈 모범조각을 냈을 때
 */
export function spread_piece(조각: 조각뼈대, k: 급소K): string {
  const 모범조각 = 봉인5_모범조각(조각, material_of(조각, k));
  if (모범조각.trim() === '') {
    throw new SealedError(`[봉인⑤] ${조각.id}: 모범조각이 비어 있습니다.`);
  }
  return 모범조각;
}
