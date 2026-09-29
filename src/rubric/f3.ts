// F3 요소색판정 — 파트가 후보를 좁히는 구조는 여기, 후보 중 고르는 규칙은 sealed/f3.ts([봉인③])에 있다.
// F3의 판정은 F2가 노드 색으로 넣어 둔 요소를 덮어쓴다 (조립 단계, 구현명세 §4).
import { SealedError } from '../fq/sealed/index.ts';
import { 봉인3_요소판정 } from './sealed/f3.ts';
import type { 계열, 요소, 조각뼈대, 파트 } from './types.ts';

/**
 * 파트 → 요소 후보 (구현명세 §3 F3). null이면 요소가 아니라 수행이다 (③ 풀기 → 수행질 "정확성").
 */
export function element_candidates(파트: 파트, 계열: 계열): 요소[] | null {
  switch (파트) {
    case '근거대기':
      return ['b', 'd'];
    case '세우기':
      return 계열 === '수리' ? ['c'] : ['p'];
    case '풀기':
      return null;
    case '답구하기':
      return ['k', 'q'];
  }
}

/**
 * F3 요소색판정(조각) → 요소 | null
 * @throws SealedError 봉인③이 비어 있거나, 봉인③이 후보 밖의 요소를 냈을 때
 */
export function judge_element(조각: 조각뼈대, 계열: 계열): 요소 | null {
  const 후보 = element_candidates(조각.파트, 계열);
  if (후보 === null) return null;
  const 요소 = 봉인3_요소판정(조각, 후보, 계열);
  if (!후보.includes(요소)) {
    throw new SealedError(`[봉인③] ${조각.id}: 요소 "${요소}"가 파트 후보(${후보.join('·')}) 밖입니다.`);
  }
  return 요소;
}
