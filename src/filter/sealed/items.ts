// [봉인⑩~⑬] 필터 판정 중 판단이 드는 항목 (문항분석 명세서-2 §5) — 오종래가 채운다.
// 구조만으로 가릴 수 있는 항목(급소 명확·재료 완결·논술형 관계 적절)은 judge.ts에 있다.
// 코드가 대신 판단하지 않는다. 비어 있으면 소리 내어 실패한다.
// ⑬은 채워졌다 (오종래 2026-10-13) — C·논술 5단계 정교화 4갈래 진단 (조립설명서 C·논술 9단계).
import type { V2Analysis } from '../../fq/pipeline.ts';
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

/** 4단계 ④사족 — 제시문 노드 중 논제와 연결선이 없는 것 */
export interface 사족노드 {
  단락: string;
  실체: string;
}

export interface 정교화진단 {
  갈래: 정교화갈래;
  /** 진단한 단위(소문항). 논제 전체에 걸린 진단(④사족)은 null */
  단위: string | null;
  근거: string;
}

type 인식단위 = Pick<V2Analysis, 'question' | 'graph' | 'pivot'>;

/** 단위 이름 — 소문항 번호 「(1-1)」이 앞에 있으면 그것, 없으면 순번 */
function 단위이름(u: 인식단위, i: number, 여럿: boolean): string | null {
  const m = /^\s*(\(\d+(?:-\d+)?\))/.exec(u.question);
  return m ? m[1] : 여럿 ? `단위 ${i + 1}` : null;
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

  // ③ 급소불명확 — MULTIPLE_CONVERGENCE, 또는 수렴도(convergence) 0인 급소
  if (!u.pivot.ok && u.pivot.flag === 'MULTIPLE_CONVERGENCE') {
    진단.push({ 갈래: '급소불명확', 단위, 근거: `MULTIPLE_CONVERGENCE — 후보 ${u.pivot.candidates.map((n) => `「${n.entity.trim()}」`).join(' ')}` });
  }
  for (const p of pivots) {
    if (p.convergence === 0) {
      진단.push({ 갈래: '급소불명확', 단위, 근거: `급소「${p.node.entity.trim()}」(${p.node.id}) 수렴도 0 — ${p.reason}로 섬` });
    }
  }
  return 진단;
}

/**
 * [봉인⑬] 정교화 진단 — 논제 인식(엔진)과 4단계 ④사족에서 정교화 4갈래를 가린다. 빈 배열 = 정교화 신호 없음.
 * [오종래 2026-10-13]
 *   ① 일방흐름: 논제 B노드가 C노드 없이 Q로 바로 연결될 때 — 급소 B만 본다. 길 순서상 급소 B 바로 다음이 Q이고, 단위에 C 노드가 없다
 *   ② 서술복잡: B노드가 3개 이상이고 C-F 없을 때 — 소문항(단위)마다 센다
 *   ③ 급소불명확: pivot 수렴도가 낮거나 MULTIPLE_CONVERGENCE일 때 — 「낮다」 = convergence 0
 *   ④ 사족: 제시문 노드 중 논제와 연결선 없는 것 — 4단계 결과를 받아 그대로 싣는다 (생성 없음)
 * 엔진이 소문항으로 나누면 ①②③은 단위마다, 나누지 않으면 논제 전체를 한 단위로 본다.
 */
export function 봉인13_정교화진단(논제: V2Analysis & { units?: V2Analysis[] }, 사족: 사족노드[]): 정교화진단[] {
  const units: 인식단위[] = 논제.units?.length ? 논제.units : [논제];
  const 진단 = units.flatMap((u, i) => 단위진단(u, 단위이름(u, i, units.length > 1)));
  for (const s of 사족) {
    진단.push({ 갈래: '사족', 단위: null, 근거: `제시문 ${s.단락}의 「${s.실체}」 — 논제와 연결선 없음` });
  }
  return 진단;
}
