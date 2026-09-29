// [봉인⑥] 이 조각을 «맞췄다»고 볼 이분(O/X) 경계를 글로 적는다. 오종래가 채운다.
// 경계(완전일치/급소도달)는 계열이 이미 갈라서 넘겨준다 — 여기서는 그 경계를 이 조각에 맞춰 적는 규칙만 정한다.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 경계 } from '../f4.ts';
import type { 계열, 조각뼈대 } from '../types.ts';

export function 봉인6_충족조건(조각: 조각뼈대, 경계: 경계, _계열: 계열): string {
  throw new SealedError(
    `[봉인⑥] ${조각.id}(${조각.파트}, ${경계}): 충족조건을 적는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
