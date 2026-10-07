// 논제 생성 — 기존 논제 판정 + 안 쓴 제시문 급소로 추가 논제 후보
//
// [오종래 2026-10-07] 구현 순서
//   1. 기존 논제 keyword와 제시문 급소 대조 → 타당·불완전·사족 판정
//   2. 제시문 급소(서두·말미 B) 중 미사용 추출 → 후보 풀
//   3. 후보 풀에서 패턴 판별 — 제시문 1개 → 설명형 · 제시문 2개 이상 → 비교형 · 원인-결과 구조 → 이유형
//   4. 패턴별 논제문 생성 (완성 문장)
//
// 이 층은 논제를 세우고 멈춘다. 풀지 않는다.

import type { V2Analysis } from '../pipeline.ts';
import type { SealedTable } from '../sealed/schema.ts';
import type { PathNode } from './graph.ts';
import { DEICTICS } from './pivot.ts';
import { passageLabels, type PassageConnection, type PassageParagraph, type PassageRecognition } from './passage.ts';

export type Verdict = '타당' | '불완전' | '사족';

export interface QuestionVerdict {
  /** questions의 자리 */
  question: number;
  /** 논제 급소 keyword. 급소가 서지 않았으면 비어 있다 */
  pivots: string[];
  verdict: Verdict;
  /** 불완전·사족의 까닭 한 줄 */
  reason?: string;
  /** 단락 급소로 이어진 제시문 기호 */
  linked: string[];
}

export interface PoolEntry {
  paragraph: number;
  label?: string;
  /** 원문의 명사구 전체 (nounPhrase) — 노드 실체는 node.entity */
  entity: string;
  place: '서두' | '말미';
  node: PathNode;
  /** 같은 문장 안 원인-결과 표지 뒤에 선 B — 결과 B */
  result: boolean;
}

export type CandidatePattern = '설명형' | '비교형' | '이유형';

export interface QuestionCandidate {
  pattern: CandidatePattern;
  /** 참조 제시문 기호 */
  labels: string[];
  /** 급소 keyword — 하나 */
  keyword: string;
  /** 후보를 이룬 풀 항목 */
  sources: PoolEntry[];
  /** 완성 논제문 */
  text: string;
}

/** 일반 항목 필터로 풀에서 빠진 항목 */
export interface ExcludedEntry {
  entry: PoolEntry;
  reason: string;
}

export interface Generation {
  verdicts: QuestionVerdict[];
  pool: PoolEntry[];
  /** 너무 일반적이라 풀에서 뺀 항목 — 교사가 되살릴 수 있게 남긴다 */
  excluded: ExcludedEntry[];
  candidates: QuestionCandidate[];
}

const clean = (s: string) => s.trim().replace(/^[\s,]+/, '');
const SENTENCE_END = /[.?!](?=\s|$)/g;

