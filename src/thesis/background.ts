// 배경 제시문 단락 실체 [오종래 2026-10-20 확정] — 라벨 없는 배경 제시문(P, align.ts background_passage)은
//   단락(빈 줄 기준)으로 나누고, 단락마다 실체(개념·정의·상황) 하나를 잡아 ② 세우기 조각으로 쓴다. 단락마다 하나의 실체가 산다.
//
// 실체 잡는 차례 (오종래 2026-10-20 확정 — 정의문 우선):
//   1. 정의문 — 단락 첫 문장이 「A은/는 B이다.」면 B (「첫 번째 방식은 만장일치에 의한 의사결정이다.」 → 「만장일치에 의한 의사결정」)
//   2. 논제 실체 — 단락의 B 노드 가운데 실체가 논제 노드와 같은 것 (논제가 방향, 「다수결 원칙」)
//   3. 핵심 메시지 — 결론 문장(없으면 마지막 문장)의 주어 · 주어가 지시어면 정의꼴 문장의 주어 (message.ts, 오종래 2026-10-20 확정 —
//      단락 첫 문장 B 우선은 정의문이 있을 때만)
//   4. 단락 첫 B
//
// 이 파일은 글의 모양(빈 줄·문장 끝·「은/는 … 이다.」)과 엔진 5색 결과만 읽는다. 뜻을 풀지 않는다.

import { recognizeV2Analysis } from '../fq/index.ts';
import { passage_message } from './message.ts';

export interface 배경단락 {
  /** 「#1」「#2」… (라벨 없는 단락 순번) */
  라벨: string;
  텍스트: string;
  /** 이 단락의 실체 — 세우기 조각의 실체 */
  실체: string;
  /** 실체가 든 문장 */
  문장: string;
  /** 실체를 잡은 차례 */
  근거: '정의문' | '논제 실체' | '반론 원인' | '결론 문장' | '마지막 문장' | '정의꼴 문장' | '첫 B';
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '').replace(/[\s,，]+$/, '');
const 문장들 = (t: string) => t.trim().split(/(?<=[.?!。])\s+/).map((x) => x.trim()).filter(Boolean);
/** 정의문 「A은/는 B이다.」 — B는 「이다」 바로 앞까지 */
const 정의문 = /^\S.*?(?:은|는)\s+(.+?)이다[.。]?$/;

/** 배경 제시문 → 단락마다 실체 하나. 논제노드 = 논제(소문항) 노드 실체들 */
export function background_paragraphs(글: string, 논제노드: readonly string[] = []): 배경단락[] {
  const 논제 = new Set(논제노드.map(clean).filter(Boolean));
  return 글.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((x) => x.trim()).filter(Boolean).map((텍스트, i) => {
    const 라벨 = `#${i + 1}`;
    const 줄 = 문장들(텍스트);
    const 첫 = 줄[0] ?? 텍스트;
    const m = 정의문.exec(첫);
    if (m && clean(m[1])) return { 라벨, 텍스트, 실체: clean(m[1]), 문장: 첫, 근거: '정의문' };
    const bs = recognizeV2Analysis(텍스트).graph.nodes.filter((n) => n.color === 'B').map((n) => clean(n.entity)).filter(Boolean);
    const 같은 = bs.find((b) => 논제.has(b));
    if (같은) return { 라벨, 텍스트, 실체: 같은, 문장: 줄.find((s) => s.includes(같은)) ?? 첫, 근거: '논제 실체' };
    const 메시지 = passage_message(텍스트);
    if (메시지) return { 라벨, 텍스트, ...메시지 };
    return { 라벨, 텍스트, 실체: bs[0] ?? clean(첫), 문장: 첫, 근거: '첫 B' };
  });
}
