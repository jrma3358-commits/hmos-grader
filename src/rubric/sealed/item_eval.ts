// [봉인] 문항평가 — 분해 중 난 «삐걱» 신호를 경고로 낼지, 판정 기준값은 무엇인지. 오종래가 채운다 (구현명세 §5).
// 미결 (구현명세 §6): 경고를 «생성 중단»으로 볼지 «경고만»으로 볼지.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 삐걱신호 } from '../item_eval.ts';

export function 봉인_문항평가(신호: 삐걱신호): string[] {
  throw new SealedError(
    `[봉인 문항평가] 신호(중심없음=${신호.중심없음}, 결손=${신호.결손파트.join('·') || '없음'}, 겹침=${신호.겹침.length}): 경고로 내는 기준이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
