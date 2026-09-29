// F4 충족조건명세 — 계열이 O/X 경계를 가르는 구조는 여기, 조각에 맞춰 조건을 적는 규칙은 sealed/f4.ts([봉인⑥])에 있다.
// 채점 때 학생 답을 이 조건에 대조한다. 대조하는 판정기는 GJ(봉인⑤⑥ 통합)이고 여기서는 만들지 않는다 (구현명세 §3 F4·GJ).
import { SealedError } from '../fq/sealed/index.ts';
import { 봉인6_충족조건 } from './sealed/f4.ts';
import type { 계열, 조각뼈대 } from './types.ts';

/** 완전일치 = 닫힌 정답(급소가 «값»), 급소도달 = 열린 인문(급소가 «논지») */
export type 경계 = '완전일치' | '급소도달';

/**
 * 계열 → O/X 경계 (구현명세 §3 F4). 골격은 둘 다 «급소 도달로 O/X», 엄격·관대만 갈린다.
 */
export function boundary_of(계열: 계열): 경계 {
  switch (계열) {
    case '수리':
      return '완전일치';
    case '인문사회국어':
      return '급소도달';
  }
}

/**
 * F4 충족조건명세(조각) → string
 * @throws SealedError 봉인⑥이 비어 있거나, 봉인⑥이 빈 조건을 냈을 때
 */
export function specify_condition(조각: 조각뼈대, 계열: 계열): string {
  const 경계 = boundary_of(계열);
  const 충족조건 = 봉인6_충족조건(조각, 경계, 계열);
  if (충족조건.trim() === '') {
    throw new SealedError(`[봉인⑥] ${조각.id}: 충족조건이 비어 있습니다.`);
  }
  return 충족조건;
}
