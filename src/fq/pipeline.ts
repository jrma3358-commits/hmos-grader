// PHASE 2 인식 파이프라인 STEP 1~5 — ENGINE_LOGIC.md

import {
  ADVERB_RULE,
  CATEGORIES,
  CLAUSE_BOUNDARY,
  END_RULES,
  MODIFIER_END,
  OPERATION_VERB,
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
// STEP 1. 논리스위치 파악
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
function splitQObject(object: string): { modifierWords?: string[]; head: string; modifierIndex?: number } {
  const words = object.split(' ');
  for (let i = words.length - 2; i >= 0; i--) {
    if (MODIFIER_END.test(words[i])) {
      return { modifierWords: words.slice(0, i + 1), head: words.slice(i + 1).join(' '), modifierIndex: i };
    }
  }
  return { head: object };
}

/** 관형 수식어 안의 목적어 "a, b, c를 나열하는" → { object: "a, b, c", predicate: "나열하는" } */
function modifierObject(words: string[]): { object: string; predicate: string } | undefined {
  for (let i = words.length - 2; i >= 0; i--) {
    const m = words[i].match(/^(.+)(을|를)$/);
    if (m) {
      return {
        object: [...words.slice(0, i), m[1]].join(' '),
        predicate: words.slice(i + 1).join(' '),
      };
    }
  }
  return undefined;
}

function qObject(clauseText: string, start: RegExpMatchArray | undefined, end: RegExpMatchArray): string {
  const from = start ? start[0].length : 0;
  return clauseText
    .slice(from, end.index)
    .trim()
    .replace(/\s*(을|를)$/, '')
    .trim();
}

export function detectLogicSwitches(question: string): ScannedClause[] {
  return splitClauses(question).map((clause) => {
    const switches: LogicSwitch[] = [];
    const start = matchRule(START_RULES, clause.text);
    const end = matchRule(END_RULES, clause.text);

    if (start) switches.push(toSwitch(start.rule, start.m, clause, 'start'));

    const adverb = clause.text.match(ADVERB_RULE.pattern);
    if (adverb) switches.push(toSwitch(ADVERB_RULE, adverb, clause, 'inner'));

    if (end?.rule.id === 'Q.명령') {
      // "양 끝에 모음이 오는 경우의 수" — 관형 수식어 끝이 C 스위치
      const object = qObject(clause.text, start?.m, end.m);
      const { modifierWords } = splitQObject(object);
      const last = modifierWords?.at(-1);
      if (last && !Q_PROCESS_MODIFIER.test(last)) {
        const obj = modifierObject(modifierWords!);
        if (obj) {
          // "a, b, c를 나열하는 경우의 수": 수식어 속 목적격 조사가 B를 부른다 → B/C 애매
          const at = clause.text.indexOf(obj.object) + obj.object.length;
          switches.push({
            surface: clause.text[at],
            kind: '조사·어미',
            index: clause.index + at,
            candidates: ['B'],
            rule: 'B.목적격',
            position: 'inner',
          });
        }
        switches.push({
          surface: last,
          kind: '조사·어미',
          index: clause.index + clause.text.indexOf(last),
          candidates: ['C'],
          rule: 'C.관형',
          position: 'inner',
        });
      }
    }

    if (end?.rule.id === 'C.조건') {
      // "~을/를 ... 할 때": 목적격 조사가 B를 부른다 → B/C 애매
      const obj = clause.text.match(/(을|를)\s/);
      if (obj) {
        switches.push({
          surface: obj[1],
          kind: '조사·어미',
          index: clause.index + (obj.index ?? 0),
          candidates: ['B'],
          rule: 'B.목적격',
          position: 'inner',
        });
      }
    }

    if (end) switches.push(toSwitch(end.rule, end.m, clause, 'end'));
    return { clause, switches };
  });
}

/** 질문 무결 게이트: 목적지(Q)가 없으면 질문이 성립하지 않는다 */
export function isValidQuestion(scanned: ScannedClause[]): boolean {
  return scanned.some((s) => s.switches.some((sw) => sw.position === 'end' && sw.candidates.includes('Q')));
}

// ─────────────────────────────────────────────────────────────
// STEP 2. 색매칭 (1차)
// ─────────────────────────────────────────────────────────────

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

export function matchColors(scanned: ScannedClause[]): ColorElement[] {
  const elements: ColorElement[] = [];

  for (const { clause, switches } of scanned) {
    const end = switches.find((s) => s.position === 'end');
    if (!end) continue;
    const start = switches.find((s) => s.position === 'start');
    const startMatch = start ? clause.text.match(START_RULES.find((r) => r.id === start.rule)!.pattern) ?? undefined : undefined;
    const body = startMatch ? clause.text.slice(startMatch[0].length).trim() : clause.text;

    if (end.rule === 'Q.명령') {
      const endMatch = clause.text.match(END_RULES.find((r) => r.id === end.rule)!.pattern)!;
      const object = qObject(clause.text, startMatch, endMatch);
      const { modifierWords, head } = splitQObject(object);
      const modifier = switches.find((s) => s.rule === 'C.관형');
      if (modifier && modifierWords) {
        const objectMarker = switches.find((s) => s.rule === 'B.목적격');
        const obj = objectMarker ? modifierObject(modifierWords) : undefined;
        elements.push({
          candidates: obj ? ['C', 'B'] : ['C'],
          content: conditionFromModifier(modifierWords),
          clause,
          switches: objectMarker ? [objectMarker, modifier] : [modifier],
          ...obj,
        });
        elements.push({ candidates: ['Q'], content: head, clause, switches: [end], qVerb: qVerbBase(end.surface) });
      } else {
        elements.push({ candidates: ['Q'], content: object, clause, switches: [end], qVerb: qVerbBase(end.surface) });
      }
      continue;
    }

    if (end.rule === 'Q.의문') {
      elements.push({
        candidates: ['Q'],
        content: body.replace(/(인가|은|는)\?$/, '').trim(),
        clause,
        switches: [end],
        qVerb: '?',
      });
      continue;
    }

    let candidates = end.candidates;
    const used: LogicSwitch[] = [end];
    if (start && !start.candidates.includes('Q')) {
      if (start.candidates.length === 1 || candidates.length > 1) candidates = start.candidates;
      used.unshift(start);
    }
    const adverb = switches.find((s) => s.rule === 'C.부사');
    if (adverb && candidates.length > 1 && candidates.includes('C')) {
      candidates = ['C'];
      used.push(adverb);
    }

    let content = body;
    let object: string | undefined;
    if (end.rule === 'B.대하여') content = body.replace(/\s*에\s*(대하여|대해)$/, '');
    let predicate: string | undefined;
    const objectMarker = switches.find((s) => s.rule === 'B.목적격');
    if (objectMarker && candidates.length === 1 && candidates[0] === 'C') {
      candidates = ['C', 'B'];
      const at = body.search(/(을|를)\s/);
      object = body.slice(0, at).trim();
      predicate = body.slice(at + 1).trim();
      used.push(objectMarker);
    }

    elements.push({ candidates, content, clause, switches: used, object, predicate });
  }

  return elements;
}

// ─────────────────────────────────────────────────────────────
// STEP 3. 문맥파악
// ─────────────────────────────────────────────────────────────

const colorOf = (e: ColorElement): Color | undefined => e.color ?? (e.candidates.length === 1 ? e.candidates[0] : undefined);

export function analyzeContext(tmp: ColorElement[]): ContextAnalysis {
  const notes: string[] = [];
  const relations: Relation[] = [];

  const elements = tmp.map((e): ColorElement => {
    if (!e.object) return e.candidates.length === 1 ? { ...e, color: e.candidates[0] } : e;
    // "B를 나열할 때": 가능성을 좁히지 않고 대상과 그 조작을 소환한다 → B
    if (OPERATION_VERB.test(e.predicate ?? '')) {
      notes.push(`"${e.clause.text}" — 조작 동사의 목적어이므로 C가 아니라 B(대상 소환)`);
      relations.push({ from: 'B', to: 'Q', type: '조작 소환', evidence: e.clause.text });
      return { ...e, candidates: ['B'], color: 'B', content: e.object };
    }
    notes.push(`"${e.clause.text}" — 조작 동사가 아니므로 C(조건)`);
    return { ...e, candidates: ['C'], color: 'C' };
  });

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
  const colors: FiveColors = {
    Q: qs.map(qDisplay).join('+'),
    qVerbs: unique(qs.map((q) => q.qVerb!).filter(Boolean)),
  };
  if (B) colors.B = B;
  if (join('C')) colors.C = join('C');
  if (join('P')) colors.P = join('P');
  if (join('D')) colors.D = join('D');

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
