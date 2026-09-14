// PHASE 2 인식 파이프라인 STEP 1~5 — ENGINE_LOGIC.md

import {
  ADVERB_RULE,
  CATEGORIES,
  CLAUSE_BOUNDARY,
  END_RULES,
  MODIFIER_END,
  Q_PROCESS_MODIFIER,
  Q_VERB_BASE,
  SLOT_WORDS,
  START_RULES,
  type SwitchRule,
} from './lexicon.ts';
import type {
  AnswerFormat,
  Clause,
  Color,
  ColorElement,
  ContextAnalysis,
  CoreColors,
  CoreDetail,
  FiveColors,
  FormId,
  LogicSwitch,
  Relation,
  ScannedClause,
  SevenForm,
} from './types.ts';
import { countItems, subjectParticle, unique } from './util.ts';

// ─────────────────────────────────────────────────────────────
// 1-4. 질문 인식 (파싱)
// ─────────────────────────────────────────────────────────────

export function normalize(question: string): string {
  return question.replace(/\s+/g, ' ').trim();
}

function matchRule(rules: SwitchRule[], text: string): { rule: SwitchRule; m: RegExpMatchArray } | undefined {
  for (const rule of rules) {
    const m = text.match(rule.pattern);
    if (m) return { rule, m };
  }
  return undefined;
}

/** 연결어만 있거나 종결 스위치가 없는 조각인가 → 다음 절에 붙인다 */
function isFragment(text: string): boolean {
  const start = matchRule(START_RULES, text);
  if (start && text.slice(start.m[0].length).trim() === '') return true;
  return !matchRule(END_RULES, text);
}

export function splitClauses(text: string): Clause[] {
  const raw: Clause[] = [];
  const push = (from: number, to: number) => {
    const slice = text.slice(from, to);
    const body = slice.trim().replace(/[,.!]+$/, '').trim();
    if (body) raw.push({ text: body, index: from + slice.indexOf(body[0]) });
  };

  let last = 0;
  for (const m of text.matchAll(CLAUSE_BOUNDARY)) {
    const end = m.index + m[0].length;
    push(last, end);
    last = end;
  }
  push(last, text.length);

  const clauses: Clause[] = [];
  let carry: Clause | undefined;
  for (const c of raw) {
    const cur = carry ? { text: `${carry.text} ${c.text}`, index: carry.index } : c;
    if (isFragment(cur.text)) {
      carry = cur;
      continue;
    }
    clauses.push(cur);
    carry = undefined;
  }
  if (carry) clauses.push(carry);
  return clauses;
}

// ─────────────────────────────────────────────────────────────
// STEP 1·2. 논리스위치 파악 → 색매칭
// 스위치 하나가 요소 하나를 부른다 — 한 절에 B 스위치와 C 스위치가 함께 있으면 두 요소로 가른다 (CORE_SPEC §2 결정성)
// ─────────────────────────────────────────────────────────────

function toSwitch(
  rule: SwitchRule,
  m: RegExpMatchArray,
  clause: Clause,
  position: LogicSwitch['position'],
): LogicSwitch {
  return {
    surface: m[1] ?? m[0],
    kind: rule.kind,
    index: clause.index + (m.index ?? 0),
    candidates: rule.candidates,
    rule: rule.id,
    position,
  };
}

/** Q 목적어를 [관형 수식어(C) | 머리말(Q)]로 가른다 */
function splitQObject(object: string): { modifierWords?: string[]; head: string } {
  const words = object.split(' ');
  for (let i = words.length - 2; i >= 0; i--) {
    if (MODIFIER_END.test(words[i])) {
      return { modifierWords: words.slice(0, i + 1), head: words.slice(i + 1).join(' ') };
    }
  }
  return { head: object };
}

function qObject(clauseText: string, start: RegExpMatchArray | undefined, end: RegExpMatchArray): string {
  const from = start ? start[0].length : 0;
  return clauseText
    .slice(from, end.index)
    .trim()
    .replace(/\s*(을|를)$/, '')
    .trim();
}

const HANGUL = /[가-힣]/;

