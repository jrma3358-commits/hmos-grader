// v2 단위 분리 — 가정(예: 「ならば」)마다 갈라지는 문항을 단위별로 독립 인식하기 위해 자른다.
//
// [오종래 2026-10-01] 「a < b ならば, a = [イ] … となる。 a ≧ b ならば, a = [カ] … となる。」는
//   경우가 둘인 문항이다. 한 그래프에 두 경우를 함께 그리면 빈칸 B가 동점으로 흩어진다 → 경우마다 따로 돌린다.
//
// 이 파일이 하지 않는 것:
//   - 어느 표지가 단위를 여는가를 정하는 일 (봉인 파일의 apply.splitUnits가 정한다)
//   - 단위끼리의 급소를 비교하거나 합치는 일 (단위마다 독립이다)

import type { SealedTable } from '../sealed/schema.ts';
import { build_path_graph } from './graph.ts';

/** 문장 끝 또는 문단 경계 — 약속된 길(graph.ts)과 같은 경계 */
const SENTENCE_END = /[.?!。](?=\s|$)|\n/g;

/**
 * 단위로 자른다 — 공통 발문 + 단위 하나씩.
 *
 *   - 단위 시작 = apply.splitUnits 스위치 노드가 든 문장의 시작 (그 노드 앞 마지막 문장 끝·문단 경계 뒤)
 *   - 단위 끝   = 다음 단위 시작 직전 (마지막 단위는 문장 끝까지)
 *   - 공통 발문 = 첫 단위 시작 앞 글자 전부. 각 단위 앞에 문단 경계(줄바꿈)로 붙인다
 *   - 한 문장에 그 표지가 둘 서면 한 단위다
 *
 * 단위가 둘 미만이면 자르지 않는다 — 빈 배열.
 * 입력은 v2 정규화(`normalizeV2`)를 거친 글이다.
 */
export function split_units(question: string, table: SealedTable): string[] {
  const ids = table.apply.splitUnits ?? [];
  if (!ids.length) return [];
  const at = build_path_graph(question, table)
    .nodes.filter((n) => ids.includes(n.switchId))
    .map((n) => n.index);
  const startOf = (i: number) => {
    const ends = [...question.slice(0, i).matchAll(SENTENCE_END)];
    return ends.length ? ends.at(-1)!.index! + ends.at(-1)![0].length : 0;
  };
  const starts = [...new Set(at.map(startOf))];
  if (starts.length < 2) return [];
  const common = question.slice(0, starts[0]).trim();
  return starts.map((s, k) => {
    const body = question.slice(s, starts[k + 1] ?? question.length).trim();
    return common ? `${common}\n${body}` : body;
  });
}
