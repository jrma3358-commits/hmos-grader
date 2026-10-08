// v2 경로 그래프 — 표지가 문장 위에 그리는 경로의 뼈대.
//
// 노드 = 조사·어미 (실체를 끌고 나와 색을 켜는 자리)
// 간선 = 부사·연결어 (노드와 노드 사이의 관계)
//
// 이 파일이 하지 않는 것:
//   - 어떤 표지가 어떤 색인가를 정하는 일 (봉인 파일이 정한다)
//   - 어떤 표지가 노드인가 간선인가를 정하는 일 (봉인 파일의 `kind`가 정한다)
//   - 색이 미결일 때 대신 고르는 일 (미결로 들어 올린다)
//
// 7형식은 **닫힌 목록이 아니다.** 백서 §4-3은 "이 문제 구조와 **그 조합**"이라 적는다.
// 그래서 조합은 색의 배열 그대로 남고, 형식 이름은 그 조합에 붙는 라벨일 뿐이다.
// 이름이 없는 조합도 유효하다 — 색을 하나도 버리지 않는다. (v1의 병: BUILD_PLAN §6-3)

import { SealedError } from '../sealed/index.ts';
import type { SealedSwitch, SealedTable } from '../sealed/schema.ts';
import type { Color, SwitchKind } from '../types.ts';

export interface PathNode {
  id: string;
  /** 문장에서 실제로 걸린 표지 표층형 */
  surface: string;
  /** 봉인 파일의 어느 스위치가 걸렸나 */
  switchId: string;
  index: number;
  /** 이 표지가 켠 등. 봉인 파일이 미결이면 null — 추측하지 않는다 */
  color: Color | null;
  /** 표지가 끌고 나온 실체(앞말). 표지가 주인이고 실체는 끌려 나온다 (백서 §3-4) */
  entity: string;
  /** Q→B로 접혀 B가 된 판단기준 노드의 원래 색. 접히지 않은 노드에는 없다 */
  foldedFrom?: Color | null;
  /** 재색칠(apply.recolorTargets 간선, apply.recolorPrevious 뒤 표지)로 색이 바뀐 노드의 원래 색. 바뀌지 않은 노드에는 없다 */
  recoloredFrom?: Color | null;
  /** 자리 규칙(apply.contextRules)이 색을 바꾼 노드 — 규칙 id와 원래 색. 바뀌지 않은 노드에는 없다 */
  contextRule?: { id: string; from: Color | null };
  /** 결과 묶기(apply.foldResult)로 묶인 B 노드 — 그 조건 노드의 id. 묶이지 않은 노드에는 없다 */
  resultOf?: string;
  /** 강한 C(apply.strongC)에 연결된 B 노드 — 그 강한 C 노드의 id. 급소로 선다. 연결되지 않은 노드에는 없다 */
  anchoredBy?: string;
  /** 제시문 블록(apply.passageBlocks)으로 문단 전체를 잡은 B 노드 — 그 빈칸 노드의 id. 아닌 노드에는 없다 */
  passageOf?: string;
  /** 발문 P 고정으로 B에서 P가 된 노드 — 같은 실체를 처음 P로 잡은 발문 노드의 id. 아닌 노드에는 없다 */
  stemPinnedBy?: string;
}

export interface PathEdge {
  from: string;
  to: string;
  /** 간선을 만든 표지 표층형. 인접·접힘으로 이어졌으면 null */
  surface: string | null;
  /** '접힘' = 판단기준에 걸려 판정되는 노드가 그 판단기준으로 보내는 간선 (Q→B)
   *  '결과' = 조건(apply.foldResult)의 결과로 묶인 B 노드가 그 조건 노드로 보내는 간선
   *  '빈칸' = 제시문(apply.passageBlocks)과 보기(apply.statementBlocks) B 노드가 발문의 빈칸 노드로 보내는 간선
   *  '보기' = 보기(apply.statementBlocks) B 노드가 발문의 하나뿐인 B 노드로 보내는 간선 */
  kind: 'adjacent' | '연결어' | '부사' | '접힘' | '결과' | '빈칸' | '보기';
  index: number;
  /** 약속된 길(apply.definedPaths, 예: 「→」)이면 그 간선이 켠 등. 조합에 들어간다. 그 밖의 간선에는 없다 */
  color?: Color | null;
}

/** 걸렸으나 자리를 정할 수 없는 표지 — 색이나 종류가 미결이다 */
export interface UndecidedHit {
  surface: string;
  switchId: string;
  index: number;
  reason: 'color' | 'kind';
}

export interface PathGraph {
  question: string;
  nodes: PathNode[];
  edges: PathEdge[];
  /** 켜진 색들 (문장 순서. D는 켜질 때마다, 나머지 색은 처음 한 번만). 7형식은 이 조합에 붙는 이름일 뿐이다 */
  combination: Color[];
  undecided: UndecidedHit[];
}

/** 조합에 붙는 라벨. 이름이 없어도 조합은 유효하다 */
export interface FormCombination {
  /** 봉인 파일 forms[]에 같은 조합이 있으면 그 id. 없으면 null */
  id: string | null;
  name: string | null;
  /** 관측된 색 — **입력을 하나도 버리지 않는다** */
  colors: Color[];
  /** 봉인 파일에 이름이 있는 조합인가 */
  known: boolean;
}

// ─────────────────────────────────────────────────────────────
// 표지 스캔
// ─────────────────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 호환 자모 → 받침 순번 (유니코드 한글 음절 = 0xAC00 + (초성·21 + 중성)·28 + 받침) */
const FINALS = 'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

/** 받침이 이 자모인 한글 음절 전부 (받침이 될 수 없는 자모면 던진다 — 표지를 조용히 버리지 않는다) */
function syllablesWithFinal(jamo: string): string {
  const jong = FINALS.indexOf(jamo) + 1;
  if (!jong) throw new SealedError(`받침이 될 수 없는 자모입니다: "${jamo}"`);
  let out = '';
  for (let cv = 0; cv < 19 * 21; cv++) out += String.fromCharCode(0xac00 + cv * 28 + jong);
  return out;
}

/**
 * 표지 표층형 → 정규식.
 * '~'는 "여기에 실체가 온다"는 자리표시다 — 앞의 '~'는 조건 없음, 가운데 '~'는 사이에 실체가 낀다.
 * 가운데 '~'는 캡처한다 — 사이에 낀 실체가 곧 그 노드의 entity다.
 * 예: "~가 되도록" → /가\s*되도록/ · "모든 ~에 대하여" → /모든\s*([\s\S]*?)에\s*대하여/
 *
 * 받침 자모 [오종래 2026-10-03] — 자모 바로 뒤에 한글 음절이 오면 그 자모는 «그 받침을 가진 음절 하나»다
 * (예: "~ㄴ지" → 「어떤지」의 「떤지」, "~ㄹ지" → 「할지」). 뒤가 음절이 아닌 자모(보기 머리 「ㄱ.」)는 글자 그대로다.
 */
export function markerRegex(surface: string): RegExp {
  const parts = surface
    .split('~')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      escape(p)
        .replace(/\s+/g, '\\s*')
        .replace(/[ㄱ-ㅎ](?=[가-힣])/g, (j) => `[${syllablesWithFinal(j)}]`),
    );
  if (!parts.length) throw new SealedError(`표지가 비어 있습니다: "${surface}"`);
  return new RegExp(parts.join('\\s*([\\s\\S]*?)\\s*'));
}

interface Candidate {
  surface: string;
  sw: SealedSwitch;
  re: RegExp;
}

/** 봉인 파일의 표지를 전부 모은다. 순서는 `apply`가 정한다 — 코드가 정하지 않는다 */
function candidates(table: SealedTable): Candidate[] {
  const all: Candidate[] = [];
  for (const sw of table.switches) {
    for (const surface of sw.markers) all.push({ surface, sw, re: markerRegex(surface) });
  }
  if (table.apply.longestMatchFirst === null) {
    throw new SealedError(
      '적용 규칙이 미정입니다: apply.longestMatchFirst\n' +
        '봉인 파일에서 정해야 합니다 — 짧은 표지가 긴 표지를 먼저 먹으면 "~가"가 "~가 되도록"을 삼킵니다.',
    );
  }
  if (table.apply.longestMatchFirst !== true) {
    throw new SealedError(
      '최장 일치가 아닌 적용 방식은 아직 명세가 없습니다 (apply.longestMatchFirst=false).',
    );
  }
  return all.sort((a, b) => b.surface.length - a.surface.length);
}

/**
 * 문장 머리 접속사 [오종래 2026-10-07] — apply.conjunctionClauses(예: 「그리고」「또한」)의 낱말이 문장 머리(글 처음·문장 끝 뒤·문단 경계 뒤)에
 * 어절로 홀로 서면 그 자리. `end`는 뒤 쉼표·공백까지 — 뒤 절은 거기서 시작한다. 색도 노드도 없다.
 */
