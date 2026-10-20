// 제시문 핵심 한 줄 · 제시문 간 관계 — 5단계 정교화 · 6단계 추가 논제 화면의 키워드 입력창 위 (오종래 2026-10-21).
// 엔진만 쓴다 (Claude 없음):
//   핵심 — 6단계 단락 급소(봉인⑭ 급소단락, 논제와 닿은 단락 핵심)를 제시문마다 모은다. 표시는 표기(논제 핵심 덩어리), 관계는 급소로.
//          단락 급소가 없는 제시문은 제시문 전체 급소(v2 pivot — 1차 필터 봉인⑧과 같은 핵심). 그것도 서지 않으면 null
//   관계 — 핵심이 선 제시문 쌍마다 봉인⑧ 관계 대조 (유사 → 실증 → 대비). 핵심이 여럿인 제시문은 핵심 짝마다, 같은 쌍·같은 유형은 하나로
import { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import { 봉인8_관계대조, type 관계유형 } from '../filter/sealed/relation.ts';
import type { 급소단락 } from './relate.ts';

export interface 제시문핵심줄 {
  id: string;
  /** 화면에 보일 핵심 (단락 급소면 표기, 전체 급소면 실체). 없으면 빈 배열 */
  핵심: string[];
  출처: '단락 급소' | '제시문 급소' | null;
  /** 핵심이 서지 않은 까닭 (MULTIPLE_CONVERGENCE 등) */
  flag?: string;
}

export interface 제시문관계줄 {
  a: string;
  b: string;
  유형: 관계유형;
  /** 대조한 두 핵심 (급소) */
  핵심: [string, string];
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');

export function passage_cores(제시문: { id: string; 텍스트: string }[], 급소단락: readonly 급소단락[] = []): { 핵심: 제시문핵심줄[]; 관계: 제시문관계줄[] } {
  const 줄: (제시문핵심줄 & { 대조: { 실체: string; node: PathNode }[]; 노드: readonly PathNode[] })[] = 제시문.map(({ id, 텍스트 }) => {
    const a = recognizeV2Analysis(텍스트);
    const 단락 = 급소단락.filter((x) => x.단락 === id);
    if (단락.length) {
      // 단락 급소는 단락 인식 노드에서 왔다 — 제시문 노드 가운데 같은 실체를 찾아 ⑧ 대조 노드로 쓴다 (없으면 노드 없이)
      const 대조 = [...new Set(단락.map((x) => clean(x.급소)))].map((g) => ({ 실체: g, node: a.graph.nodes.find((n) => clean(n.entity) === g) ?? ({ id: `#${g}`, entity: g } as PathNode) }));
      return { id, 핵심: [...new Set(단락.map((x) => clean(x.표기 ?? x.급소)))], 출처: '단락 급소' as const, 대조, 노드: a.graph.nodes };
    }
    if (a.pivot.ok) {
      const n = a.pivot.pivot.node;
      return { id, 핵심: [clean(n.entity)], 출처: '제시문 급소' as const, 대조: [{ 실체: clean(n.entity), node: n }], 노드: a.graph.nodes };
    }
    return { id, 핵심: [], 출처: null, flag: a.pivot.flag, 대조: [], 노드: a.graph.nodes };
  });

  const 관계: 제시문관계줄[] = [];
  const 선 = 줄.filter((x) => x.대조.length);
  for (let i = 0; i < 선.length; i++) {
    for (const b of 선.slice(i + 1)) {
      const a = 선[i];
      for (const ka of a.대조) {
        for (const kb of b.대조) {
          const 유형 = 봉인8_관계대조({ id: a.id, 핵심: { 실체: ka.실체, node: ka.node }, 노드: a.노드 }, { id: b.id, 핵심: { 실체: kb.실체, node: kb.node }, 노드: b.노드 });
          if (!관계.some((r) => r.a === a.id && r.b === b.id && r.유형 === 유형)) 관계.push({ a: a.id, b: b.id, 유형, 핵심: [ka.실체, kb.실체] });
        }
      }
    }
  }
  return { 핵심: 줄.map(({ id, 핵심, 출처, flag }) => ({ id, 핵심, 출처, ...(flag ? { flag } : {}) })), 관계 };
}