/** 수식 대상인가 — 한글이 없고 단일 문자 미지수가 아니다 (f(x), sinθ/(1−cos²θ), a, a, b ...) */
function isMathObject(s: string): boolean {
  const t = s.trim();
  return t !== '' && !HANGUL.test(t) && !/^[a-zA-Z]$/.test(t);
}

type BRule = 'B.주격' | 'B.관형격' | 'B.목적격';
const B_RULE: Record<string, BRule> = { 이: 'B.주격', 가: 'B.주격', 의: 'B.관형격', 을: 'B.목적격', 를: 'B.목적격' };

interface ObjectSplit {
  object: string;
  particle: string;
  at: number;
  rule: BRule;
  rest: string;
}

/**
 * B를 부르는 조사로 [대상 | 나머지]를 가른다 — CORE_SPEC §3.1 B: ~가(이)·~의·~를
 *   수식 뒤의 ~가·~의: "f(x)가 최댓값을 가질 때", "f(x)=…의 극댓값이", "sinθ/(1−cos²θ)의 값"
 *   ~을·~를 ('all'일 때): "a,a,b,c,d,e 카드를 나열할 때"
 * 한글 명사 뒤의 ~가·~의("모음이 오는", "경우의 수")는 대상 소환이 아니라 C·Q 내용의 일부로 둔다
 */
function splitObject(text: string, particles: 'all' | '의'): ObjectSplit | undefined {
  const make = (m: RegExpMatchArray): ObjectSplit => ({
    object: text.slice(0, m.index).trim(),
    particle: m[1],
    at: m.index!,
    rule: B_RULE[m[1]],
    rest: text.slice(m.index! + 1).trim(),
  });
  const math = text.match(particles === '의' ? /(의)\s/ : /(가|이|의)\s/);
  if (math && isMathObject(text.slice(0, math.index))) return make(math);
  if (particles === 'all') {
    const obj = text.match(/(을|를)\s/);
    if (obj && obj.index! > 0) return make(obj);
  }
  return undefined;
}

/** 구간이 붙은 조각: "5x+a (x<−2)" */
const PIECE = /\([^()]*[<>≤≥][^()]*\)$/;

/** 조각별로 정의된 대상은 조각마다 B — "f(x)=5x+a (x<−2), x²−a (x≥−2)" → B₁, B₂ (논문1 §4 4번) */
function pieces(object: string): string[] {
  const ps = object.split(/(?<=\))\s*,\s*/);
  return ps.length > 1 && ps.every((p) => PIECE.test(p)) ? ps : [object];
}

function qVerbBase(surface: string): string {
  for (const [re, base] of Q_VERB_BASE) if (re.test(surface)) return base;
  return surface;
}

/**
 * "양 끝에 모음이 오는" → "양 끝에 모음"
 * 동사는 주어(~이/가) 뒤에서만 뗀다 — "3으로 나누어떨어지는", "최댓값을 갖는"은 동사가 조건의 핵심이다
 */
function conditionFromModifier(words: string[]): string {
  const ws = [...words];
  const last = ws[ws.length - 1];
  const prev = ws.at(-2);
  if (last === '때의') {
    ws[ws.length - 1] = '때';
  } else if (last.endsWith('인') && last.length > 1) {
    ws[ws.length - 1] = last.slice(0, -1);
  } else if (prev && prev.length > 1 && /[이가]$/.test(prev)) {
    ws.pop();
    ws[ws.length - 1] = prev.slice(0, -1);
  }
  return ws.join(' ');
}

type Part = Omit<ColorElement, 'clause'>;

