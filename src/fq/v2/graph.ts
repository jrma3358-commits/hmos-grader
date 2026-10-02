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
  /** 켜진 색들 (문장 순서, 중복 제거). 7형식은 이 조합에 붙는 이름일 뿐이다 */
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

/**
 * 표지 표층형 → 정규식.
 * '~'는 "여기에 실체가 온다"는 자리표시다 — 앞의 '~'는 조건 없음, 가운데 '~'는 사이에 실체가 낀다.
 * 가운데 '~'는 캡처한다 — 사이에 낀 실체가 곧 그 노드의 entity다.
 * 예: "~가 되도록" → /가\s*되도록/ · "모든 ~에 대하여" → /모든\s*([\s\S]*?)에\s*대하여/
 */
export function markerRegex(surface: string): RegExp {
  const parts = surface
    .split('~')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => escape(p).replace(/\s+/g, '\\s*'));
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

/** 어휘형 표지인가 — 봉인 파일의 `lexical`이 정한다 (스위치 전부 또는 적힌 표지만) */
function isLexical(sw: SealedSwitch, marker: string): boolean {
  return sw.lexical === true || (Array.isArray(sw.lexical) && sw.lexical.includes(marker));
}

/** 노드가 되는 표지의 종류 — 나머지(연결어·부사)는 간선이 된다 */
const NODE_KIND = '조사·어미' satisfies SwitchKind;

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
  let hits: { at: number; end: number; c: Candidate; inner: string; chained: boolean; passage?: number; caseHead?: true }[] = [];

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
  const registered = new Set(table.switches.flatMap((s) => s.markers.map((m) => m.trim())));
  const speakerBreaks = (table.apply.paragraphBreaks ?? []).filter((m) => !registered.has(m.trim()));

  for (let i = 0; i < question.length; ) {
    const rest = question.slice(i);
    const speaker = (i === 0 || /\s/.test(question[i - 1])) && speakerBreaks.find((m) => rest.startsWith(m) && (rest.length === m.length || /\s/.test(rest[m.length])));
    if (speaker) {
      i += speaker.length;
      continue;
    }
    let matched: { len: number; c: Candidate; inner: string; chained: boolean } | undefined;
    for (const c of cands) {
      const m = rest.match(c.re);
      if (m && m.index === 0) {
        const inside =
          endOfWord && c.sw.kind === NODE_KIND && !isLexical(c.sw, c.surface) && insideWord(rest[m[0].length]);
        if (inside && !chainsToMarker(c.sw, rest.slice(m[0].length))) {
          continue; // 어절 안 — 더 짧은 표지를 마저 본다
        }
        if (afterNounOnly.includes(c.sw.id) && verbStemBefore(question[i - 1])) {
          continue; // 앞이 용언 어간 — 관형형 어미로 본다
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
        // 가운데 '~'가 붙잡은 실체 (여럿이면 이어 붙인다)
        const inner = m.slice(1).map((s) => s.trim()).filter(Boolean).join(' ');
        matched = { len: m[0].length, c, inner, chained: inside };
        break; // 최장 일치 — cands가 이미 긴 것부터다
      }
    }
    if (matched) {
      hits.push({ at: i, end: i + matched.len, c: matched.c, inner: matched.inner, chained: matched.chained });
      i += matched.len;
    } else {
      i += 1;
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
    const surface = question.slice(hit.at, hit.end);

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

    let entity = hit.passage !== undefined || hit.caseHead
      ? hit.inner
      : isLexical(sw, hit.c.surface)
        ? surface
        : hit.inner || afterLastBreak(question.slice(cursor, hit.at).trim());

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
    cursor = hit.end;

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
  const foldIds = table.apply.foldToB ?? [];
  for (const [i, node] of nodes.entries()) {
    if (!foldIds.includes(node.switchId)) continue;
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
  const hasCriterion = nodes.some((n) => foldIds.includes(n.switchId));
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

  // 조합은 접기 전 색으로 센다 [오종래 2026-10-01] — 판단기준(Q에 접힌 B)은 급소 판정에서만 B이고,
  //   표면에 켜진 등은 원래 색이다 (예: 수학_문_4 「연속일 때」 = C → 조합 B·C·Q).
  //   약속된 길 간선의 색(예: 「→」 D)도 켜진 등이다 — 노드와 함께 문장 순서로 센다.
  const lights = [
    ...nodes.map((node) => ({ at: node.index, c: node.foldedFrom !== undefined ? node.foldedFrom : node.color })),
    ...edges.filter((e) => e.color !== undefined).map((e) => ({ at: e.index, c: e.color ?? null })),
  ].sort((a, b) => a.at - b.at);
  const combination: Color[] = [];
  for (const { c } of lights) {
    if (c && !combination.includes(c)) combination.push(c);
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
