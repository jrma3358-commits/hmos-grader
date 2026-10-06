// v2 단위 분리 — 가정(예: 「ならば」)마다 갈라지는 문항을 단위별로 독립 인식하기 위해 자른다.
//
// [오종래 2026-10-01] 「a < b ならば, a = [イ] … となる。 a ≧ b ならば, a = [カ] … となる。」는
//   경우가 둘인 문항이다. 한 그래프에 두 경우를 함께 그리면 빈칸 B가 동점으로 흩어진다 → 경우마다 따로 돌린다.
//
// 이 파일이 하지 않는 것:
//   - 어느 표지가 단위를 여는가를 정하는 일 (봉인 파일의 apply.splitUnits가 정한다)
//   - 단위끼리의 급소를 비교하거나 합치는 일 (단위마다 독립이다)

import type { SealedTable } from '../sealed/schema.ts';
import { build_path_graph, conjunctionHeads } from './graph.ts';

/** 문장 끝 또는 문단 경계 — 약속된 길(graph.ts)과 같은 경계 */
const SENTENCE_END = /[.?!。](?=\s|$)|\n/g;
/** 쉼표 — 한 문장 안 단위 경계와 문장 머리를 가른다 */
const COMMA = /[,、，]/g;

/**
 * 단위로 자른다 — 공통 발문 + 단위 하나씩.
 *
 *   - 단위 시작 = apply.splitUnits 스위치 노드가 든 문장의 시작 (그 노드 앞 마지막 문장 끝·문단 경계 뒤)
 *   - 한 문장 안에 그 표지가 또 서면 [오종래 2026-10-01], 앞 표지 끝과 이 표지 사이의 마지막 쉼표(「,」「、」「，」) 뒤에서
 *     새 단위를 연다 (예: 「a < b のときは [コサ] であり, a ≧ b のときは [ス] である。」 → 「a ≧ b のときは …」).
 *     사이에 쉼표가 없으면 앞 단위에 붙는다
 *   - 단위 끝   = 다음 단위 시작 직전 (마지막 단위는 문장 끝까지)
 *   - 공통 발문 = 첫 단위 시작 앞 글자 전부. 각 단위 앞에 문단 경계(줄바꿈)로 붙인다
 *   - 문장 머리 [오종래 2026-10-01] — 한 문장이 둘 이상의 단위로 갈리면, 그 문장 시작부터 첫 표지 앞 마지막 쉼표까지
 *     (예: 물음 대상 「… 正の実数 x は,」)는 그 문장의 모든 단위에 공통이다. 첫 단위에서 떼어 내
 *     그 문장의 각 단위 앞에 문단 경계로 붙인다 — 조건 노드의 실체에 끌려 들어가지 않는다. 사이에 쉼표가 없으면 떼지 않는다
 *
 * 단위가 둘 미만이면 자르지 않는다 — 빈 배열.
 * 입력은 v2 정규화(`normalizeV2`)를 거친 글이다.
 */
export function split_units(question: string, table: SealedTable): string[] {
  const ids = table.apply.splitUnits ?? [];
  if (!ids.length) return conjunction_units(question, table);
  const hits = build_path_graph(question, table)
    .nodes.filter((n) => ids.includes(n.switchId))
    .map((n) => ({ at: n.index, end: n.index + n.surface.length }));
  const startOf = (i: number) => {
    const ends = [...question.slice(0, i).matchAll(SENTENCE_END)];
    return ends.length ? ends.at(-1)!.index! + ends.at(-1)![0].length : 0;
  };
  const unitStart = (h: { at: number }, k: number) => {
    const s = startOf(h.at);
    const prev = hits[k - 1];
    if (!prev || prev.end <= s) return s; // 문장 첫 표지
    const commas = [...question.slice(prev.end, h.at).matchAll(COMMA)];
    return commas.length ? prev.end + commas.at(-1)!.index! + 1 : s;
  };

  // cut = 단위 경계(앞 단위가 끝나는 자리), from = 본문 시작(문장 머리를 뗀 뒤), sentence = 단위가 든 문장의 시작
  const units: { cut: number; from: number; sentence: number; at: number }[] = [];
  for (const [k, h] of hits.entries()) {
    const cut = unitStart(h, k);
    if (!units.some((u) => u.cut === cut)) units.push({ cut, from: cut, sentence: startOf(h.at), at: h.at });
  }
  if (units.length < 2) return conjunction_units(question, table);

  const heads = new Map<number, string>();
  for (const sentence of new Set(units.map((u) => u.sentence))) {
    const inSentence = units.filter((u) => u.sentence === sentence);
    if (inSentence.length < 2) continue;
    const first = inSentence[0];
    const commas = [...question.slice(first.cut, first.at).matchAll(COMMA)];
    if (!commas.length) continue;
    first.from = first.cut + commas.at(-1)!.index! + 1;
    heads.set(sentence, question.slice(first.cut, first.from).trim());
  }

  const common = question.slice(0, units[0].cut).trim();
  return units.map((u, k) => {
    const body = question.slice(u.from, units[k + 1]?.cut ?? question.length).trim();
    return [common, heads.get(u.sentence) ?? '', body].filter(Boolean).join('\n');
  });
}

/**
 * 접속사 Q절 나누기 [오종래 2026-10-07] — 문장 머리 접속사(apply.conjunctionClauses, 「그리고」「또한」 등)로 이어진 Q절을
 * 절마다 단위 하나로 자른다 (예: 「근거를 제시하시오. 그리고 노력을 설명하시오.」 → 「근거를 제시하시오.」 · 「노력을 설명하시오.」).
 *   - 접속사 앞 절과 뒤 절(다음 접속사 앞까지)에 Q 노드가 모두 있을 때만 자른다 — 아니면 앞 절에 붙는다
 *   - 접속사 자신은 어느 단위에도 넣지 않는다. 공통 발문은 없다
 * 단위가 둘 미만이면 빈 배열.
 */
function conjunction_units(question: string, table: SealedTable): string[] {
  const heads = conjunctionHeads(question, table);
  if (!heads.length) return [];
  const qs = build_path_graph(question, table).nodes.filter((n) => n.color === 'Q').map((n) => n.index);
  const hasQ = (from: number, to: number) => qs.some((i) => i >= from && i < to);
  const cuts: { at: number; end: number }[] = [];
  let from = 0;
  for (const [k, h] of heads.entries()) {
    const next = heads[k + 1]?.at ?? question.length;
    if (!hasQ(from, h.at) || !hasQ(h.end, next)) continue;
    cuts.push(h);
    from = h.end;
  }
  if (!cuts.length) return [];
  const starts = [0, ...cuts.map((c) => c.end)];
  const ends = [...cuts.map((c) => c.at), question.length];
  return starts.map((s, k) => question.slice(s, ends[k]).trim());
}