/** 절 하나를 읽어 스위치(STEP 1)와 그 스위치가 부른 요소(STEP 2)를 함께 낸다 */
function readClause(clause: Clause): { switches: LogicSwitch[]; parts: Part[] } {
  const { text } = clause;
  const switches: LogicSwitch[] = [];
  const parts: Part[] = [];

  const start = matchRule(START_RULES, text);
  const end = matchRule(END_RULES, text);
  const startSw = start && toSwitch(start.rule, start.m, clause, 'start');
  const adverb = text.match(ADVERB_RULE.pattern);
  const adverbSw = adverb && toSwitch(ADVERB_RULE, adverb, clause, 'inner');
  if (startSw) switches.push(startSw);
  if (adverbSw) switches.push(adverbSw);
  if (!end) return { switches, parts };

  const endSw = toSwitch(end.rule, end.m, clause, 'end');
  const body = start ? text.slice(start.m[0].length).trim() : text;

  const pushObject = (host: string, split: ObjectSplit) => {
    const sw: LogicSwitch = {
      surface: split.particle,
      kind: '조사·어미',
      index: clause.index + text.indexOf(host) + split.at,
      candidates: ['B'],
      rule: split.rule,
      position: 'inner',
    };
    switches.push(sw);
    for (const piece of pieces(split.object)) parts.push({ candidates: ['B'], content: piece, switches: [sw] });
  };

  if (end.rule.id === 'Q.명령' || end.rule.id === 'Q.의문') {
    let qContent: string;
    if (end.rule.id === 'Q.명령') {
      const object = qObject(text, start?.m, end.m);
      const { modifierWords, head } = splitQObject(object);
      const last = modifierWords?.at(-1);
      if (last && !Q_PROCESS_MODIFIER.test(last)) {
        // "양 끝에 모음이 오는 경우의 수" — 관형 수식어 끝이 C 스위치
        const modifier = modifierWords!.join(' ');
        const split = splitObject(modifier, 'all');
        if (split) pushObject(modifier, split);
        const sw: LogicSwitch = {
          surface: last,
          kind: '조사·어미',
          index: clause.index + text.indexOf(last),
          candidates: ['C'],
          rule: 'C.관형',
          position: 'inner',
        };
        switches.push(sw);
        parts.push({ candidates: ['C'], content: conditionFromModifier((split?.rest ?? modifier).split(' ')), switches: [sw] });
        qContent = head;
      } else {
        qContent = object;
      }
    } else {
      qContent = body.replace(/(인가|은|는)\?$/, '').trim();
    }
    // "f(3)의 값"의 f(3)은 질문의 실체 — Q절 안에서는 ~의 앞을 B로 떼지 않는다
    switches.push(endSw);
    parts.push({
      candidates: ['Q'],
      content: qContent,
      switches: [endSw],
      qVerb: end.rule.id === 'Q.명령' ? qVerbBase(endSw.surface) : '?',
    });
    return { switches, parts };
  }

  let candidates = endSw.candidates;
  const used: LogicSwitch[] = [endSw];
  if (startSw && !startSw.candidates.includes('Q')) {
    if (startSw.candidates.length === 1 || candidates.length > 1) candidates = startSw.candidates;
    used.unshift(startSw);
  }
  if (adverbSw && candidates.length > 1 && candidates.includes('C')) {
    candidates = ['C'];
    used.push(adverbSw);
  }

  let content = body;
  if (end.rule.id === 'B.대하여' || end.rule.id === 'D.매개변수') content = body.replace(/\s*에\s*(대하여|대해)$/, '');
  if (end.rule.id === 'C.조건' && candidates.length === 1 && candidates[0] === 'C') {
    // "카드를 나열할 때" → B(카드) + C(나열할 때)
    const split = splitObject(body, 'all');
    if (split) {
      pushObject(body, split);
      content = split.rest;
    }
  }
  switches.push(endSw);
  parts.push({ candidates, content, switches: used });
  return { switches, parts };
}

export function detectLogicSwitches(question: string): ScannedClause[] {
  return splitClauses(question).map((clause) => ({ clause, switches: readClause(clause).switches }));
}

/** 질문 무결 게이트: 목적지(Q)가 없으면 질문이 성립하지 않는다 */
export function isValidQuestion(scanned: ScannedClause[]): boolean {
  return scanned.some((s) => s.switches.some((sw) => sw.position === 'end' && sw.candidates.includes('Q')));
}

export function matchColors(scanned: ScannedClause[]): ColorElement[] {
  return scanned.flatMap(({ clause }) => readClause(clause).parts.map((p) => ({ ...p, clause })));
}

// ─────────────────────────────────────────────────────────────
// STEP 3. 문맥파악
// ─────────────────────────────────────────────────────────────

