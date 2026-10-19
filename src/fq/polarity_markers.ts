// 제시문 B 극성 (오종래 2026-10-19) — 논술 3단계. 논제 B가 기준 극(N극)이고, 제시문 수렴 경로의 B마다
// 주변 기능표지로 당김(원인·주범·혈육 → 급소) · 밀침(대립·배신자 → 급소, 대비) · 없음(배경, 제외)을 판정한다.
// 표지 목록은 봉인 표지사전(봉인/표지사전.json 「극성」)에 있다 — 이 파일은 받은 목록으로 찾기만 한다 (불변원칙 4).
// 주변 = 그 B 노드가 든 문장. 당김 표지가 있으면 당김, 없고 밀침 표지가 있으면 밀침 (판정 순서 3 → 4). 둘 다 없으면 배경.

import type { PathGraph, PathNode } from './v2/graph.ts';

/** 「당김」·「밀침」 → 표지 목록 (봉인 표지사전 「극성」 그대로, 「~」는 앞말 자리) */
export type PolarityMarkerTable = { 당김: readonly string[]; 밀침: readonly string[] };

export interface BPolarity {
  node: PathNode;
  /** 당김·밀침, 표지가 없으면 null (배경) */
  polarity: '당김' | '밀침' | null;
  /** 그 문장에서 찾은 표지 (봉인 표기 그대로) */
  markers: string[];
  /** 주변 = B가 든 문장 */
  sentence: string;
}

/** 표지 머리 조사의 이형 — 받침에 따라 바뀌는 짝 (「~을 비판」 → 「를 비판」, 「~로 인해」 → 「으로 인해」).
 *  조사가 따로 선 표지(조사 뒤 공백)와 「로써」만 — 「~이므로」의 「이」는 조사 짝이 아니다 */
const PARTICLE_PAIRS: [string, string][] = [['을', '를'], ['와', '과'], ['이', '가'], ['로', '으로']];

function surfaces(marker: string): string[] {
  const m = marker.replace(/^~/, '').trim();
  const out = [m];
  for (const [a, b] of PARTICLE_PAIRS) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (m.startsWith(x + ' ') || (x === '로' && m === '로써')) out.push(y + m.slice(x.length));
    }
  }
  return [...new Set(out)];
}

/** 문장 끝 — 마침표·물음표·느낌표 뒤 공백, 또는 줄바꿈 */
function sentenceAround(text: string, at: number): string {
  const ends = [...text.matchAll(/[.?!](?=\s|$)|\n/g)].map((m) => m.index! + 1);
  const start = ends.filter((e) => e <= at).at(-1) ?? 0;
  const end = ends.find((e) => e > at) ?? text.length;
  return text.slice(start, end).trim();
}

/** 문장 안 표지 — 목록 차례 */
export const find_polarity_markers = (sentence: string, markers: readonly string[]): string[] =>
  markers.filter((m) => surfaces(m).some((s) => sentence.includes(s)));

/** 경로 B마다 극성 — 그래프 글(graph.question)에서 B가 든 문장의 표지를 본다 */
export function passage_polarity(graph: PathGraph, nodes: readonly PathNode[], table: PolarityMarkerTable): BPolarity[] {
  return nodes.map((node) => {
    const sentence = sentenceAround(graph.question, node.index);
    const 당김 = find_polarity_markers(sentence, table.당김);
    const 밀침 = find_polarity_markers(sentence, table.밀침);
    return { node, polarity: 당김.length ? '당김' : 밀침.length ? '밀침' : null, markers: 당김.length ? 당김 : 밀침, sentence };
  });
}
