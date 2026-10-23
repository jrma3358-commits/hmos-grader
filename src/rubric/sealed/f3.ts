// [봉인③] 조각이 어느 요소인지 — 파트가 좁힌 후보 중에서 고른다. 오종래가 채운다.
// [오종래 2026-09-28] 후보가 하나면 그것, 여럿이면 미결로 멈춘다.
//                     단 ① 근거대기는 노드 색으로 — B이면 b, D이면 d (2026-10-14부터 C이면 c, P이면 p도).
//                        ④ 답구하기는 k 우선 — 후보에 k가 있으면 k, 없으면 q.
import { SealedError } from '../../fq/sealed/index.ts';
import type { 계열, 요소, 조각뼈대 } from '../types.ts';

export function 봉인3_요소판정(조각: 조각뼈대, 후보: 요소[], _계열: 계열): 요소 {
  if (후보.length === 1) return 후보[0];
  if (조각.파트 === '근거대기') {
    // 노드 색 그대로 — B→b · D→d · C→c · P→p (c·p는 2026-10-14부터 ① 후보)
    const 색 = 조각.node?.color?.toLowerCase() as 요소 | undefined;
    if (색 && 후보.includes(색)) return 색;
    // 인문논술 ① 제시문 단락 급소 조각 — 단락 급소는 B (2026-10-14)
    if (!조각.node && (조각.제시문 || 조각.앞결과) && 후보.includes('b')) return 'b'; // 앞 결과(앞 급소)도 b (2026-10-14)
    // 수리 모범답안 「~하면」 줄 조각도 노드 없는 ① 조각 — 제시문·앞 결과와 같이 b (2026-10-16 q5, Claude가 맞춘 기본값 — 오종래 확인 대기)
    if (!조각.node && 조각.줄글 && 후보.includes('b')) return 'b';
    // 선택·적용형 「고른 관점」 역할 조각 — 노드 · 제시문 없이 학생이 고른 관점 단락 (오종래 2026-10-23)
    if (!조각.node && 조각.역할 && 후보.includes('b')) return 'b';
  }
  if (조각.파트 === '답구하기') {
    if (후보.includes('k')) return 'k';
    if (후보.includes('q')) return 'q';
  }
  throw new SealedError(
    `[봉인③] ${조각.id}(${조각.파트}): 후보 ${후보.join('·')} 중 고르는 규칙이 비어 있습니다 — 오종래가 정해야 합니다.`,
  );
}
