// C·논술 4단계 — 논제↔제시문 연결 평가 중 엔진 몫 ①타당 ③불완전 ④사족 (논제생성 명세서-2 §3-5-1).
// ②비약은 의미 판단이라 Claude 몫이다 (/api/leap). 여기서는 하지 않는다.
//
// 입력: 2단계 소문항 인식(엔진) + 3단계 제시문 분석(Claude, 단락별 P·B·D·C·급소·관련 실체)
// 연결선 = keyword 포함 (passage.ts 원칙 ②의 contains — 한쪽이 다른 쪽을 품는다, 품기는 쪽은 두 글자 이상)
// 소문항은 참조 제시문 범위 안의 단락하고만 이어진다. 참조가 없으면 모든 단락.
//
// [오종래 2026-10-13]
//   ① 타당: 논제 B노드 ↔ 제시문 급소 매칭
//   ③ 불완전: 제시문 급소 중 논제에 안 온 것
//   ④ 사족: 제시문 노드 중 논제와 연결 없는 것
// [구현 2026-10-13] ④의 「연결」 = 범위 안 소문항의 노드(Q 제외) 실체·급소 keyword와 keyword 포함, 또는 3단계가 그 단락에서
//   논제 급소 관련으로 뽑은 실체와 keyword 포함. 단락 급소는 ④에 넣지 않는다 — 이어지지 않은 급소는 ③이다.

import type { V2Analysis } from '../fq/pipeline.ts';
import { contains } from '../fq/v2/passage.ts';
import type { 사족노드 } from '../filter/sealed/items.ts';

/** 3단계 산출 — 단락 하나 (Claude) */
export interface 단락분석 {
  /** 제시문 기호 (「가」) — 기호 없는 제시문이면 「제시문」 */
  단락: string;
  P: string[];
  B: string[];
  D: string[];
  C: string[];
  /** 단락 자체의 무게중심 B */
  급소: string;
  /** 논제 급소와 관련된 실체 — 어느 소문항의 급소와 이어지는가 */
  관련: { 소문항: string | null; 실체: string; 근거문장: string }[];
}

/** 2단계 산출 — 소문항 하나 (엔진) */
export interface 인식소문항 {
  번호: string | null;
  참조: string[];
  인식: Pick<V2Analysis, 'graph' | 'pivot'>;
}

export interface 타당연결 {
  소문항: string | null;
  /** 논제 B노드 id·실체 */
  노드: string;
  실체: string;
  단락: string;
  단락급소: string;
}

export interface 불완전 {
  단락: string;
  단락급소: string;
}

export interface 정합엔진 {
  타당: 타당연결[];
  불완전: 불완전[];
  사족: 사족노드[];
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');
const inScope = (s: 인식소문항, 단락: string) => !s.참조.length || s.참조.includes(단락);

/** 소문항의 열쇠 — Q가 아닌 노드 실체 + 급소 keyword */
function 열쇠(s: 인식소문항): string[] {
  const keys = s.인식.graph.nodes.filter((n) => n.color !== 'Q').map((n) => clean(n.entity));
  if (s.인식.pivot.ok) for (const p of s.인식.pivot.pivots ?? [s.인식.pivot.pivot]) keys.push(clean(p.keyword ?? p.node.entity));
  return [...new Set(keys.filter(Boolean))];
}

/** 4단계 엔진 몫 — ①타당 ③불완전 ④사족 */
export function align_passage(소문항들: 인식소문항[], 단락들: 단락분석[]): 정합엔진 {
  const 타당: 타당연결[] = [];
  for (const s of 소문항들) {
    for (const n of s.인식.graph.nodes) {
      if (n.color !== 'B') continue;
      const e = clean(n.entity);
      for (const d of 단락들) {
        if (inScope(s, d.단락) && clean(d.급소) && contains(e, clean(d.급소))) {
          타당.push({ 소문항: s.번호, 노드: n.id, 실체: e, 단락: d.단락, 단락급소: clean(d.급소) });
        }
      }
    }
  }

  const 불완전 = 단락들
    .filter((d) => clean(d.급소) && !타당.some((t) => t.단락 === d.단락))
    .map((d) => ({ 단락: d.단락, 단락급소: clean(d.급소) }));

  const 사족: 사족노드[] = [];
  for (const d of 단락들) {
    const keys = 소문항들.filter((s) => inScope(s, d.단락)).flatMap(열쇠);
    const 관련 = d.관련.map((r) => clean(r.실체)).filter(Boolean);
    const 급소 = clean(d.급소);
    for (const 실체 of new Set([...d.P, ...d.B, ...d.D, ...d.C].map(clean).filter(Boolean))) {
      if (실체 === 급소) continue;
      const 이어짐 = keys.some((k) => contains(실체, k)) || 관련.some((r) => contains(실체, r));
      if (!이어짐) 사족.push({ 단락: d.단락, 실체 });
    }
  }
  return { 타당, 불완전, 사족 };
}
