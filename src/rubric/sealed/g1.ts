// [봉인⑥] 학생 답을 조각 하나에 대보는 규칙 · [봉인④-b] 게이트(선행 X → 후행 상한) — 오종래가 채운다.
// 판정 기준은 «급소 도달»이지 «모범답안 일치»가 아니다 (구현명세 F5-note). 모범조각은 참고로만 볼 수 있다.
// ④-b는 구현명세 §3½의 «게이트(봉인④/규칙)» 자리다 — 어느 파트가 X면 어느 파트에 얼마의 상한을 거는지.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 조각결과 } from '../g1.ts';
import type { 조각, 파트 } from '../types.ts';

export interface 조각대조 {
  결과: 'O' | 'X' | '판정불가';
  /** 자취에 남는 판단 근거 */
  근거: string;
}

export function 봉인6_조각대조(_학생답: string, 조각: 조각): 조각대조 {
  throw new SealedError(
    `[봉인⑥] ${조각.id}(${조각.파트}): 학생 답을 조각에 대보는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}

/** 파트 → 파트점수 상한. 적지 않은 파트는 상한 없음 */
export function 봉인4b_게이트(
  _조각별: 조각결과[],
  _파트배점: Record<파트, number>,
): Partial<Record<파트, number>> {
  throw new SealedError(`[봉인④-b] 게이트(선행 X → 후행 상한) 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`);
}
