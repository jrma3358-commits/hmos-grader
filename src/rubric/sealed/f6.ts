// [봉인⑤] 조각을 모범조각으로 펴는 규칙 — 파트가 골라 준 재료를 어떤 글로 펴는지. 오종래가 채운다.
// GJ 검산·되돌림 한도([봉인⑤-a])는 여기 없다 — GJ가 서면 붙인다.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 재료 } from '../f6.ts';
import type { 조각뼈대 } from '../types.ts';

export function 봉인5_모범조각(조각: 조각뼈대, 재료: 재료): string {
  throw new SealedError(
    `[봉인⑤] ${조각.id}(${재료.파트}): 조각을 펴는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