export function conjunctionHeads(question: string, table: SealedTable): { at: number; end: number }[] {
  const out: { at: number; end: number }[] = [];
  for (const w of table.apply.conjunctionClauses ?? []) {
    const re = new RegExp(`(?<=^|[.?!。]\\s+|\\n\\s*)${escape(w)}(?=[\\s,]|$)[\\s,]*`, 'g');
    for (const m of question.matchAll(re)) out.push({ at: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 어휘형 표지인가 — 봉인 파일의 `lexical`이 정한다 (스위치 전부 또는 적힌 표지만) */
function isLexical(sw: SealedSwitch, marker: string): boolean {
  return sw.lexical === true || (Array.isArray(sw.lexical) && sw.lexical.includes(marker));
}

/** 노드가 되는 표지의 종류 — 나머지(연결어·부사)는 간선이 된다 */
const NODE_KIND = '조사·어미' satisfies SwitchKind;

/** 발문 끝 — 첫 소문항 머리 (문단 머리의 (1) · 1) · ①). 발문 P 고정이 쓴다 */
const STEM_END = /(?<=^|\n)[ \t]*(?:\(\d+\)|\d+\)|[①-⑳])/;
/** 실체 머리에 붙은 소문항 머리 — 발문 P 고정의 비교에서만 뗀다 */
const SUB_HEAD_PREFIX = /^(?:\(\d+\)|\d+\)|[①-⑳])\s*/;

/**
 * 표지로 문장을 훑어 경로 그래프를 만든다.
 *
 * 뼈대 한계 (의도적):
 *   - 실체(entity)는 어휘형 표지(`lexical`)면 표지 자신, 아니면 표지 가운데 '~'가 붙잡은 글자,
 *     그것도 없으면 "앞 표지 끝 ~ 이 표지 시작"의 글자 그대로다. 실체를 해석하지 않는다.
 *   - 간선은 인접 노드를 잇는 데까지다. 관계의 성격(순접·역접·병렬)은 원전 명세가 서면 붙인다.
 */
export function build_path_graph(question: string, table: SealedTable): PathGraph {
  const cands = candidates(table);
  /** chained = 어절 안이지만 조사 연쇄로 걸린 표지 (예: 「것만을」의 「만」) */
  /** passage = 제시문 블록이면 발문 빈칸 표지가 걸린 자리 · caseHead = 케이스 머리 문단(P 머리) */
  /** quote = 인용 명제(apply.quotedPropositions)·대괄호 묶음(apply.bracketLabels)·따옴표 이름(apply.quotedNames) · proviso = 단서절(apply.provisoClauses) */
  /** designated = 제시문 지정(apply.designatedPassages) — 실체는 기호(범위) */
  let hits: { at: number; end: number; c: Candidate; inner: string; chained: boolean; passage?: number; caseHead?: true; math?: true; quote?: true; proviso?: true; designated?: true }[] = [];
  /** 문장 종결 표지가 걸린 자리 (apply.sentenceEnds) — 노드·간선이 아니라 절 경계다 */
  const sentenceBreaks: { at: number; end: number }[] = [];

  // 어절 끝 조건 [오종래 2026-09-30] — apply.endOfWord면 조사·어미 표지(어휘형 제외)는
  //   바로 뒤가 한글·영문·숫자·여는 괄호가 아닐 때만 건다. 조사는 어절 끝에 붙기 때문이다.
  //   조사 연쇄 [오종래 2026-09-30] — 바로 뒤가 등록된 조사·어미 표지(어휘형 제외)로 이어지면 어절 끝으로 본다
  //   (예: 「것만을」의 첫 조사 뒤에 둘째 조사가 붙는 경우).
  //   [오종래 2026-10-01] 연쇄를 여는 표지는 봉인 파일의 apply.chainHeads 스위치로 한정한다 —
  //   아무 표지나 열면 「사과를」의 「과」가 「를」과 연쇄로 오인되어 노드가 선다.
  const endOfWord = table.apply.endOfWord === true;
  const insideWord = (next: string | undefined) => next !== undefined && /[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9([{<]/.test(next);
  const nodeCands = cands.filter((c) => c.sw.kind === NODE_KIND && !isLexical(c.sw, c.surface));
  const chainHeads = table.apply.chainHeads ?? [];
  const chainsToMarker = (head: SealedSwitch, after: string) =>
    chainHeads.includes(head.id) && nodeCands.some((c) => after.match(c.re)?.index === 0);

  // 체언 뒤에서만 [오종래 2026-09-30] — apply.afterNounOnly 스위치는 앞 음절이 체언일 때만 건다.
  //   앞 음절이 봉인 파일의 용언 어간(apply.verbStems, 예: 「하」·「되」)이면 관형형 어미로 보고 걸지 않는다.
  //   [오종래 2026-10-01] 받침 없는 음절을 모두 용언으로 보던 간이 규칙은 폐기 — 「철수는」의 「는」을 놓쳤다.
  const afterNounOnly = table.apply.afterNounOnly ?? [];
  const verbStems = table.apply.verbStems ?? [];
  const verbStemBefore = (ch: string | undefined) => ch !== undefined && verbStems.includes(ch);

  // 수식 뒤에서만 [오종래 2026-10-04] — apply.afterMathOnly 스위치는 바로 앞 어절(사이 공백 허용, 줄바꿈 제외)이
  //   한글 없는 식일 때만 건다 (예: 주격 「이」「가」 — 「{b_n}이」·「(x > 0) 이」 ○, 「이차함수」·「길이가」 ✕).
  const afterMathOnly = table.apply.afterMathOnly ?? [];
  const afterMath = (at: number) => {
    const word = question.slice(0, at).match(/(\S+)[ \t]*$/)?.[1];
    return word !== undefined && !/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(word);
  };
  //   관형절 꾸밈 명사 [오종래 2026-10-07] — 주격 「이」는 수식 뒤가 아니어도, 앞 어절이 2음절 이상 관형형(「~한」「~된」「~진」「~던」:
  //   「시행한」「주어진」)이고 붙은 명사가 두 음절 이상이면 건다 — 관형절이 꾸민 명사구가 B다
  //   (경제 2-2 「D국이 시행한 정책이 자국의」 → B「D국이 시행한 정책」). 받침 ㄴ 전부로 넓히면 명사(「동전 앞면이」)·
  //   관형사(「어떤 도움이」)·주제 조사(「동전은 뒷면이」)에도 걸린다. 한 음절 명사(「높이」「길이」「차이」)는 걸지 않는다.
  const afterModifiedNoun = (at: number) => {
    const noun = question.slice(0, at).match(/(\S*)$/)![1];
    const prev = question.slice(0, at - noun.length).match(/(\S+)[ \t]+$/)?.[1];
    return /^[가-힣]{2,}$/.test(noun) && prev !== undefined && /[가-힣][한된진던]$/.test(prev);
  };

  // 문장 종결 [오종래 2026-10-04] — apply.sentenceEnds(예: 「이다.」「만족시킨다.」「~하다.」)가 걸리면 절 경계다.
  //   다른 표지보다 먼저 본다 — 종결 표지 안의 글자(「이다」의 「이」)를 조사로 걸지 않는다.
  const sentenceEnds = (table.apply.sentenceEnds ?? []).map(markerRegex);
  // 목적절 경계 [오종래 2026-10-06] — apply.purposeClauses(예: 「~기 위해」·「~함으로써」)가 걸리면 절 경계다.
  //   스위치 표지가 같은 자리에서 걸리지 않을 때만 본다. 경계 뒤 쉼표·공백까지 넘긴다 — 뒤 실체 머리에 「, 」가 붙지 않게.
  const purposeClauses = (table.apply.purposeClauses ?? []).map(markerRegex);

  // 서술 블록 [오종래 2026-10-01] — 봉인 파일이 지정한 스위치(apply.statementBlocks, 예: 보기 머리 「ㄱ.」)의 표지가
  //   어절로 홀로 서면, 그 뒤 서술 전체(다음 머리·문단 경계·끝 앞까지)를 노드 하나의 실체로 잡는다.
  //   서술 안의 표지는 따로 걸지 않는다 — 보기 하나가 B 객체 하나다 (예: 생명과학_문_1 보기 ㄱ·ㄴ·ㄷ).
  //   [오종래 2026-10-02] 노드 색은 머리 스위치의 색이다 — 케이스별 상황 설정 머리(P)면 케이스 하나가 독립 P 하나다
  //   (예: 법_문_9 사례 조각 ○A·○B·○C, 지리_문_4 〈조건〉 ○ 3개).
  const blockIds = table.apply.statementBlocks ?? [];
  const blockEnd = (sw: SealedSwitch, from: number) => {
    const heads = sw.markers.map((m) => escape(m.trim())).join('|');
    const re = new RegExp(`\\n|\\s(?:${heads})(?=\\s|$)`, 'g');
    re.lastIndex = from;
    return re.exec(question)?.index ?? question.length;
  };

  // 발화 구분 [오종래 2026-10-02] — 단락 경계 기호(apply.paragraphBreaks) 가운데 어느 스위치의 표지도 아닌 것(예: 토론 화자 「갑:」·「을:」)은
  //   어절 머리에 홀로 서면 표지로 걸지 않고 건너뛴다 — 「을:」의 「을」이 목적격 조사로 걸리지 않게 (예: 생윤_문_2).
  //   실체는 아래 단락 경계 규칙이 경계 뒤에서부터 잡는다.
  // 수식 묶기 [오종래 2026-10-02] — 봉인 파일이 지정한 어휘형 스위치(apply.mathExpressions, 예: 「직선」「삼각형」「△」「선분」「√」「∫」「lim」)의
  //   표지 뒤에 이어지는 식 전체(첫 한글·문단 경계·문장 끝 앞까지, 끝 공백·쉼표 제외)를 표지와 함께 B 노드 하나로 잡는다
  //   (예: 「직선 y = 2x + 1과」 → 「직선 y = 2x + 1」, 「lim_{x→0} f(x)/x의」 → 식 안의 「→」는 따로 걸지 않는다).
  //   영문 표지(「lim」)는 앞에 영문 글자가 붙으면 다른 낱말 안이라 걸지 않는다.
  const mathIds = table.apply.mathExpressions ?? [];
  // 제시문 지정 [오종래 2026-10-07] — apply.designatedPassages(예: 「제시문」)의 표지 바로 뒤에 괄호 기호 「(마)」 또는
  //   범위 「(나)~(라)」가 오면 표지+기호가 노드 하나, 실체는 기호(범위 전체)다. 기호가 없으면 걸지 않는다.
  //   단독 기호(「(가)」 보기 기호)는 여기 들지 않는다 — 제 스위치 그대로다.
  //   [오종래 2026-10-07] 기호 나열도 전부 — 괄호+한글/숫자 기호가 쉼표·가운뎃점·물결로 이어지면 「(가), (다), (라)」
  //   「(가)·(나)·(다)」「(가)~(라)」 전체가 P 노드 하나다 (사회 논제3-2).
  const designatedIds = table.apply.designatedPassages ?? [];
  const PASSAGE_LABEL = /^\s*(\([가-힣0-9]+\)(?:\s*[,·ㆍ・~∼～-]\s*\([가-힣0-9]+\))*)/;
  //   원문자 기호(㉠~㉻, 나열 포함) + 뒤에 붙은 조사. m[1] = 기호 (아래 원문자 기호 묶음)
  const CIRCLED_LABEL = /(?<=^|[\s(])([㉠-㉻](?:\s*[,·ㆍ・~∼～-]\s*[㉠-㉻])*)[가-힣]*/g;
  //   식 끝의 공백·쉼표는 소비한다(end) — 다음 노드의 실체로 넘어가지 않는다. 실체(text)에서는 뗀다.
  const mathEnd = (from: number) => {
    const tail = question.slice(from).match(/^[^가-힣ㄱ-ㅎㅏ-ㅣ\n]*/)![0];
    const stop = tail.search(/[.?!。](?=\s|$)|[?？]/);
    const expr = stop === -1 ? tail : tail.slice(0, stop);
    return { end: from + expr.length, text: from + expr.replace(/[\s,]+$/, '').length };
  };

  // 어절 예외 [오종래 2026-10-03] — 봉인 파일의 apply.wordExceptions(예: 「불구하고」·「그럼에도」)와 어절 전체가 같으면
  //   그 어절 안에서는 조사·어미 표지를 걸지 않는다 (「불구하고」의 「구하고」 → Q ✕, 「그럼에도」의 「도」 → P ✕).
  //   어절 = 공백으로 끊긴 덩어리에서 앞뒤 문장 부호를 뗀 것. 간선 표지(연결어·부사)는 그대로 건다.
  //   [오종래 2026-10-06] 예외 낱말 뒤에 등록된 조사·어미 표지 하나만 붙은 어절(「표본의」「표본과」)도 예외 낱말 부분은 걸지 않는다.
  //   붙은 조사는 그대로 건다. 어절 전체가 같은 예외(「결과로」 등)가 먼저다 (서술형2차 수학9 「표본」의 「표」 → LS-20 P ✕).
  const wordExceptions = new Set(table.apply.wordExceptions ?? []);
  const exceptionSpans: { start: number; end: number }[] = [];
  const josaOnly = (tail: string) =>
    cands.some((c) => c.sw.kind === NODE_KIND && !isLexical(c.sw, c.surface) && tail.match(c.re)?.[0] === tail);
  if (wordExceptions.size) {
    for (const w of question.matchAll(/\S+/g)) {
      const [, lead, core] = w[0].match(/^([^가-힣A-Za-z0-9]*)(.*?)[^가-힣A-Za-z0-9]*$/)!;
      const word = wordExceptions.has(core)
        ? core
        : [...wordExceptions].find((x) => core.length > x.length && core.startsWith(x) && josaOnly(core.slice(x.length)));
      if (!word) continue;
      const start = w.index + lead.length;
      exceptionSpans.push({ start, end: start + word.length });
    }
  }
  const inException = (at: number) => exceptionSpans.some((s) => at >= s.start && at < s.end);

  const registered = new Set(table.switches.flatMap((s) => s.markers.map((m) => m.trim())));
  const speakerBreaks = (table.apply.paragraphBreaks ?? []).filter((m) => !registered.has(m.trim()));

  for (let i = 0; i < question.length; ) {
    const rest = question.slice(i);
    const speaker = (i === 0 || /\s/.test(question[i - 1])) && speakerBreaks.find((m) => rest.startsWith(m) && (rest.length === m.length || /\s/.test(rest[m.length])));
    if (speaker) {
      i += speaker.length;
      continue;
    }
    const ending = sentenceEnds.map((re) => rest.match(re)).find((m) => m?.index === 0);
    if (ending) {
      sentenceBreaks.push({ at: i, end: i + ending[0].length });
      i += ending[0].length;
      continue;
    }
    let matched: { len: number; c: Candidate; inner: string; chained: boolean; math?: true; designated?: true } | undefined;
    for (const c of cands) {
      const m = rest.match(c.re);
      if (m && m.index === 0) {
        if (c.sw.kind === NODE_KIND && inException(i)) continue; // 어절 예외 — 낱말 안의 조사·어미가 아니다
        const inside =
          endOfWord && c.sw.kind === NODE_KIND && !isLexical(c.sw, c.surface) && insideWord(rest[m[0].length]);
        if (inside && !chainsToMarker(c.sw, rest.slice(m[0].length))) {
          continue; // 어절 안 — 더 짧은 표지를 마저 본다
        }
        if (afterNounOnly.includes(c.sw.id) && verbStemBefore(question[i - 1])) {
          continue; // 앞이 용언 어간 — 관형형 어미로 본다
        }
        if (afterMathOnly.includes(c.sw.id) && !afterMath(i) && !(c.surface.replace(/^~/, '').trim() === '이' && afterModifiedNoun(i))) {
          continue; // 바로 앞이 수식이 아니다
        }
        // 단독 어절 [오종래 2026-10-01] — 스위치의 standalone이면 앞에 한글 글자가 붙지 않을 때만 건다
        //   (「대표단」·「지표」의 「표」 ✕, 「표는」·「표가」·「표를」 ○). 뒤 조건은 두지 않는다.
        if (c.sw.standalone && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(question[i - 1] ?? '')) {
          continue; // 앞에 한글이 붙었다 — 다른 낱말 안
        }
        if (blockIds.includes(c.sw.id)) {
          if (i > 0 && !/\s/.test(question[i - 1])) continue; // 어절 머리가 아니다
          const from = i + m[0].length;
          const end = blockEnd(c.sw, from);
          matched = { len: end - i, c, inner: question.slice(from, end).trim(), chained: false };
          break;
        }
        if (designatedIds.includes(c.sw.id)) {
          const label = rest.slice(m[0].length).match(PASSAGE_LABEL);
          if (!label) continue; // 뒤에 기호가 없다 — 제시문 지정이 아니다
          matched = { len: m[0].length + label[0].length, c, inner: label[1], chained: false, designated: true };
          break;
        }
        if (mathIds.includes(c.sw.id) && isLexical(c.sw, c.surface)) {
          if (/^[A-Za-z]/.test(c.surface.trim()) && /[A-Za-z]/.test(question[i - 1] ?? '')) continue; // 영문 낱말 안
          //   [오종래 2026-10-07] 괄호 안의 수식 표지(「점 (a/√3−9)」의 「√」)는 걸지 않는다 — 괄호 앞에서 잘리지 않고
          //   뒤 조사 노드가 「점 (a/√3−9)」 전체를 실체로 끌고 나온다 (논제4-iii). 같은 어절에서 닫히지 않은 「(」 뒤면 괄호 안이다.
          const word = question.slice(0, i).match(/\S*$/)![0];
          if (word.split('(').length > word.split(')').length) continue;
          const { end, text } = mathEnd(i + m[0].length);
          matched = { len: end - i, c, inner: question.slice(i, text), chained: false, math: true };
          break;
        }
        // 가운데 '~'가 붙잡은 실체 (여럿이면 이어 붙인다)
        const inner = m.slice(1).map((s) => s.trim()).filter(Boolean).join(' ');
        matched = { len: m[0].length, c, inner, chained: inside };
        break; // 최장 일치 — cands가 이미 긴 것부터다
      }
    }
    if (matched) {
      hits.push({ at: i, end: i + matched.len, c: matched.c, inner: matched.inner, chained: matched.chained, math: matched.math, designated: matched.designated });
      i += matched.len;
    } else {
      //   어절 끝에서만 — 「위해서」처럼 뒤에 글자가 이어지면 끊지 않는다
      const purpose = purposeClauses.map((re) => rest.match(re)).find((m) => m?.index === 0 && !insideWord(rest[m[0].length]));
      if (purpose) {
        const end = i + purpose[0].length + rest.slice(purpose[0].length).match(/^[\s,]*/)![0].length;
        sentenceBreaks.push({ at: i, end });
        i = end;
        continue;
      }
      i += 1;
    }
  }
  // 접속사 절 경계 [오종래 2026-10-07] — 문장 머리 접속사(apply.conjunctionClauses)는 절 경계다 — 뒤 실체 머리에 붙지 않는다
  sentenceBreaks.push(...conjunctionHeads(question, table));
  sentenceBreaks.sort((a, b) => a.at - b.at);

  // 인용 명제 [오종래 2026-10-06] — apply.quotedPropositions: 따옴표 안이 「…다.」로 끝나는 명제면 인용 전체가 노드 하나다.
  //   안의 표지는 따로 걸지 않는다 — 명제가 잘게 잘려 Q 직전 B가 조각으로 서지 않게 (서술형2차 수학6).
  //   여는 따옴표는 어절 머리(앞이 공백·문두·여는 괄호)에서만 본다 — 「f'(x)」의 프라임은 인용이 아니다.
  const quoteId = table.apply.quotedPropositions?.[0];
  const quoteC = quoteId ? cands.find((c) => c.sw.id === quoteId) : undefined;
  if (quoteC) {
    for (const m of question.matchAll(/(?<=^|[\s(])(['"‘“])([^'"‘’“”\n]*?다\.)(['"’”])/g)) {
      const start = m.index;
      const end = start + m[0].length;
      hits = hits.filter((h) => h.end <= start || h.at >= end);
      hits.push({ at: start, end, c: quoteC, inner: m[0], chained: false, quote: true });
    }
    hits.sort((a, b) => a.at - b.at);
  }

  // 대괄호 묶음 [오종래 2026-10-07] — apply.bracketLabels: 대괄호 안이 한글 낱말로 시작하면(「[그림 1]」「[표 2]」)
  //   대괄호+내용 전체가 노드 하나다. 안의 표지는 따로 걸지 않는다 — 「[그림 1]」이 「그림」·「1]」로 갈라지지 않게 (논제1-2).
  //   한글로 시작하지 않는 대괄호(구간 「[0, 2]」, 빈칸 「[イ]」)는 그대로다.
  // 따옴표 이름 [오종래 2026-10-07] — apply.quotedNames: 작은따옴표 안이 한글·영문 낱말뿐이면(「'장인'」「'마빈 해리스'」「'나'」)
  //   따옴표+내용 전체가 노드 하나다. 안의 조사·어미(「장인」의 「인」)를 표지로 걸지 않는다 (논제2-2).
  //   여는 따옴표는 어절 머리(앞이 공백·문두·여는 괄호)에서만 본다 — 「f'(x)」의 프라임은 인용이 아니다.
  const groupings: [string[] | null | undefined, RegExp][] = [
    [table.apply.bracketLabels, /\[[가-힣][^[\]\n]*\]/g],
    //   [오종래 2026-10-07] 꺾쇠도 같은 규칙 — 「<표 1>」「<가>」「<제시문3>」 꺾쇠+내용 전체가 P 노드 하나다.
    //   부등호(「0<x<1」)와 섞이지 않게 꺾쇠 안은 한글로 시작하고 20자 이내다.
    [table.apply.bracketLabels, /<[가-힣][^<>\n]{0,19}>/g],
    [table.apply.quotedNames, /(?<=^|[\s(])(['‘])[가-힣A-Za-z][가-힣A-Za-z ]*['’]/g],
    // 원문자 기호 [오종래 2026-10-07] — apply.circledLabels: 어절 머리의 원문자(「㉠」「㉤」, 「㉠~㉢」「㉠, ㉡」 나열 포함)와
    //   뒤에 붙은 조사가 B 노드 하나다. 실체는 기호뿐 — 앞말 「에 기술된」을 끌지 않고(갭10), 「㉠과」가 와/과 P로 서지 않는다 (논제1-1·5).
    [table.apply.circledLabels, CIRCLED_LABEL],
  ];
  //   [오종래 2026-10-07] 따옴표 이름의 실체는 따옴표를 뗀 이름이다 (「'뉴질랜드 정부'」 → B「뉴질랜드 정부」).
  const quotedNameIds = table.apply.quotedNames ?? [];
  const entityHeads: number[] = [];
  for (const [ids, re] of groupings) {
    const groupC = ids?.[0] ? cands.find((c) => c.sw.id === ids[0]) : undefined;
    if (!groupC) continue;
    for (const m of question.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (hits.some((h) => h.at < start && start < h.end)) continue; // 앞에서 시작한 묶음(인용 명제·보기 블록) 안이다
      hits = hits.filter((h) => h.end <= start || h.at >= end);
      //   [오종래 2026-10-07] 「㉠에 대한 ~」은 기호에서 끊지 않는다 — 기호 어절 안의 표지만 지우고 노드는 세우지 않아,
      //   뒤 B 노드가 「㉠에 대한 관점」 전체를 실체로 끌고 나온다 (「대한 관점」 조각 급소 방지).
      //   실체는 기호에서 시작한다 (entityHeads) — 「에 기술된 ㉤에 대한 설명」 → 「㉤에 대한 설명」.
      if (ids === table.apply.circledLabels && /에$/.test(m[0]) && /^\s+대한\s/.test(question.slice(end))) {
        entityHeads.push(start);
        continue;
      }
      const inner = ids === table.apply.quotedNames ? m[0].slice(1, -1) : ids === table.apply.circledLabels ? m[1] : m[0];
      hits.push({ at: start, end, c: groupC, inner, chained: false, quote: true });
    }
    hits.sort((a, b) => a.at - b.at);
  }

  // 단서절 [오종래 2026-10-06] — apply.provisoClauses: 이 스위치의 표지(「단,」)가 어절 머리(앞이 공백·문두·여는 괄호)에 서면
  //   그 뒤 문장 끝까지가 D 노드 하나다. 안의 표지는 걸지 않는다 — 단서의 Q·B·C가 급소 산정에 들지 않게
  //   (국어·과학 논제5 「단, 화학 반응식에 각 물질의 상태도 표시하시오.」). 어절 머리가 아니면(「판단,」) 걸지 않는다.
  //   문장 끝 = 뒤에 공백·닫는 괄호·끝이 오는 「.」「?」「!」, 또는 줄바꿈. 「(단, …)」면 짝이 맞는 닫는 괄호까지.
  const provisoIds = table.apply.provisoClauses ?? [];
  if (provisoIds.length) {
    for (const h of hits.filter((x) => provisoIds.includes(x.c.sw.id))) {
      if (!hits.includes(h)) continue; // 앞 단서절에 먹혔다
      if (h.at > 0 && !/[\s(]/.test(question[h.at - 1])) {
        hits = hits.filter((x) => x !== h);
        continue;
      }
      //   괄호 단서 [오종래 2026-10-06] — 「(단, …)」는 짝이 맞는 닫는 괄호까지가 절 전체다 (안의 괄호 「P(|Z|≤1.96)」는 건너뜀,
      //   마침표 없는 「(단, AB < AC)」도). 닫는 괄호가 없으면 문장 끝 규칙.
      let close = -1;
      if (question[h.at - 1] === '(') {
        for (let k = h.end, depth = 1; k < question.length; k++) {
          if (question[k] === '(') depth++;
          else if (question[k] === ')' && --depth === 0) {
            close = k;
            break;
          }
        }
      }
      let end: number;
      if (close >= 0) {
        h.inner = question.slice(h.at, close).trim();
        end = close + 1;
      } else {
        const m = /[.?!](?=[\s)]|$)|\n/.exec(question.slice(h.end));
        end = m ? h.end + m.index + (m[0] === '\n' ? 0 : 1) : question.length;
        h.inner = question.slice(h.at, end).trim();
      }
      hits = hits.filter((x) => x === h || x.end <= h.at || x.at >= end);
      h.end = end;
      h.proviso = true;
    }
    // 말미 괄호 [오종래 2026-10-07] — 문장 말미에 괄호로 묶인 부연·조건·예시도 단서절과 같은 D 노드 하나다.
    //   안의 표지는 걸지 않는다 — 괄호 안 B·Q가 급소로 걸리지 않게 (「…구하시오. (예를 들어, …이다.)」,
    //   「…비교하시오(대물림 비율은 … 표시하시오).」). 말미 = 여는 괄호 앞이 문장 끝(「.」「?」「!」)이거나 종결 어미
    //   「~시오」「~하라」「~다」, 짝이 맞는 닫는 괄호 뒤가 문장 끝(「.」「?」「!」·공백·끝). 안에 한글이 없으면(「(10^100)」),
  //   「(표:」「(상자:」「(제시문:」으로 시작하면 묶지 않는다.
    const provisoC = cands.find((c) => provisoIds.includes(c.sw.id));
    if (provisoC) {
      for (let open = question.indexOf('('); open >= 0; open = question.indexOf('(', open + 1)) {
        if (!/(?:[.?!]|시오|하라|다)\s*$/.test(question.slice(0, open))) continue;
        if (hits.some((x) => x.proviso && x.at <= open && open < x.end)) continue; // 「(단, …)」 — 위에서 묶었다
        let close = -1;
        for (let k = open + 1, depth = 1; k < question.length; k++) {
          if (question[k] === '(') depth++;
          else if (question[k] === ')' && --depth === 0) {
            close = k;
            break;
          }
        }
        if (close < 0 || !/^[.?!]?(?:\s|$)/.test(question.slice(close + 1))) continue;
        const inner = question.slice(open + 1, close).trim();
        if (!/[가-힣]/.test(inner)) continue;
        if (/^(?:표|상자|제시문)\s*:/.test(inner)) continue; // 정답지 정리자 요약 괄호 [오종래 2026-10-07] — 문항 원문이 아니다
        const end = close + 1;
        hits = hits.filter((x) => x.end <= open || x.at >= end);
        hits.push({ at: open, end, c: provisoC, inner, chained: false, proviso: true });
        open = close;
      }
      hits.sort((a, b) => a.at - b.at);
    }
  }

  // 제시문 블록 [오종래 2026-10-02] — 봉인 파일이 지정한 스위치(apply.passageBlocks, 예: 빈칸 기호 「(가)」)의 표지가
  //   Q가 선 문단(발문)에 있고 같은 표지가 다른 문단에도 나오면, 그 문단 전체가 빈칸의 실체를 알려 주는 B 하나다
  //   (예: 한국사_문_9 「(가)에 대한 설명으로 옳은 것은?」 + 헤이그 특사 호소문). 문단 안의 표지는 따로 걸지 않는다.
  //   서술 블록(apply.statementBlocks) 머리로 시작하는 문단(보기)은 제시문이 아니다.
  const passageIds = table.apply.passageBlocks ?? [];
  if (passageIds.length) {
    const paras: { start: number; end: number }[] = [];
    for (let s = 0; s <= question.length; ) {
      const e = question.indexOf('\n', s);
      paras.push({ start: s, end: e === -1 ? question.length : e });
      if (e === -1) break;
      s = e + 1;
    }
    const inPara = (p: { start: number; end: number }) => hits.filter((h) => h.at >= p.start && h.at < p.end);
    const qParas = paras.filter((p) => inPara(p).some((h) => h.c.sw.color === 'Q'));
    const labels = qParas.flatMap((p) =>
      inPara(p)
        .filter((h) => passageIds.includes(h.c.sw.id))
        .map((h) => ({ text: question.slice(h.at, h.end), c: h.c, at: h.at })),
    );
    for (const p of paras) {
      if (qParas.includes(p)) continue;
      const body = question.slice(p.start, p.end);
      const label = labels.find((l) => body.includes(l.text));
      const first = inPara(p)[0];
      if (!label || (first && first.at === p.start && blockIds.includes(first.c.sw.id))) continue;
      hits = hits.filter((h) => h.at < p.start || h.at >= p.end);
      hits.push({ at: p.start, end: p.end, c: label.c, inner: body.trim(), chained: false, passage: label.at });
    }
    hits.sort((a, b) => a.at - b.at);
  }

  // 참조 제시문 [오종래 2026-10-05] — 발문(Q가 선 문단)에 「다음 글」「다음 제시문」「다음 자료」(apply.referencedPassages)가 있으면
  //   발문 바로 뒤 문단들을 P 하나로 묶는다 — <…> 머리 줄(「<조 건>」)·Q 문단·서술 블록 머리 앞까지 (예: 윤리서술형 13 「만약 우리가 … 소멸할 것이다.」).
  //   문단 안의 표지는 따로 걸지 않는다. 닻 표지 자신은 노드가 되지 않는다 — 발문은 그대로다.
  //   상자 블록 [오종래 2026-10-06] — 입력 규약: 상자(대화·학생 설명·명제 등)는 앞뒤 빈 줄로 떼어 넣는다.
  //   닻 표지가 없어도 발문 바로 뒤의 Q 없는 문단들을 같은 범위 규칙으로 P 하나로 묶는다 (apply.boxPassages = P를 켤 스위치).
  //   이미 제시문으로 묶인 문단 앞에서 멈춘다 (예: 서술형2차 수학4 학생 설명 · 수학5 명제 · 수학7 민권·은재 대화).
  const refIds = table.apply.referencedPassages ?? [];
  const boxId = table.apply.boxPassages?.[0];
  const boxC = boxId ? cands.find((c) => c.sw.id === boxId) : undefined;
  if (refIds.length || boxC) {
    const lines: { start: number; end: number }[] = [];
    for (let s = 0; s <= question.length; ) {
      const e = question.indexOf('\n', s);
      lines.push({ start: s, end: e === -1 ? question.length : e });
      if (e === -1) break;
      s = e + 1;
    }
    const own = (p: { start: number; end: number }) => hits.filter((h) => h.at >= p.start && h.at < p.end);
    const isQPara = (p: { start: number; end: number }) => own(p).some((h) => h.c.sw.color === 'Q');
    for (const [k, p] of lines.entries()) {
      const ref = own(p).find((h) => refIds.includes(h.c.sw.id));
      const anchor = ref ?? (boxC && { c: boxC });
      if (!anchor || !isQPara(p)) continue;
      //   상자 블록에서는 연결형 Q(「~고」)만 선 문단을 물음 문단으로 보지 않는다 — 대화 속 「기울기를 구하고」는 물음이 아니다 (서술형2차 수학7)
      //   [오종래 2026-10-06] 줄머리 「▶」 상자(학생 주장 목록)는 묶지 않는다 — 각 주장이 독립 B다 (서술형2차 수학4)
      const stopsAt = ref ? isQPara : (l: { start: number; end: number }) =>
        question.slice(l.start, l.end).trim().startsWith('▶')
        || own(l).some((h) => h.c.sw.color === 'Q' && !question.slice(h.at, h.end).trim().endsWith('고'));
      //   닻 표지 자신이 한 줄로 선 머리(「<보기>」)면 그 줄은 건너뛰고 그 뒤부터 묶는다 (예: 국어서술형 11 「<보기>는 … 일부이다」 + 「<보기>」 줄)
      const anchors = new Set(anchor.c.sw.markers.map((m) => m.trim()));
      let open = k + 1;
      while (open < lines.length && anchors.has(question.slice(lines[open].start, lines[open].end).trim())) open++;
      let last = open - 1;
      for (let j = open; j < lines.length; j++) {
        const body = question.slice(lines[j].start, lines[j].end).trim();
        const first = own(lines[j])[0];
        if (!body || body.startsWith('<') || stopsAt(lines[j]) || own(lines[j]).some((h) => h.passage !== undefined || h.caseHead)
          || (first?.at === lines[j].start && blockIds.includes(first.c.sw.id))) break;
        last = j;
      }
      if (last < open) continue;
      const start = lines[open].start;
      const end = lines[last].end;
      hits = hits.filter((h) => h.at < lines[k + 1].start || h.at >= end);
      hits.push({ at: start, end, c: anchor.c, inner: question.slice(start, end).trim(), chained: false, caseHead: true });
    }
    hits = hits.filter((h) => !refIds.includes(h.c.sw.id) || h.caseHead);
    hits.sort((a, b) => a.at - b.at);
  }

  // P 머리 [오종래 2026-10-02] — 케이스별 상황 설정 머리(apply.statementBlocks 중 색이 P인 스위치, 예: 「○」)로 시작하는 문단 바로 앞 문단은
  //   그 케이스들에 공통인 사례 본문이다 → 문단 전체가 P 하나. 문단 안의 표지는 따로 걸지 않는다
  //   (예: 법_문_9 「A, B, C, D는 … 메시지를 받았다.」 → 뒤 ○A·○B·○C). 머리가 문단 첫머리가 아니면(예: 「<조 건> ○ …」) 열지 않는다.
  const caseHeads = cands.filter((c) => blockIds.includes(c.sw.id) && c.sw.color === 'P');
  if (caseHeads.length) {
    const lines: { start: number; end: number }[] = [];
    for (let s = 0; s <= question.length; ) {
      const e = question.indexOf('\n', s);
      lines.push({ start: s, end: e === -1 ? question.length : e });
      if (e === -1) break;
      s = e + 1;
    }
    for (const [k, p] of lines.entries()) {
      const next = lines[k + 1];
      if (!next) continue;
      const head = hits.find((h) => h.at === next.start && caseHeads.includes(h.c));
      if (!head) continue;
      const body = question.slice(p.start, p.end).trim();
      const own = hits.filter((h) => h.at >= p.start && h.at < p.end);
      if (!body || own.some((h) => h.passage !== undefined || h.c.sw.color === 'Q')) continue; // 제시문·발문은 P 머리가 아니다
      hits = hits.filter((h) => h.at < p.start || h.at >= p.end);
      hits.push({ at: p.start, end: p.end, c: head.c, inner: body, chained: false, caseHead: true });
    }
    hits.sort((a, b) => a.at - b.at);
  }

  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const undecided: UndecidedHit[] = [];
  let cursor = 0;
  let pendingEdge: { surface: string; kind: '연결어' | '부사'; index: number; sw: SealedSwitch } | undefined;
  const recolorIds = table.apply.recolorTargets ?? [];
  const recolorPrevIds = table.apply.recolorPrevious ?? [];
  // 단락 경계 [오종래 2026-10-01] — 봉인 파일의 단락 경계 기호(apply.paragraphBreaks, 예: 보기 머리 「ㄴ.」)가
  //   어절로 홀로 서 있으면, 실체는 마지막 경계 뒤에서부터 잡는다. 경계 앞 글자는 끌고 나오지 않는다.
  const breaks = (table.apply.paragraphBreaks ?? []).map(escape);
  const breakRe = breaks.length ? new RegExp(`(?:^|\\s)(?:${breaks.join('|')})(?=\\s|$)`, 'g') : null;
  // 문단 경계 [오종래 2026-10-01] — 빈 줄(정규화 뒤 줄바꿈 하나, `normalizeV2`)을 넘어서는 실체를 끌고 나오지 않는다.
  // 문장 경계 [오종래 2026-10-02] — 문장 끝(«.»«?»«!» 뒤 공백)도 넘어서지 않는다
  //   (예: 생윤_문_2 「살릴 수 있는 의료 행위입니다. 장기는」 → 「장기」).
  const afterLastBreak = (whole: string) => {
    const para = whole.slice(whole.lastIndexOf('\n') + 1);
    const stops = [...para.matchAll(/[.?!。]\s/g)];
    const text = (stops.length ? para.slice(stops.at(-1)!.index! + 1) : para).trim();
    if (!breakRe) return text;
    const ends = [...text.matchAll(breakRe)];
    return ends.length ? text.slice(ends.at(-1)!.index! + ends.at(-1)![0].length).trim() : text;
  };
  // 연쇄 머리가 넘긴 실체 — 바로 이어 붙은 끝 표지(at)가 받는다
  let carried: { at: number; entity: string } | undefined;
  const pathIds = table.apply.definedPaths ?? [];
  // 명사구 연결 [오종래 2026-10-06] — 봉인 파일의 apply.nounChainMarkers(예: 「의」·「에서의」)로 끝나는 조사·어미 표지는
  //   B 경계가 아니다. 노드를 세우지 않고 cursor도 그대로 둬서, 다음 노드가 「찬성 이유의 문제점」 전체를 끌고 나온다.
  //   수식 노드 바로 뒤의 「의」는 다음 B 노드의 실체를 수식 노드에 이어 붙인다 (「lim_{m→1-} f(m)/g(m)의 값」).
  //   어휘형 표지·블록 노드는 해당하지 않는다.
  const nounChain = (table.apply.nounChainMarkers ?? []).map((m) => m.replace(/^~/, '').trim()).filter(Boolean);
  const chainsNoun = (hit: (typeof hits)[number]) =>
    hit.c.sw.kind === NODE_KIND && !isLexical(hit.c.sw, hit.c.surface) && !hit.math && hit.passage === undefined && !hit.caseHead && !hit.quote
    && nounChain.some((m) => question.slice(0, hit.end).endsWith(m));
  /** 걸린 자리의 색 — 아래 자리 규칙(apply.contextRules)과 같은 조건으로 미리 본다 */
  const colorAfterRules = (k: number) => {
    const h = hits[k];
    const after = question.slice(h.end);
    const then = hits[k + 1];
    const rule = (table.apply.contextRules ?? []).find(
      (r) =>
        r.targets.includes(h.c.sw.id) &&
        (r.when === 'beforeObject'
          ? then !== undefined && then.c.sw.color === 'B'
            && (r.objectMarkers ?? []).some((m) => m.replace(/~/g, '').replace(/\s+/g, '') === question.slice(then.at, then.end).replace(/\s+/g, ''))
          : /^\s*([?？]|$)/.test(after)),
    );
    return rule ? rule.color : h.c.sw.color;
  };
  const mathNodes = new Set<PathNode>();
  /** 수식 노드 바로 뒤에 붙은 명사구 연결 조사 — 다음 B 노드의 실체를 이 수식 노드에 이어 붙인다 */
  let attachTo: { node: PathNode; at: number } | undefined;
  /** 제시문 노드 id → 발문 빈칸 표지가 걸린 자리 (노드를 다 세운 뒤 빈칸 노드와 잇는다) */
  const passageLabelAt = new Map<string, number>();

  /** 노드를 세우고 앞 노드와 잇는다 — 걸어 둔 간선이 있으면 그 간선으로, 없으면 인접으로 */
  const link = (node: PathNode) => {
    const prev = nodes.at(-1);
    nodes.push(node);
    if (prev) {
      edges.push(
        pendingEdge
          ? {
              from: prev.id,
              to: node.id,
              surface: pendingEdge.surface,
              kind: pendingEdge.kind,
              index: pendingEdge.index,
              ...(pathIds.includes(pendingEdge.sw.id) ? { color: pendingEdge.sw.color } : {}),
            }
          : { from: prev.id, to: node.id, surface: null, kind: 'adjacent', index: node.index },
      );
    }
    pendingEdge = undefined;
  };

  for (const [n, hit] of hits.entries()) {
    const { sw } = hit.c;
    const attach = attachTo;
    attachTo = undefined;
    // 문장 종결 경계를 넘었으면 실체는 경계 뒤에서부터, 걸어 둔 간선은 버린다
    const crossed = sentenceBreaks.filter((b) => b.at >= cursor && b.end <= hit.at).at(-1);
    if (crossed) {
      cursor = crossed.end;
      pendingEdge = undefined;
    }
    // 실체 머리 — 「㉠에 대한 ~」의 기호에서 실체가 시작한다 (앞말을 끌지 않는다, 간선은 그대로)
    const head = entityHeads.filter((a) => a >= cursor && a < hit.at).at(-1);
    if (head !== undefined) cursor = head;
    const surface = hit.math ? hit.inner : question.slice(hit.at, hit.end); // 수식 묶기는 끝 공백·쉼표를 뗀 식

    if (sw.kind === null) {
      undecided.push({ surface, switchId: sw.id, index: hit.at, reason: 'kind' });
      cursor = hit.end;
      continue;
    }

    if (sw.kind !== NODE_KIND) {
      // 약속된 길 [오종래 2026-10-01] — apply.definedPaths 간선(예: 「→」, D)은 앞에서 아무 노드도 끌고 나오지 않은
      //   글자(마지막 문장 끝 뒤부터)를 B 노드로 세운다 (예: 「메테인(CH₄) 암모니아(NH₃) →」). 간선 자신의 색은 조합에 켜진다.
      if (pathIds.includes(sw.id)) {
        const before = question.slice(cursor, hit.at);
        const ends = [...before.matchAll(/[.?!。](?=\s|$)|\n/g)]; // 문장 끝 또는 문단 경계
        const from = ends.length ? ends.at(-1)!.index! + 1 : 0;
        const text = before.slice(from).trim();
        if (text) {
          link({
            id: `n${n}`,
            surface,
            switchId: sw.id,
            index: cursor + from + before.slice(from).indexOf(text),
            color: 'B',
            entity: text,
          });
        }
      }
      // 연결어·부사 → 간선. 다음 노드가 설 때 이어 붙인다
      pendingEdge = { surface, kind: sw.kind, index: hit.at, sw };
      cursor = hit.end;
      continue;
    }

    let entity = hit.passage !== undefined || hit.caseHead || hit.quote || hit.proviso || hit.designated
      ? hit.inner
      : isLexical(sw, hit.c.surface)
        ? surface
        : hit.inner || afterLastBreak(question.slice(cursor, hit.at).trim());

    // 명사구 연결 — 실체가 있으면 경계를 두지 않고 다음 어절로 잇는다. 수식 노드 바로 뒤면 그 노드에 이어 붙일 자리를 남긴다
    //   다음 노드가 B가 아니면(예: 「k의 값은?」의 Q) 잇지 않는다 — 「의」 B가 그대로 그 Q의 대상이다.
    //   자리 규칙(아래 apply.contextRules)이 바꿀 색까지 본다 (예: 「x^6의 계수는?」의 「는」 → Q)
    const next = hits[n + 1];
    const nextIsB = next !== undefined && next.c.sw.kind === NODE_KIND && !isLexical(next.c.sw, next.c.surface)
      && next.passage === undefined && !next.caseHead && !next.quote && colorAfterRules(n + 1) === 'B';
    if (chainsNoun(hit) && nextIsB) {
      if (entity !== '') continue;
      const prev = nodes.at(-1);
      if (prev && mathNodes.has(prev)) attachTo = { node: prev, at: hit.at };
      cursor = hit.end;
      continue;
    }
    if (attach && sw.color === 'B' && !hit.chained && !isLexical(sw, hit.c.surface) && hit.passage === undefined && !hit.caseHead && !hit.quote
      && entity !== '' && entity === question.slice(cursor, hit.at).trim()) {
      attach.node.entity += question.slice(attach.at, hit.at).trimEnd();
      cursor = hit.end;
      continue;
    }

    // 앞말 포함 어휘형 [오종래 2026-10-01] — 봉인 파일이 지정한 어휘형 스위치(apply.withPreceding, 예: 「분포 구역」)는
    //   앞말까지 실체에 넣는다 (예: 「생물 보호종 30개체 이상 분포 구역」 전체가 B 하나). 뒤 조사(「을」)는 끌 실체가 없어 노드가 서지 않는다.
    if ((table.apply.withPreceding ?? []).includes(sw.id) && isLexical(sw, hit.c.surface)) {
      const pre = afterLastBreak(question.slice(cursor, hit.at).trim());
      if (pre) entity = `${pre} ${surface}`;
    }

    // 조사 연쇄의 실체 [오종래 2026-10-01] — 「것만을」: 「만」은 선택 기준(자기 색, 실체 = 표층형 「만」),
    //   「것」은 앞 제약에 걸린 대상이라 연쇄 끝 표지(「을」)의 노드가 끌고 나온다.
    if (entity === '' && carried?.at === hit.at) entity = carried.entity;
    carried = undefined;
    if (hit.chained && entity !== '') {
      carried = { at: hit.end, entity };
      entity = surface;
    }

    // 앞 노드 재색칠 [오종래 2026-10-01] — 봉인 파일이 지정한 스위치(apply.recolorPrevious, 예: 비교 「보다」)가
    //   실체 없이 앞 노드에 바로 붙어 걸리면(예: 「㉢보다」), 그 앞 노드를 이 스위치의 색으로 칠한다. B도 칠한다. 원래 색은 남긴다.
    const prev = nodes.at(-1);
    if (
      entity === '' &&
      prev &&
      recolorPrevIds.includes(sw.id) &&
      sw.color !== null &&
      question.slice(prev.index + prev.surface.length, hit.at).trim() === '' &&
      prev.color !== sw.color
    ) {
      prev.recoloredFrom = prev.color;
      prev.color = sw.color;
    }

    // 빈 노드 무시 [오종래 2026-09-30] — 끌고 나올 실체가 없는 표지(예: 어휘형 「(가)」 바로 뒤의 「의」)는
    //   노드를 세우지 않는다. 앞 간선은 다음 노드로 넘긴다.
    if (entity === '') {
      cursor = hit.end;
      continue;
    }

    if (sw.color === null) undecided.push({ surface, switchId: sw.id, index: hit.at, reason: 'color' });

    const node: PathNode = {
      id: `n${n}`,
      surface,
      switchId: sw.id,
      index: hit.at,
      color: sw.color,
      entity,
    };
    if (hit.passage !== undefined) passageLabelAt.set(node.id, hit.passage);

    // 재색칠 간선 [오종래 2026-09-30] — 봉인 파일이 지정한 간선 스위치(apply.recolorTargets, 예: 화살표)가
    //   가리키는 노드는 그 스위치의 색으로 칠한다. 이미 B로 확정된 노드는 건드리지 않는다. 원래 색은 남긴다.
    //   판단기준 접기(Q→B, 아래)는 이 뒤에 온다 — 재색칠된 판단기준도 B로 접힌다.
    const by = pendingEdge?.sw;
    if (by && recolorIds.includes(by.id) && by.color !== null && node.color !== 'B' && node.color !== by.color) {
      node.recoloredFrom = node.color;
      node.color = by.color;
    }

    link(node);
    if (hit.math) mathNodes.add(node);
    cursor = hit.end;

    // 「~의 N에」 묶음 [오종래 2026-10-07] — 명사구 연결 「의」가 다음 노드가 B가 아니어서 노드로 섰고, 바로 뒤 어절이 「한글 명사+에」이면
    //   그 명사까지 실체에 넣는다 (경제 2-2 「자국의 경제에 어떤 도움이 될 수 있는지」 → 「자국의 경제」). 「에」는 노드가 아니다.
    //   [오종래 2026-10-07] 이 묶음은 C다 — 적용 관점·범위 제약이지 묻는 대상이 아니다. Q 직전 B 규칙이 잡지 않고
    //   그 앞 B가 급소다 (2-2 → B「D국이 시행한 정책」). 원래 색(B)은 recoloredFrom에 남긴다.
    if (chainsNoun(hit) && !nextIsB) {
      const tail = question.slice(hit.end).match(/^[ \t]+([가-힣]{2,})에(?=[ \t])/);
      if (tail && (next === undefined || next.at >= hit.end + tail[0].length)) {
        node.entity = `${entity}${surface} ${tail[1]}`;
        node.recoloredFrom = node.color;
        node.color = 'C';
        cursor = hit.end + tail[0].length;
      }
    }

    // 강한 C 안의 참조어 [오종래 2026-10-02] — 어휘형 강한 C(apply.strongC) 표지 안에 어휘형 P 표지(예: 참조자료 「토론」)가
    //   단독 어절로 들어 있으면, 강한 C 노드는 그대로 두고 그 P를 따로 노드로 세운다 (예: 생윤_문_2 「다음 토론의」 → C + P「토론」).
    if ((table.apply.strongC ?? []).includes(sw.id) && isLexical(sw, hit.c.surface)) {
      for (const c of cands) {
        if (c.sw.kind !== NODE_KIND || c.sw.color !== 'P' || !isLexical(c.sw, c.surface)) continue;
        const k = surface.indexOf(c.surface);
        if (k <= 0 || !/\s/.test(surface[k - 1])) continue; // 표지 머리이거나 앞에 글자가 붙었다
        link({ id: `${node.id}p`, surface: c.surface, switchId: c.sw.id, index: hit.at + k, color: 'P', entity: c.surface });
        break;
      }
    }
  }

  // 빈칸 수렴 [오종래 2026-10-02] — 제시문 블록이 선 문항(「(가)에 대한 설명으로 옳은 것은?」)에서
  //   제시문 B는 빈칸의 실체를 알려 주고, 보기 B(apply.statementBlocks)는 각각 그 빈칸에 대해 판별되는 객체다.
  //   둘 다 발문의 빈칸 노드로 '빈칸' 간선을 보낸다 → 급소가 빈칸 B로 수렴한다 (예: 한국사_문_9 B「(가)」).
  for (const [id, at] of passageLabelAt) {
    const label = nodes.find((x) => x.index === at);
    if (!label) continue;
    const i = nodes.findIndex((x) => x.id === id);
    nodes[i] = { ...nodes[i], passageOf: label.id };
    edges.push({ from: id, to: label.id, surface: null, kind: '빈칸', index: nodes[i].index });
    if (edges.some((e) => e.kind === '빈칸' && e.to === label.id && e.from !== id)) continue; // 보기는 빈칸마다 한 번만
    for (const opt of nodes.filter((x) => blockIds.includes(x.switchId))) {
      edges.push({ from: opt.id, to: label.id, surface: null, kind: '빈칸', index: opt.index });
    }
  }

  // 자리 규칙 [오종래 2026-10-01] — 봉인 파일이 지정한 스위치(apply.contextRules[].targets)의 노드는 자리에 따라 색을 바꾼다.
  //   'beforeObject' (LS-22): 바로 다음 노드가 목적격 표지(objectMarkers, 예: 을/를)로 선 B 노드면 → 규칙 색
  //   'sentenceEnd'  (LS-23): 표지 뒤가 문장 끝이거나 바로 «?»면 → 규칙 색
  //   어느 조건에도 맞지 않으면 스위치 본래 색(기본값)을 그대로 둔다. 규칙은 적힌 순서대로 보고 처음 맞는 것 하나만 건다.
  //   판단기준 접기(Q→B, 아래)는 이 뒤에 온다.
  const bare = (m: string) => m.replace(/~/g, '').replace(/\s+/g, '');
  const contextRules = table.apply.contextRules ?? [];
  for (const [i, node] of nodes.entries()) {
    const next = nodes[i + 1];
    const after = question.slice(node.index + node.surface.length);
    const rule = contextRules.find(
      (r) =>
        r.targets.includes(node.switchId) &&
        (r.when === 'beforeObject'
          ? next !== undefined &&
            next.color === 'B' &&
            (r.objectMarkers ?? []).some((m) => bare(m) === next.surface.replace(/\s+/g, ''))
          : /^\s*([?？]|$)/.test(after)),
    );
    if (rule && rule.color !== node.color) {
      nodes[i] = { ...node, color: rule.color, contextRule: { id: rule.id, from: node.color } };
    }
  }

  // 비교구문 [오종래 2026-10-07] — 「A과/와 B를 비교하여」「A과/와 B의 차이를」의 A·B는 각각 독립 B다.
  //   「~과/와」로 선 P 노드 A는 다음 B가 비교 대상이면 B로 바꾼다 (B는 이미 B). 사이의 「~과/와」 아닌 P(제시문 기호
  //   「제시문 (나)의 관점을」)는 건너뛴다.
  //   비교 대상 = 그 B의 표지 뒤가 「비교」「대조」 또는 「차이」「공통점」「유사점」이거나, 그 B의 실체가 그 말로 끝날 때.
  //   「~과/와 함께」「~과/와 달리」 등 부사구는 제외.
  //   [오종래 2026-10-07] 「중 더 큰/작은/많은/적은」도 비교어다 (수리 논제1-3 「g(3)과 "구골"(10^100) 중 더 큰 수」).
  //   「중」은 앞 대상들을 모두 B로 부르는 자리 — 그 B 실체는 나누지 않는다.
  //   [오종래 2026-10-07] 비교 대상 B의 실체가 「A의 차이」(비교 기준어)면 「의」 명사구 연결보다 먼저 나눈다 —
  //   A(비교 대상)와 기준어가 각각 독립 B다 (「공리주의와 의무론의 차이를」 → B「의무론」 · B「차이」).
  //   [오종래 2026-10-07] 「각각」도 비교 자리다 — 「허자와 실옹의 주장을 각각」의 A·B는 각각 독립 B다 (논제1-1).
  //   [오종래 2026-10-07] 따옴표 이름 B(apply.quotedNames) 바로 뒤에 「와/과」가 오면 다음 명사구도 B로 소환한다 — 「와/과」는
  //   따옴표 뒤라 끌 실체가 없어 노드가 서지 않으므로 여기서 본다. 사이의 제시문 기호 P(「제시문 (마)의」)는 건너뛴다 (논제1-2).
  const COMPARE_AFTER = /^\s*(?:서로\s*)?(?:비교|대조|차이|공통점|유사점|각각)|^\s*(?:중\s*)?더\s*(?:큰|작은|많은|적은)/;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const quotedName = quotedNameIds.includes(node.switchId) && /^['‘]/.test(node.surface) && node.entity === node.surface.slice(1, -1);
    if (!quotedName || !/^\s*[와과](?=\s|$)/.test(question.slice(node.index + node.surface.length))) continue;
    let j = i + 1;
    while (nodes[j] && designatedIds.includes(nodes[j].switchId)) j++;
    const next = nodes[j];
    if (next && next.color !== 'B' && next.color !== 'Q') nodes[j] = { ...next, color: 'B', recoloredFrom: next.color };
  }
  const COMPARE_NOUN = /(?:차이|차이점|공통점|유사점)$/;
  const COMPARE_IN = /(?:^|\s)(?:중\s*)?더\s*(?:큰|작은|많은|적은)(?:\s|$)/;
  const COMPARE_SPLIT = /^(.+?)\s*의\s*(차이점?|공통점|유사점)$/;
  const ADVERBIAL = /^\s*(?:함께|달리|같이|더불어|마찬가지)/;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.color !== 'P' || !['와', '과'].includes(node.surface.trim())) continue;
    if (ADVERBIAL.test(question.slice(node.index + node.surface.length))) continue;
    let j = i + 1;
    while (nodes[j]?.color === 'P' && !['와', '과'].includes(nodes[j].surface.trim())) j++;
    const next = nodes[j];
    if (next?.color !== 'B') continue;
    const entity = next.entity.trim();
    if (!COMPARE_AFTER.test(question.slice(next.index + next.surface.length)) && !COMPARE_NOUN.test(entity) && !COMPARE_IN.test(entity)) continue;
    //   수식 변수 짝 [오종래 2026-10-07] — 앞이 단일 영문 변수(「b」「R」)이고 뒤 B가 조건·방법 표현(「~식」「~관계」「~값」)으로 끝나면
    //   비교 대상이 아니라 한 덩어리다 → 나누지 않고 B 하나로 합친다 (「b와 c의 관계를」 → B「b와 c의 관계」).
    if (/^[A-Za-z]$/.test(node.entity.trim()) && /(?:식|관계|값)$/.test(entity)) {
      nodes[j] = { ...next, entity:`${node.entity.trim()}${node.surface.trim()} ${entity}` };
      for (const [k, e] of edges.entries()) if (e.to === node.id) edges[k] = { ...e, to: next.id };
      for (let k = edges.length - 1; k >= 0; k--) if (edges[k].from === node.id) edges.splice(k, 1);
      nodes.splice(i, 1);
      i--;
      continue;
    }
    nodes[i] = { ...node, color: 'B' };
    const split = entity.match(COMPARE_SPLIT);
    if (!split) continue;
    const of = question.lastIndexOf('의', next.index);
    const target: PathNode = { ...next, id: `${next.id}a`, surface: '의', index: of, entity: split[1].trim() };
    nodes[j] = { ...next, entity: split[2] };
    nodes.splice(j, 0, target);
    for (const [k, e] of edges.entries()) if (e.to === next.id && e.index <= of) edges[k] = { ...e, to: target.id };
    edges.push({ from: target.id, to: next.id, surface: null, kind: 'adjacent', index: next.index });
  }

  // 결과 묶기 [오종래 2026-10-01] — 봉인 파일이 지정한 스위치(apply.foldResult, 예: 가정 「ならば」)의 조건 노드 바로 뒤에
  //   잇따라 선 B 노드들은 그 조건의 결과다 (예: 「a < b ならば, a = [イ], b = [ウ]」). B가 아닌 노드가 나오면 묶음이 끝난다.
  //   묶인 노드에 resultOf를 적고 조건 노드로 '결과' 간선을 보낸다. 결과 노드의 색은 바꾸지 않는다.
  //   [오종래 2026-10-01] 결과가 하나라도 묶인 조건 노드는 B로 접는다 — 결과들이 수렴하는 자리다. 원래 색은 남긴다(조합은 원래 색으로 센다).
  //   판단기준 접기(Q→B, 아래)는 이 뒤에 온다.
  const resultIds = table.apply.foldResult ?? [];
  for (const [i, cond] of nodes.entries()) {
    if (!resultIds.includes(cond.switchId)) continue;
    let bound = 0;
    for (const [j, later] of nodes.slice(i + 1).entries()) {
      if (later.color !== 'B') break;
      nodes[i + 1 + j] = { ...later, resultOf: cond.id };
      edges.push({ from: later.id, to: cond.id, surface: null, kind: '결과', index: later.index });
      bound++;
    }
    if (bound && cond.color !== 'B') nodes[i] = { ...cond, color: 'B', foldedFrom: cond.color };
  }

  // Q→B 추출 (구현명세 §2-3). [오종래 2026-09-30]
  //   «옳은 것을 고르시오»는 Q이고, 판단기준(예: «탄소 화합물인가?»)은 그 Q에 접힌 B다.
  //   (가) 봉인 파일이 판단기준 표지로 지정한 스위치(apply.foldToB)의 노드 → 색을 B로 접는다. 원래 색은 남긴다.
  //   (나) 그 뒤에 오는 노드(분기 결과·Q·보기)는 모두 그 판단기준으로 판정되므로 '접힘' 간선을 보낸다 → 수렴.
  //   [오종래 2026-10-06] 부등호 조건(실체 끝 식 — 마지막 한글 뒤 — 에 >·<·≥·≤가 든 것, 예: 「a>0, b>0, 0≤c≤π/2일 때」)은
  //   판단기준이 아니라 범위 제약 C다 — 접지 않고 C 그대로 둔다 (서술형2차 수학1·6).
  const foldIds = table.apply.foldToB ?? [];
  const inequality = (n: PathNode) => /[<>≤≥≦≧]/.test(n.entity.match(/[^가-힣ㄱ-ㅎㅏ-ㅣ]*$/)![0]);
  //   [오종래 2026-10-07] 수치 지정 조건(실체 끝 식이 「변수=수」, 예: 「n=7일 때」)도 판단기준이 아니라 조건 C다 —
  //   접지 않는다. 묻는 대상은 뒤 B다 (논제5-1 「n=7일 때, 내적 b₂·b₅의 값」). 「눈의 수가 k일 때」처럼 값이 정해지지 않은 조건은 그대로 접는다.
  //   같은 문장 안에 「~값」으로 끝나는 B가 뒤에 있을 때만 — 묻는 값이 없으면 그대로 접는다 (수능_수학_11 「시각 t=0일 때 출발하여」).
  const assignment = (i: number) =>
    /^[\s,]*[A-Za-z][A-Za-z0-9_]*\s*=\s*-?\d+(?:\.\d+)?\s*$/.test(nodes[i].entity.match(/[^가-힣ㄱ-ㅎㅏ-ㅣ]*$/)![0]) &&
    nodes.slice(i + 1).some(
      (n) => n.color === 'B' && n.entity.trim().endsWith('값') && !/[.?!。](?=\s|$)|\n/.test(question.slice(nodes[i].index, n.index)),
    );
  //   [오종래 2026-10-07] 조건부확률 조건절 — 「~(이/가) [색·상태]일 때」 뒤에 실체가 apply.conditionalTargets(예: 「확률」)로 끝나는
  //   B 노드가 오면 판단기준이 아니라 조건 C다 — 접지 않는다. 묻는 대상은 그 B다 (논제5-2 「공이 빨간색일 때, … A일 확률」).
  //   상태는 한글 낱말이다 — 실체가 식·기호로 끝나면(「눈의 수가 k일 때」) 판단기준 그대로. 그 B는 같은 문장 안이어야 한다 (수능_수학_30 급소 「k」).
  const condTargets = table.apply.conditionalTargets ?? [];
  const conditional = (i: number) => {
    if (!/[가-힣]$/.test(nodes[i].entity.trim())) return false;
    return nodes.slice(i + 1).some(
      (n) =>
        n.color === 'B' &&
        condTargets.some((t) => n.entity.trim().endsWith(t)) &&
        !/[.?!。](?=\s|$)|\n/.test(question.slice(nodes[i].index, n.index)),
    );
  };
  for (const [i, node] of nodes.entries()) {
    if (!foldIds.includes(node.switchId) || inequality(node) || assignment(i) || conditional(i)) continue;
    nodes[i] = { ...node, color: 'B', foldedFrom: node.color };
    for (const later of nodes.slice(i + 1)) {
      edges.push({ from: later.id, to: node.id, surface: null, kind: '접힘', index: later.index });
    }
  }

  // 강한 C [오종래 2026-10-01] — 봉인 파일이 지정한 스위치(apply.strongC, 예: 「가장 적합한」)의 노드는 C 그대로 두고,
  //   바로 다음 노드가 B면 그 B를 강한 C에 연결된 B로 적는다 (예: 「가장 적합한 구역을」 → 「구역」). 그 B가 급소로 선다(`v2/pivot.ts`).
  //   다음 노드가 B·Q가 아니면 연결하지 않는다. 색 접기가 모두 끝난 뒤에 본다.
  //   [오종래 2026-10-01] 다음 노드가 Q여도 연결한다 — 그 Q를 B로 접고 원래 색을 남긴다 (예: 물리_문_2 「옳은 것만을 <보기>에서 있는 대로 고른 것」).
  //   [오종래 2026-10-01] 판단기준 우선 — 그래프에 판단기준(apply.foldToB) 노드가 있으면 강한 C는 걸지 않는다
  //   (예: 화학_문_1은 같은 「옳은 것만을」이 있어도 급소가 판단기준 「탄소 화합물」이다).
  //   [오종래 2026-10-01] 강한 C가 급소 앞에서 범위를 먼저 지정한다 — 강한 C 바로 뒤에 잇따른 C 노드는 그 범위 안의 판단 기준이고,
  //   판단한 결과(그다음 B·Q)가 급소다 (예: 경제_문__4 「자료에 대한 분석으로」(범위) → 「옳은」(판단 기준) → 「것」(급소)).
  const strongIds = table.apply.strongC ?? [];
  const hasCriterion = nodes.some((n) => foldIds.includes(n.switchId) && n.foldedFrom !== undefined);
  for (const [i, node] of nodes.entries()) {
    if (hasCriterion || !strongIds.includes(node.switchId)) continue;
    let j = i + 1;
    while (nodes[j]?.color === 'C' && !strongIds.includes(nodes[j].switchId)) j++; // 판단 기준 C를 건너뛴다
    const next = nodes[j];
    if (next?.color === 'B') nodes[j] = { ...next, anchoredBy: node.id };
    else if (next?.color === 'Q') nodes[j] = { ...next, color: 'B', foldedFrom: next.color, anchoredBy: node.id };
  }

  // 보기 수렴 [오종래 2026-10-02] — 발문(Q가 선 문단)에 B 노드가 하나뿐이면, 보기 B 노드(apply.statementBlocks)는 각각
  //   그 B에 대해 판별되는 객체다 → '보기' 간선을 보낸다 → 급소가 발문의 B로 수렴한다
  //   (예: 법_문_9 「옳은 법적 판단만을 <보기>에서 고른 것은?」 — 보기 ㄱ~ㄹ → B「법적 판단」).
  //   판단기준(apply.foldToB)·강한 C 연결·빈칸 수렴이 선 그래프에는 걸지 않는다 — 그 규칙들이 먼저다.
  const anchoredAny = nodes.some((n) => n.anchoredBy !== undefined);
  const blankAny = edges.some((e) => e.kind === '빈칸');
  const qNode = nodes.find((n) => n.color === 'Q');
  if (qNode && !hasCriterion && !anchoredAny && !blankAny) {
    const from = question.lastIndexOf('\n', qNode.index) + 1;
    const nl = question.indexOf('\n', qNode.index);
    const to = nl === -1 ? question.length : nl;
    const isOption = (n: PathNode) => blockIds.includes(n.switchId);
    const asked = nodes.filter((n) => n.color === 'B' && !isOption(n) && n.index >= from && n.index < to);
    // 보기 조합 선택지(예: 「ㄱ, ㄴ」)는 판별 객체가 아니다 — 실체가 보기 머리 글자(머리 표지에서 끝 «.»를 뗀 것)로만 되어 있으면 보내지 않는다.
    //   [오종래 2026-10-02] 법_문_9 수렴도 4 = 보기 ㄱ~ㄹ만.
    const labels = new Set(
      table.switches.filter((s) => blockIds.includes(s.id)).flatMap((s) => s.markers.map((m) => m.replace(/~/g, '').trim().replace(/\.$/, ''))),
    );
    const comboOnly = (n: PathNode) => n.entity.split(/[\s,]+/).filter(Boolean).every((t) => labels.has(t));
    if (asked.length === 1) {
      for (const opt of nodes.filter((n) => isOption(n) && n.color === 'B' && !comboOnly(n))) {
        edges.push({ from: opt.id, to: asked[0].id, surface: null, kind: '보기', index: opt.index });
      }
    }
  }

  // 관형형 수식어 떼기 [오종래 2026-10-07] — B 실체 머리의 「한글+는」 어절(관형형 동사: 갖는·주는·하는·되는·있는·없는·나타내는 …)은
  //   실체가 아니라 수식어다 — 잘라낸다 (논제2 「갖는 역할」 → 「역할」, 논제4-3 「하는 자연수 p의 값」 → 「자연수 p의 값」).
  //   뒤에 남는 말이 있을 때만 자른다. 머리의 쉼표·공백은 그대로 둔다.
  for (const node of nodes) {
    if (node.color !== 'B') continue;
    let m: RegExpMatchArray | null;
    while ((m = node.entity.match(/^([\s,]*)[가-힣]+는\s+(?=\S)/))) node.entity = m[1] + node.entity.slice(m[0].length);
  }

  // 발문 P 고정 [오종래 2026-10-08] — 발문(첫 소문항 머리 앞, 소문항이 없으면 전체)에서 P로 잡힌 실체는 무대다.
  //   그 뒤에서 같은 실체가 B로 다시 걸려도 P로 둔다 — 발문 안에서도, 소문항에서도
  //   (서술형문항 2 「[그림 1]은 … 직사각형이고」 P → 「[그림 1]의 직사각형을」 B ✕ → P).
  //   실체가 글자 그대로 같을 때만 (소문항 머리 「(1)」은 떼고 비교 — 실체에서 떼지는 않는다)
  //   · 처음 P 자리보다 뒤의 B만 · 접힌 B(판단기준)는 건드리지 않는다.
  const stemEnd = question.search(STEM_END);
  const stemKey = (n: PathNode) => n.entity.trim().replace(SUB_HEAD_PREFIX, '');
  const stemP = new Map<string, PathNode>();
  for (const node of nodes) {
    if (node.color === 'P' && (stemEnd === -1 || node.index < stemEnd) && !stemP.has(stemKey(node))) stemP.set(stemKey(node), node);
  }
  for (const node of nodes) {
    const pin = node.color === 'B' && node.foldedFrom === undefined ? stemP.get(stemKey(node)) : undefined;
    if (pin && pin.index < node.index) {
      node.color = 'P';
      node.stemPinnedBy = pin.id;
    }
  }

  // 조합은 접기 전 색으로 센다 [오종래 2026-10-01] — 판단기준(Q에 접힌 B)은 급소 판정에서만 B이고,
  //   표면에 켜진 등은 원래 색이다 (예: 수학_문_4 「연속일 때」 = C → 조합 B·C·Q).
  //   약속된 길 간선의 색(예: 「→」 D)도 켜진 등이다 — 노드와 함께 문장 순서로 센다.
  const lights = [
    ...nodes.map((node) => ({ at: node.index, c: node.foldedFrom !== undefined ? node.foldedFrom : node.color })),
    ...edges.filter((e) => e.color !== undefined).map((e) => ({ at: e.index, c: e.color ?? null })),
  ].sort((a, b) => a.at - b.at);
  //   [오종래 2026-10-02] D만 반복을 허용한다 — 켜진 D 하나하나가 조합의 한 자리다 (예: 수리논술_문_2 정답지 PDDBQ의 D 둘).
  //   나머지 색(B·C·P·Q)은 처음 켜진 자리 하나만 센다.
  const combination: Color[] = [];
  for (const { c } of lights) {
    if (c && (c === 'D' || !combination.includes(c))) combination.push(c);
  }

  return { question, nodes, edges, combination, undecided };
}

/**
 * 색 조합에 이름을 붙인다. 이름이 없어도 그대로 둔다 — **색을 버리지 않는다.**
 * (v1 `formFromColors`는 P+B+C+Q에서 B를 조용히 버렸다: BUILD_PLAN §6-3)
 */
export function describeCombination(colors: Color[], table: SealedTable): FormCombination {
  const key = (cs: Color[]) => [...new Set(cs)].sort().join('');
  const mine = key(colors);
  const hit = table.forms.find((f) => key(f.colors) === mine);
  return {
    id: hit?.id ?? null,
    name: hit?.name ?? null,
    colors,
    known: Boolean(hit),
  };
}