const colorOf = (e: ColorElement): Color | undefined => e.color ?? (e.candidates.length === 1 ? e.candidates[0] : undefined);

export function analyzeContext(tmp: ColorElement[]): ContextAnalysis {
  const notes: string[] = [];
  const relations: Relation[] = [];

  // D가 정의한 함수 기호: "g(x) = f(x+4)라 하자"
  const defined = new Map<string, ColorElement>();
  for (const d of tmp.filter((e) => colorOf(e) === 'D')) {
    const m = d.content.match(/^\s*([a-zA-Z])\([a-z]\)\s*=/);
    if (m) defined.set(m[1], d);
  }

  const elements = tmp
    .map((e): ColorElement => (e.candidates.length === 1 ? { ...e, color: e.candidates[0] } : e));

  const byColor = (c: Color) => elements.filter((e) => colorOf(e) === c);
  const bs = byColor('B');

  if (bs.length) {
    for (const c of byColor('C')) {
      const cat = CATEGORIES.find((k) => c.content.includes(k.name));
      const slot = SLOT_WORDS.find((s) => s.pattern.test(c.content));
      if (cat || slot) relations.push({ from: 'C', to: 'B', type: '제약', evidence: c.content });
    }
    const firstB = elements.indexOf(bs[0]);
    for (const p of byColor('P')) {
      if (elements.indexOf(p) < firstB) relations.push({ from: 'P', to: 'B', type: '무대 선행', evidence: p.content });
    }
    const bSymbols = new Set(bs.flatMap((b) => b.content.match(/[a-zA-Z]\([a-z]\)/g) ?? []));
    for (const d of byColor('D')) {
      if ((d.content.match(/[a-zA-Z]\([a-z]\)/g) ?? []).some((s) => bSymbols.has(s))) {
        relations.push({ from: 'D', to: 'B', type: '재규정', evidence: d.content });
      }
    }
  }

  return { elements, relations, notes };
}

// ─────────────────────────────────────────────────────────────
// STEP 4. 7형식 결정
// ─────────────────────────────────────────────────────────────

const FORMS: Record<FormId, { pattern: string; name: string; colors: Color[] }> = {
  1: { pattern: 'Q', name: '순수 연산', colors: ['Q'] },
  2: { pattern: 'B+Q', name: '관계형', colors: ['B', 'Q'] },
  3: { pattern: 'P+Q', name: '무대형', colors: ['P', 'Q'] },
  4: { pattern: 'C+Q', name: '제약형', colors: ['C', 'Q'] },
  5: { pattern: 'B+C+Q', name: '준킬러형', colors: ['B', 'C', 'Q'] },
  6: { pattern: 'P+C+Q', name: '통합형', colors: ['P', 'C', 'Q'] },
  7: { pattern: 'D+C+Q', name: '초고난도형', colors: ['D', 'C', 'Q'] },
};

/** 색 조합 → 형식. 심층 인식요소(D·P)가 먼저 형식을 결정한다 */
export function formFromColors(present: Iterable<Color>): FormId {
  const s = new Set(present);
  if (s.has('D')) return 7;
  if (s.has('P')) return s.has('C') ? 6 : 3;
  if (s.has('B') && s.has('C')) return 5;
  if (s.has('C')) return 4;
  if (s.has('B')) return 2;
  return 1;
}

export function describeForm(id: FormId): SevenForm {
  const f = FORMS[id];
  return {
    id,
    pattern: f.pattern,
    name: f.name,
    logicSwitch: id >= 6 ? 'ON' : 'OFF',
    label: `${id}형식 (${f.pattern}, ${f.name})`,
  };
}

/** 1차 5색 → 7형식 → 7형식으로 애매한 색 확정 → 최종 형식 */
export function classify7Form(context: ContextAnalysis): { form: SevenForm; elements: ColorElement[]; notes: string[] } {
  const notes: string[] = [];
  const definite = context.elements.map(colorOf).filter((c): c is Color => !!c);
  const tentative = FORMS[formFromColors(definite)];

  const elements = context.elements.map((e): ColorElement => {
    if (colorOf(e)) return { ...e, color: colorOf(e) };
    const inForm = e.candidates.filter((c) => tentative.colors.includes(c));
    const color = inForm[0] ?? e.candidates[0];
    notes.push(`"${e.clause.text}" — 후보 ${e.candidates.join('/')} 중 ${tentative.pattern} 맥락으로 ${color} 확정`);
    return { ...e, color };
  });

  const form = describeForm(formFromColors(elements.map((e) => e.color!)));
  return { form, elements, notes };
}

