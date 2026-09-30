// [봉인⑧] 제시문 두 핵심 사이의 관계를 정하는 규칙 — 급소의 방향·층위 대조 (문항분석 명세서-2 §3-2). 오종래가 채운다.
// 유사 = 같은 방향 / 대비 = 맞섬 / 실증 = 한쪽이 다른 쪽의 사례·증거.
// 세 유형 어디에도 없으면 null. 코드가 대신 대조하지 않는다. 비어 있으면 소리 내어 실패한다.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 급소K } from '../../rubric/types.ts';

export type 관계유형 = '유사' | '대비' | '실증';

export interface 핵심제시문 {
  /** 제시문 표지 (예: "가") */
  id: string;
  핵심: 급소K;
}

export function 봉인8_관계대조(a: 핵심제시문, b: 핵심제시문): 관계유형 | null {
  throw new SealedError(
    `[봉인⑧] (${a.id})↔(${b.id}): 제시문 핵심의 관계를 대조하는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
