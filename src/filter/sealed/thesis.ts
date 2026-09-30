// [봉인⑨] 논제 급소가 «제시문 관계를 어떻게 다루라»고 요구하는지 읽는 규칙 (문항분석 명세서-2 §3-3). 오종래가 채운다.
// 예: 「(라)㉠을 (마)로 비판」 → 도구 마, 표적 [라], 대비
//     「(나)(다)에 적용될 윤리 구분」 → 도구 가, 표적 [나, 다], 실증
// 코드가 대신 읽지 않는다. 비어 있으면 소리 내어 실패한다.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 급소K } from '../../rubric/types.ts';
import type { 관계유형 } from './relation.ts';

export interface 논제요구 {
  /** 다른 제시문을 재는 잣대 (이론·비판 기준) */
  도구: string;
  /** 재어지는 대상 (사례·관점) */
  표적: string[];
  관계: 관계유형;
}

export function 봉인9_논제요구(논제k: 급소K, _제시문ids: string[]): 논제요구[] {
  throw new SealedError(
    `[봉인⑨] 논제 급소 「${논제k.실체}」가 요구하는 제시문 관계를 읽는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