/** 받침 유무로 조사를 고른다. 한글 음절이 아니면 둘 다 적는다 */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.at(-1)!.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${withFinal}(${withoutFinal})`;
  return (code - 0xac00) % 28 ? withFinal : withoutFinal;
}
const quoted = (s: string) => `「${s}」`;
const labelList = (labels: string[]) => labels.map((l) => `[${l}]`).join(', ');

/** 논제 급소 — keyword와 노드 id */
function questionPivots(q: V2Analysis): { keyword: string; id: string }[] {
  if (!q.pivot.ok) return [];
  return (q.pivot.pivots ?? [q.pivot.pivot]).map((p) => ({ keyword: clean(p.keyword ?? p.node.entity), id: p.node.id }));
}

/**
 * 1. 판정 — 논제 급소 keyword마다 그 급소에서 온 단락 급소가 있는가.
 *   타당   급소가 하나이고, 그 급소에 닿은 단락 급소가 keyword의 머리말만이 아니다
 *   불완전 급소가 둘 이상(분리 필요) · 급소 미성립 · 급소에 닿은 단락이 없고 관련 정보로만 이어짐 ·
 *          닿은 단락 급소가 keyword 앞머리 조각뿐(「B국」 ↔ 「B국이 시행한 대응조치」 — 우리말 명사구의 머리는 끝에 온다)
 *   사족   참조 제시문 어디에도 닿지 않는다
 */
function judge(i: number, q: V2Analysis, c: PassageConnection, labels: (string | undefined)[]): QuestionVerdict {
  const pivots = questionPivots(q);
  const linked = [...new Set(c.pivots.flatMap((pv, j) => (pv && labels[j] ? [labels[j]!] : [])))];
  const base = { question: i, pivots: pivots.map((p) => p.keyword), linked };
  if (!linked.length) return { ...base, verdict: '사족', reason: '참조 제시문 어디에도 급소가 닿지 않는다' };
  if (!pivots.length) return { ...base, verdict: '불완전', reason: `논제 급소가 서지 않았다 (${q.pivot.ok ? '' : q.pivot.flag})` };
  if (pivots.length > 1) {
    const missed = pivots.filter((p) => !c.pivots.some((pv) => pv?.questionNode === p.id)).map((p) => quoted(p.keyword));
    return {
      ...base,
      verdict: '불완전',
      reason: `급소 ${pivots.length}개 — 논제 분리 필요${missed.length ? ` · ${missed.join('·')}에 닿은 단락 없음` : ''}`,
    };
  }
  const [p] = pivots;
  const hits = c.pivots.flatMap((pv, j) => (pv?.questionNode === p.id ? [{ pv, label: labels[j] }] : []));
  if (!hits.length) {
    return { ...base, verdict: '불완전', reason: `급소 ${quoted(p.keyword)}에 닿은 단락 없음 — 관련 정보로만 ${labelList(linked)} 연결` };
  }
  const fragments = hits.filter(({ pv }) => pv.entity !== p.keyword && p.keyword.startsWith(pv.entity));
  if (fragments.length === hits.length) {
    const f = fragments.map(({ pv, label }) => `[${label}] ${quoted(pv.entity)}`).join('·');
    return { ...base, verdict: '불완전', reason: `${f}이 keyword ${quoted(p.keyword)}의 앞머리에만 닿았다 — 머리말에 닿은 단락 급소 없음` };
  }
  return { ...base, verdict: '타당' };
}

/** 문장 시작 자리들 */
function sentenceStarts(text: string): number[] {
  return [0, ...[...text.matchAll(SENTENCE_END)].map((m) => m.index! + 1)];
}

/**
 * 2. 후보 풀 — 단락의 서두·말미 B 가운데
 *   어느 논제의 단락 급소로도 쓰이지 않았고 · 기존 논제문에 이미 나오지 않으며 ·
 *   두 글자 이상이고 열쇠 예외(일반 명사)가 아닌 것. 같은 단락의 같은 실체는 한 번.
 *   너무 일반적인 항목(genericReason)은 빼서 excluded에 까닭과 함께 남긴다.
 *   풀 전체에서 다른 항목에 포함되는 항목은 빼고, 완전히 같은 항목은 하나만 남긴다.
 */
function buildPool(
  passage: PassageRecognition,
  questions: V2Analysis[],
  connections: PassageConnection[],
  table: SealedTable,
): { pool: PoolEntry[]; excluded: ExcludedEntry[] } {
  const labels = passageLabels(passage.paragraphs);
  const causal = table.apply.causalSwitches ?? [];
  const pool: PoolEntry[] = [];
  passage.paragraphs.forEach((p, i) => {
    const used = connections.flatMap((c) => (c.pivots[i] ? [c.pivots[i]!] : []));
    const starts = sentenceStarts(p.text);
    const sentenceOf = (index: number) => starts.filter((s) => s <= index).at(-1)!;
    for (const [place, nodes] of [['서두', p.head], ['말미', p.tail]] as const) {
      for (const node of nodes) {
        const entity = nounPhrase(p, node, starts, table);
        if (entity.length < 2 || passage.keyExceptions.includes(entity)) continue;
        if (used.some((u) => u.node.id === node.id || u.entity === entity)) continue;
        if (questions.some((q) => q.question.includes(entity))) continue;
        if (pool.some((e) => e.paragraph === i && e.entity === entity)) continue;
        const from = sentenceOf(node.index);
        const result = p.graph.nodes.some((n) => causal.includes(n.switchId) && n.index >= from && n.index < node.index);
        pool.push({ paragraph: i, label: labels[i], entity, place, node, result });
      }
    }
  });
  const excluded: ExcludedEntry[] = [];
  const specific = pool.filter((e) => {
    const reason = genericReason(e.entity);
    if (reason) excluded.push({ entry: e, reason });
    return !reason;
  });
  // 중복 제거 [오종래 2026-10-07] — 다른 항목의 부분 문자열이면 짧은 것을 뺀다. 완전히 같으면 앞의 하나만 남긴다
  return {
    pool: specific.filter((a, i) => !specific.some((b, j) => (b.entity === a.entity ? j < i : b.entity.includes(a.entity)))),
    excluded,
  };
}

/** 국가명 — A국·B국 같은 기호 국가와 자국·타국 */
const NATION = /^(?:[A-Z]국|자국|타국)$/;
/** 지시어·대명사 — 논제 급소의 지시어(pivot.ts)에 「해당」·「저」 계열을 더한다 */
const GENERIC_DEICTICS = [...DEICTICS, '해당', '저', '저것', '저러한', '이런', '그런', '저런'];

/**
 * 일반 항목 필터 [오종래 2026-10-07] — 논제로 쓰기엔 너무 일반적인 항목. 하나라도 해당하면 까닭을 낸다.
 *   ① 국가명 + 일반명사 한 낱말 (「B국 정부」「자국 경제」)
 *   ② 두 글자 한자어 단독·나란히 — 꾸밈 없는 한글 낱말이 두 글자 단위로만 되어 모두 네 글자 이하 (「국제 사회」「상품수지」)
 *      한자어 여부는 표지로 가릴 수 없어 두 글자 단위로만 본다
 *   ③ 지시어·대명사로 시작 (「이」「그」「저」 계열의 어절)
 */
function genericReason(entity: string): string | undefined {
  const words = entity.split(/\s+/);
  if (words.length === 2 && NATION.test(words[0])) return '국가명+일반명사';
  const syllables = words.join('');
  if (/^[가-힣\s]+$/.test(entity) && words.every((w) => w.length % 2 === 0) && syllables.length <= 4) return '2글자 한자어 단독';
  if (GENERIC_DEICTICS.includes(words[0])) return '지시어 시작';
  return undefined;
}

/** 명사구 밖의 말 — 문장 부사·접속 부사. 이 낱말에서 명사구가 끊긴다 (봉인 apply.conjunctionClauses도 함께 본다) */
const PHRASE_STOPS = ['이에', '따라', '그', '결과', '그러자', '결국', '최근', '여전히', '그런데', '하지만', '같이', '대폭', '크게'];
/** 낱말 끝이 이 말이면 조사·연결 어미가 붙은 어절이다 — 명사구 안의 꾸밈 말이 아니면 거기서 끊긴다 */
const WORD_ENDINGS = ['에서', '으로', '면서', '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '도', '만', '고', '며', '자', '해', '서', '여', '게', '히'];
/** 관형어(「~을 통한」「~에 대한」)가 끌어오는 앞 어절의 끝 */
const ARGUMENT_ENDINGS = ['에서', '으로', '을', '를', '에', '와', '과', '로'];

const endsWithAny = (w: string, tails: string[]) => tails.some((t) => w.endsWith(t) && w.length > t.length);
/** 끝 음절 받침이 ㄴ인 두 글자 이상 낱말 — 관형형(「통한」「대한」「직접적인」) */
const adnominalN = (w: string) => {
  const code = w.at(-1)!.charCodeAt(0);
  return w.length >= 2 && code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 4;
};

/**
 * 명사구 전체 [오종래 2026-10-07] — 논제문에는 잘린 노드 실체가 아니라 원문의 명사구 전체를 쓴다.
 *   왼쪽: 표지 앞 낱말(머리)에서 문장 머리 쪽으로 걸으며 명사구 안의 말만 붙인다 —
 *         조사 없는 낱말 · 명사구 연결 조사(apply.nounChainMarkers, 「~의」) 어절 ·
 *         관형어(받침 ㄴ, 「통한」「대한」 — 앞 어절이 「~을」「~에」면 그것까지, 「~을 하는」의 「는」도).
 *         쉼표·접속 부사·조사/연결 어미 어절에서 끊는다 (「높아지고 국제 …」 → 「국제 …」).
 *   오른쪽: 표지가 명사구 연결 조사(「A국의」)면 뒤 명사로 잇는다 — 바로 뒤 노드면 그 실체, 아니면 조사가 붙은 어절까지
 *         (「수입품의 가격이」 → 「수입품의 가격」).
 */
function nounPhrase(p: PassageParagraph, node: PathNode, starts: number[], table: SealedTable): string {
  const chain = table.apply.nounChainMarkers ?? [];
  const stops = [...PHRASE_STOPS, ...(table.apply.conjunctionClauses ?? [])];
  const from = starts.filter((s) => s <= node.index).at(-1)!;
  const words = p.text.slice(from, node.index).trim().split(/\s+/);
  const left: string[] = [words.pop()!];
  while (words.length) {
    const w = words.at(-1)!;
    if (w.endsWith(',') || stops.includes(w)) break;
    if (endsWithAny(w, chain)) left.unshift(words.pop()!);
    else if (adnominalN(w) && (!/[은는]$/.test(w) || endsWithAny(words.at(-2) ?? '', ['을', '를']))) {
      left.unshift(words.pop()!);
      if (words.length && endsWithAny(words.at(-1)!, ARGUMENT_ENDINGS) && !words.at(-1)!.endsWith(',')) left.unshift(words.pop()!);
    } else if (!endsWithAny(w, WORD_ENDINGS)) left.unshift(words.pop()!);
    else break;
  }
  let phrase = left.join(' ');
  let cur = node;
  while (chain.includes(cur.surface.replace(/^~/, '').trim())) {
    const after = cur.index + cur.surface.length;
    const next = p.graph.nodes.find((n) => n.index > cur.index);
    const nextStart = next ? p.text.indexOf(clean(next.entity), after) : -1;
    if (next && nextStart >= 0 && p.text.slice(after, nextStart).trim() === '' && nextStart + clean(next.entity).length <= next.index) {
      phrase += `${cur.surface} ${clean(next.entity)}`;
      cur = next;
      continue;
    }
    const rest = p.text.slice(after).trim().split(/\s+/).slice(0, 3);
    const tail: string[] = [];
    for (const w of rest) {
      const t = WORD_ENDINGS.find((e) => w.endsWith(e) && w.length > e.length);
      if (stops.includes(w)) break;
      tail.push(t ? w.slice(0, -t.length) : w);
      if (t) break;
    }
    if (tail.length) phrase += `${cur.surface} ${tail.join(' ')}`;
    break;
  }
  return clean(phrase.replace(/[.,]+$/, ''));
}

/** 명사구의 머리 — 끝 낱말 (우리말 명사구의 머리는 끝에 온다). 두 글자 이상의 한글 낱말이 아니면 없다 */
function headWord(entity: string): string | undefined {
  const w = entity.split(/[\s,·]+/).at(-1)!.replace(/\(.*?\)/g, '');
  return /^[가-힣]{2,}$/.test(w) ? w : undefined;
}

/**
 * 3·4. 패턴 판별 + 논제문.
 *   비교형 — 둘 이상 제시문의 풀 항목이 같은 머리 낱말(keyword)을 갖는다 (「해외 의존도」·「무역 의존도」·「C국에 대한 의존도」).
 *            그 낱말이 기존 논제문에 없을 때만.
 *   이유형 — 비교형에 들지 않은 결과 B (원인-결과 표지 뒤).
 *   설명형 — 그 밖의 풀 항목 하나.
 */
function buildCandidates(pool: PoolEntry[], questions: V2Analysis[], passage: PassageRecognition): QuestionCandidate[] {
  const byWord = new Map<string, PoolEntry[]>();
  for (const e of pool) {
    const w = headWord(e.entity);
    if (w) byWord.set(w, [...(byWord.get(w) ?? []), e]);
  }
  const out: QuestionCandidate[] = [];
  const grouped = new Set<PoolEntry>();
  const groups = [...byWord]
    .filter(([w]) => !passage.keyExceptions.includes(w) && !questions.some((q) => q.question.includes(w)))
    .map(([w, es]): [string, PoolEntry[], string[]] => [w, es, [...new Set(es.map((e) => e.label ?? String(e.paragraph)))]])
    .filter(([, , labels]) => labels.length >= 2)
    .sort(([a, , la], [b, , lb]) => lb.length - la.length || b.length - a.length);
  for (const [keyword, sources, labels] of groups) {
    if (sources.every((s) => grouped.has(s))) continue;
    sources.forEach((s) => grouped.add(s));
    out.push({
      pattern: '비교형',
      labels,
      keyword,
      sources,
      text: `제시문 ${labelList(labels)}에 나타난 ${quoted(keyword)}${josa(keyword, '을', '를')} 비교하여 설명하시오.`,
    });
  }
  for (const e of pool) {
    if (grouped.has(e)) continue;
    const label = e.label ?? String(e.paragraph);
    out.push(
      e.result
        ? {
            pattern: '이유형',
            labels: [label],
            keyword: e.entity,
            sources: [e],
            text: `제시문 [${label}]에서 ${quoted(e.entity)}${josa(e.entity, '이', '가')} 나타난 이유를 설명하시오.`,
          }
        : {
            pattern: '설명형',
            labels: [label],
            keyword: e.entity,
            sources: [e],
            text: `제시문 [${label}]에 나타난 ${quoted(e.entity)}${josa(e.entity, '을', '를')} 설명하시오.`,
          },
    );
  }
  return out;
}

/**
 * 논제 생성 — questions[i]와 connections[i]는 같은 논제다 (connectPassage(questions[i], passage)).
 * table은 원인-결과 표지(apply.causalSwitches)를 읽는 데만 쓴다.
 */
export function generateQuestions(
  passage: PassageRecognition,
  questions: V2Analysis[],
  connections: PassageConnection[],
  table: SealedTable,
): Generation {
  if (questions.length !== connections.length) throw new Error('questions와 connections의 수가 다르다');
  const labels = passageLabels(passage.paragraphs);
  const verdicts = questions.map((q, i) => judge(i, q, connections[i], labels));
  const { pool, excluded } = buildPool(passage, questions, connections, table);
  return { verdicts, pool, excluded, candidates: buildCandidates(pool, questions, passage) };
}
