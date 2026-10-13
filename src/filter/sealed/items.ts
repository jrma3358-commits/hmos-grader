// [봉인⑩~⑬] 필터 판정 중 판단이 드는 항목 (문항분석 명세서-2 §5) — 오종래가 채운다.
// 구조만으로 가릴 수 있는 항목(급소 명확·재료 완결·논술형 관계 적절)은 judge.ts에 있다.
// 코드가 대신 판단하지 않는다. 비어 있으면 소리 내어 실패한다.
// ⑬은 채워졌다 (오종래 2026-10-13) — C·논술 5단계 정교화 4갈래 진단 (조립설명서 C·논술 9단계).
import type { V2Analysis } from '../../fq/pipeline.ts';
import { essay_pivot_chunks } from '../../thesis/chunk.ts';
import { SealedError } from '../../fq/sealed/index.ts';
import type { 급소K } from '../../rubric/types.ts';
import type { 서술형분석 } from '../descriptive.ts';
import type { 논술형분석 } from '../essay.ts';
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

/** 정교화 4갈래 (논제생성 명세서-2 §3) */
export type 정교화갈래 = '일방흐름' | '서술복잡' | '급소불명확' | '사족';

/** 4단계 ④사족 — 제시문 어느 단락 급소와도 연결선이 없는 논제 급소 (오종래 2026-10-13, thesis/align.ts) */
export interface 사족노드 {
  소문항: string | null;
  급소: string;
}

export interface 정교화진단 {
  갈래: 정교화갈래;
  /** 진단한 단위(소문항). 단위가 하나뿐인 논제면 null */
  단위: string | null;
  근거: string;
}

type 인식단위 = Pick<V2Analysis, 'question' | 'graph' | 'pivot'>;

/** 진단 단위 — 소문항 하나의 인식. C 논제는 split_thesis가 나눈 소문항마다 (오종래 2026-10-13) */
export interface 진단단위 {
  이름: string | null;
  인식: 인식단위;
}

/** 엔진이 나눈 단위(split_units)로 — 나누지 않았으면 전체가 한 단위 */
export function 엔진단위(a: V2Analysis & { units?: V2Analysis[] }): 진단단위[] {
  if (!a.units?.length) return [{ 이름: null, 인식: a }];
  return a.units.map((u, i) => ({ 이름: `단위 ${i + 1}`, 인식: u }));
}

/** 소문항(단위) 하나의 ①②③ */
function 단위진단(u: 인식단위, 단위: string | null): 정교화진단[] {
  const nodes = [...u.graph.nodes].sort((a, b) => a.index - b.index);
  const 진단: 정교화진단[] = [];
  const pivots = u.pivot.ok ? (u.pivot.pivots ?? [u.pivot.pivot]) : [];

  // ① 일방흐름 — 급소 B 바로 다음이 Q이고, 이 단위에 C 노드가 없다
  if (!nodes.some((n) => n.color === 'C')) {
    for (const p of pivots) {
      if (p.node.color !== 'B') continue;
      const 다음 = nodes[nodes.findIndex((n) => n.id === p.node.id) + 1];
      if (다음?.color === 'Q') {
        진단.push({ 갈래: '일방흐름', 단위, 근거: `급소 B「${p.node.entity.trim()}」(${p.node.id}) → Q「${다음.surface}」(${다음.id}), C 노드 없음` });
      }
    }
  }

  // ② 서술복잡 — B 노드 3개 이상이고 C-F 노드가 없다
  const bs = nodes.filter((n) => n.color === 'B');
  if (bs.length >= 3 && !nodes.some((n) => n.switchId === 'C-F')) {
    진단.push({ 갈래: '서술복잡', 단위, 근거: `B 노드 ${bs.length}개 (${bs.map((n) => n.id).join('·')}), C-F 없음` });
  }

  // ③ 급소불명확 — MULTIPLE_CONVERGENCE, 또는 Q 앞에 B+C 덩어리가 서지 않음 (수렴도는 보지 않는다, 오종래 2026-10-13)
  if (!u.pivot.ok && u.pivot.flag === 'MULTIPLE_CONVERGENCE') {
    진단.push({ 갈래: '급소불명확', 단위, 근거: `MULTIPLE_CONVERGENCE — 후보 ${u.pivot.candidates.map((n) => `「${n.entity.trim()}」`).join(' ')}` });
  }
  if (!essay_pivot_chunks(u.graph).length) {
    진단.push({ 갈래: '급소불명확', 단위, 근거: 'Q 앞에 B+C 덩어리가 서지 않음 — 무엇을(B) 묻는지 없음' });
  }
  return 진단;
}

/**
 * [봉인⑬] 정교화 진단 — 논제 인식(엔진)과 4단계 ④사족에서 정교화 4갈래를 가린다. 빈 배열 = 정교화 신호 없음.
 * [오종래 2026-10-13]
 *   ① 일방흐름: 논제 B노드가 C노드 없이 Q로 바로 연결될 때 — 급소 B만 본다. 길 순서상 급소 B 바로 다음이 Q이고, 단위에 C 노드가 없다
 *   ② 서술복잡: B노드가 3개 이상이고 C-F 없을 때 — 소문항(단위)마다 센다
 *   ③ 급소불명확: MULTIPLE_CONVERGENCE이거나, Q 앞에 B+C 덩어리가 서지 않을 때 (thesis/chunk.ts).
 *      [오종래 2026-10-13] 논술 논제의 Q는 형식, 급소는 Q 앞 B+C 덩어리 — 수렴도 0 기준은 거둔다
 *   ④ 사족: 논제가 요구하는 실체의 근거가 제시문에 없는 것 — 논제 급소가 제시문 어느 단락 급소와도 연결되지 않을 때.
 *      4단계(thesis/align.ts) 결과를 받아 그대로 싣는다 (생성 없음)
 * ①②③은 단위(소문항)마다 본다. C 논제는 split_thesis로 나눈 소문항, 그 밖은 엔진단위().
 */
export function 봉인13_정교화진단(단위들: 진단단위[], 사족: 사족노드[]): 정교화진단[] {
  const 진단 = 단위들.flatMap((u) => 단위진단(u.인식, u.이름));
  for (const s of 사족) {
    진단.push({ 갈래: '사족', 단위: s.소문항, 근거: `논제 급소「${s.급소}」 — 제시문 어느 단락 급소와도 연결선 없음` });
  }
  return 진단;
}
