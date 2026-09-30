// [봉인⑩~⑬] 필터 판정 중 판단이 드는 항목 (문항분석 명세서-2 §5) — 오종래가 채운다.
// 구조만으로 가릴 수 있는 항목(급소 명확·재료 완결·논술형 관계 적절)은 judge.ts에 있다.
// 코드가 대신 판단하지 않는다. 비어 있으면 소리 내어 실패한다.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 급소K } from '../../rubric/types.ts';
import type { 서술형분석 } from '../descriptive.ts';
import type { 논술형분석 } from '../essay.ts';
import type { 항목결과 } from '../judge.ts';
import type { 서술형실체 } from '../substance.ts';

/** [봉인⑩] 서술형 관계 적절 — 이 바탕에서 이 급소로 가는 관계가 서는가 */
export function 봉인10_관계적절(_실체: 서술형실체, k: 급소K): boolean {
  throw new SealedError(
    `[봉인⑩] 급소 「${k.실체}」: 서술형 바탕→도달 관계가 적절한지 가리는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}

/** [봉인⑪] 요소 결손 — 필요한 조건이 문항에 있는가. 빠진 조건을 돌려준다 (빈 배열 = 결손 없음) */
export function 봉인11_요소결손(_분석: 서술형분석 | 논술형분석): string[] {
  throw new SealedError('[봉인⑪] 요소 결손을 가리는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.');
}

/** [봉인⑫] 중의성 — 한 실체가 두 조각에 걸치는가. 걸친 실체를 돌려준다 (빈 배열 = 없음) */
export function 봉인12_중의성(_분석: 서술형분석 | 논술형분석): string[] {
  throw new SealedError('[봉인⑫] 중의성(조각 겹침)을 가리는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.');
}

/** [봉인⑬] 정교화 필요 — 앞 항목들이 삐걱대는가 (정교화/추가논제 신호) */
export function 봉인13_정교화필요(_앞항목: 항목결과[]): boolean {
  throw new SealedError('[봉인⑬] 정교화 필요 신호를 가리는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.');
}
