// [봉인⑤⑥] 답의 급소가 질문의 급소와 일치하는가 — 경계(완전일치/급소도달)에 따라 대보는 규칙. 오종래가 채운다.
// 답에서 급소를 뽑는 일(입구 재사용)과 경계를 가르는 일(F4)은 gj.ts가 이미 했다 — 여기서는 두 급소를 대보기만 한다.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 경계 } from '../f4.ts';
import type { 급소K } from '../types.ts';

export function 봉인56_급소일치(답급소: 급소K, 질문급소: 급소K, 경계: 경계): boolean {
  throw new SealedError(
    `[봉인⑤⑥] 답 급소 "${답급소.실체}" ↔ 질문 급소 "${질문급소.실체}" (${경계}): 대보는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
