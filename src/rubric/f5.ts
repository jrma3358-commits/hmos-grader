// F5 배점산출 — 두 층 구조는 여기, 값(지수·반올림)은 sealed/f5.ts([봉인④])에 있다.
import { 결손재분배, 봉인4_파트지수, 봉인4a_반올림 } from './sealed/f5.ts';
import type { 계열, 배점조각, 조각뼈대, 파트 } from './types.ts';

export interface 배점결과 {
  조각들: 배점조각[];
  /** 1층 — 파트별 배점 (반올림 후) */
  파트배점: Record<파트, number>;
  /** 지수는 있는데 조각이 0개인 파트 (문항평가 §5 «요소 결손»). 결손재분배면 배점 0, 아니면 배점이 갈 곳이 없다 */
  미배정: 파트[];
}

/**
 * F5 배점산출(조각[], 총배점) → 조각[].배점  (구현명세 §3 F5)
 *   1층: 파트 배점 = 총배점 × 지수 / Σ지수  (⑤표현을 뺀 뒤에도 총배점이 남김없이 배정되도록 Σ지수로 나눈다)
 *        [봉인④ 결손재분배]면 조각 없는 파트는 빼고 Σ지수를 잡는다 — 그 몫이 조각 있는 파트로 지수 비율대로 간다.
 *   2층: 조각당 배점 = 파트 배점 ÷ 그 파트 조각 수
 *   두 층 모두 [봉인④-a]로 반올림한다 — 나머지는 마지막 파트·마지막 조각에.
 * k의 중심성은 배점이 아니라 게이트(G1)로 실현한다 — 여기서 가중하지 않는다.
 */
export function allocate_points(조각들: 조각뼈대[], 총배점: number, 계열: 계열): 배점결과 {
  const 지수 = 봉인4_파트지수(계열);
  const 파트들 = Object.keys(지수) as 파트[];
  const 미배정 = 파트들.filter((p) => !조각들.some((c) => c.파트 === p));
  const 받는파트 = 결손재분배 ? 파트들.filter((p) => !미배정.includes(p)) : 파트들;
  const 합 = 받는파트.reduce((a, p) => a + 지수[p], 0);
  const 파트몫 = 봉인4a_반올림(
    총배점,
    받는파트.map((p) => (총배점 * 지수[p]) / 합),
  );
  const 파트배점 = Object.fromEntries(
    파트들.map((p) => [p, 받는파트.includes(p) ? 파트몫[받는파트.indexOf(p)] : 0]),
  ) as Record<파트, number>;

  const 배점 = new Map<조각뼈대, number>();
  for (const p of 파트들) {
    const 안 = 조각들.filter((c) => c.파트 === p);
    const 몫 = 봉인4a_반올림(파트배점[p], 안.map(() => 파트배점[p] / 안.length));
    안.forEach((c, i) => 배점.set(c, 몫[i]));
  }

  return {
    조각들: 조각들.map((c) => ({ ...c, 배점: 배점.get(c)! })),
    파트배점,
    미배정,
  };
}
