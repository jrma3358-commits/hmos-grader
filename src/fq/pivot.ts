// STEP 6. K(급소) 추출 — ENGINE_LOGIC.md STEP 6 / HMOS_CORE_SPEC.md §5
// θ°(질문) → 1패스 역추적 → K → 2패스 순방향 → θ*(답)
// 연산요소(B·C): 양 날개 대칭 / 확정요소(P·D): 인바운드만, 아웃바운드 단축

import type { Color, CoreColors, Pivot, RegressionPath, ThetaEstimate } from './types.ts';
import { countItems, multisetPermutations, subjectParticle } from './util.ts';

const OPERATIONAL: Color[] = ['B', 'C'];
/** 인바운드 순서: θ B (P) (D) C K — P가 D보다 먼저 (논문2) */
const INBOUND_ORDER: Color[] = ['B', 'P', 'D', 'C'];

/**
 * 1패스 역추적에서 가장 깊이 닿는 지점을 찾는다.
 * 규칙은 깊은 것부터 — 첫 번째로 성립하는 규칙이 K다 (주어진 경로에서 K는 하나).
 */
export function findPivot({ colors, detail }: CoreColors): Pivot {
  const { items, duplicates, category, slots } = detail;

  // Q ← C(자리·범주) ← B(원소): 제약된 범주 안에 같은 원소가 겹치면 그 겹침이 급소
  if (items && category) {
    const dup = duplicates.find((d) => category.members.includes(d.item));
    if (dup) {
      const k = Math.min(dup.count, slots?.positions.length ?? dup.count);
      const tuple = Array(k).fill(dup.item).join(',');
      return {
        text: `${dup.item}${subjectParticle(dup.item)} ${dup.count}개 — (${tuple}) 경우가 존재`,
        color: 'B',
        rule: 'B.중복×C.범주',
      };
    }
  }
  if (duplicates.length) {
    const d = duplicates[0];
    return { text: `${d.item}${subjectParticle(d.item)} ${d.count}개 — 같은 것을 포함한 배열`, color: 'B', rule: 'B.중복' };
  }
  if (colors.D) return { text: `새 규칙 수용: ${colors.D}`, color: 'D', rule: 'D.정의' };
  if (colors.P) return { text: `무대 인식: ${colors.P}`, color: 'P', rule: 'P.무대' };
  if (colors.C) return { text: `조건 격리: ${colors.C}`, color: 'C', rule: 'C.조건' };
  if (colors.B) return { text: `대상 확인: ${colors.B}`, color: 'B', rule: 'B.대상' };
  return { text: `순수 연산: ${colors.Q}`, color: 'Q', rule: 'Q.직접' };
}

export function buildPath({ detail }: CoreColors): RegressionPath {
  const present = [...detail.layers.surface, ...detail.layers.deep];
  const inbound = INBOUND_ORDER.filter((c) => present.includes(c));
  const outbound = inbound.filter((c) => OPERATIONAL.includes(c)).reverse();
  const shortened = inbound.filter((c) => !OPERATIONAL.includes(c));
  return { inbound, outbound, shortened, notation: ['θ°', ...inbound, 'K', ...outbound, 'θ*'].join('→') };
}

/** 예상 θ* — 원소·자리·범주가 모두 읽힌 경우에만 수치를 확정한다 */
export function estimateTheta({ colors, detail }: CoreColors): ThetaEstimate {
  const theta: ThetaEstimate = { formats: detail.answerFormats };
  const { items, category, slots } = detail;
  if (!items) return theta;

  if (!colors.C) {
    theta.value = multisetPermutations(countItems(items).values());
    return theta;
  }
  if (!category || !slots || slots.positions.length > items.length) return theta;

  const avail = countItems(items);
  const members = [...avail.keys()].filter((x) => category.members.includes(x));
  const cases: { slots: string; count: number }[] = [];

  const walk = (tuple: string[]) => {
    if (tuple.length === slots.positions.length) {
      cases.push({ slots: `(${tuple.join(',')})`, count: multisetPermutations(avail.values()) });
      return;
    }
    for (const m of members) {
      const n = avail.get(m)!;
      if (n === 0) continue;
      avail.set(m, n - 1);
      walk([...tuple, m]);
      avail.set(m, n);
    }
  };
  walk([]);

  theta.cases = cases;
  theta.value = cases.reduce((s, c) => s + c.count, 0);
  theta.derivation = `${cases.map((c) => `${c.slots} ${c.count}`).join(' + ')} = ${theta.value}`;
  return theta;
}

export function extractPivot(core: CoreColors): { K: Pivot; path: RegressionPath; theta: ThetaEstimate } {
  return { K: findPivot(core), path: buildPath(core), theta: estimateTheta(core) };
}