// ─────────────────────────────────────────────────────────────
// STEP 5. 핵심 5색 추출
// ─────────────────────────────────────────────────────────────

/** 원소 목록: 알파벳 한 글자 또는 정수 (a,a,b / 10, 20, 30) */
const ITEM_LIST = /(?:^|[^\w(])((?:[a-z]|\d+)(?:\s*,\s*(?:[a-z]|\d+))+)(?![\w(])/i;

function qDisplay(e: ColorElement): string {
  const process = e.content.match(/^(.*?)\s*(?:을|를)?\s*(?:구하는|구한|찾는|계산하는|결정하는)\s+(?:풀이\s*)?과정$/);
  if (process) return `${process[1]}+서술`;
  if (/^(풀이\s*)?(과정|방법|이유)$/.test(e.content) && /^(서술|쓰|설명|논)/.test(e.qVerb ?? '')) return '서술';
  return e.content;
}

function answerFormats(qs: ColorElement[]): AnswerFormat[] {
  const out: AnswerFormat[] = [];
  for (const q of qs) {
    const shown = qDisplay(q);
    if (/(경우의\s*수|값|개수|넓이|길이|확률)/.test(shown)) out.push('수치');
    if (/범위/.test(shown)) out.push('범위');
    if (/(식|방정식)$/.test(shown)) out.push('식');
    if (/서술/.test(shown)) out.push('서술');
  }
  return unique(out);
}

export function extractCoreColors(elements: ColorElement[], context: ContextAnalysis): CoreColors {
  const of = (c: Color) => elements.filter((e) => e.color === c);
  const join = (c: Color) => (of(c).length ? of(c).map((e) => e.content).join(', ') : undefined);

  const cText = join('C') ?? '';
  const constrainsB = context.relations.some((r) => r.from === 'C' && r.to === 'B');

  const listMatch = of('B')
    .map((b) => b.content.match(ITEM_LIST))
    .find((m) => m);
  const items = listMatch ? listMatch[1].split(',').map((x) => x.trim()) : undefined;
  const counts = items ? countItems(items) : new Map<string, number>();
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([item, count]) => ({ item, count }));

  const cat = constrainsB ? CATEGORIES.find((k) => cText.includes(k.name)) : undefined;
  const category = cat && items ? { name: cat.name, members: items.filter(cat.test) } : undefined;
  const slotWord = constrainsB ? SLOT_WORDS.find((s) => s.pattern.test(cText)) : undefined;
  const slots = slotWord ? { name: slotWord.name, positions: slotWord.positions } : undefined;

  let B = join('B');
  if (items) {
    const notes: string[] = [];
    if (category) notes.push(`${category.name} ${category.members.join(',')}`);
    for (const d of duplicates) notes.push(`${d.item}${subjectParticle(d.item)} 중복`);
    B = items.join(',') + (notes.length ? ` (${notes.join(', ')})` : '');
  }

  const qs = of('Q');
  const C = join('C');
  const P = join('P');
  const D = join('D');
  const colors: FiveColors = {
    ...(B ? { B } : {}),
    ...(C ? { C } : {}),
    ...(P ? { P } : {}),
    ...(D ? { D } : {}),
    Q: qs.map(qDisplay).join('+'),
    qVerbs: unique(qs.map((q) => q.qVerb!).filter(Boolean)),
  };

  const present = unique(elements.map((e) => e.color!));
  const detail: CoreDetail = {
    items,
    duplicates,
    category,
    slots,
    answerFormats: answerFormats(qs),
    layers: {
      surface: (['B', 'C', 'Q'] as Color[]).filter((c) => present.includes(c)),
      deep: (['P', 'D'] as Color[]).filter((c) => present.includes(c)),
    },
  };

  return { colors, detail, elements };
}
