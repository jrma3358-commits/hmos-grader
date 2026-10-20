// C·논술 논제 → 공통 발문 + 소문항 (조립설명서 C·논술 9단계, 2단계 논제 인식의 입구).
//
// [오종래 2026-10-13] 소문항마다 따로 인식한다 — (1-1)·(1-2)를 한 그래프에 그리지 않는다.
// [오종래 2026-10-13] 공통 발문(「제시문 [가], [나], [다]를 참고하여 다음의 물음에 답하시오.」)은 떼어 내고 C-F를 판정한다.
//   공통 발문은 인식에 넣지 않는다. 참조 제시문 범위만 소문항에 물려준다.
// [오종래 2026-10-14] 계단 「(1)(2)(3)」도 따로 인식한다 — 5단계 ② 서술복잡의 처방(소문항 계단)으로 나눈 논제를
//   한 소문항으로 읽으면 B가 다시 셋 이상이 되어 서술복잡이 그대로 남는다. 계단 번호는 「1」, 소문항 안이면 「2-1-1」.
//
// 이 파일이 하지 않는 것:
//   - 인식 (recognizeV2Analysis가 한다)
//   - 계단식 단계형(A·B)의 소문항 분리 — 그건 [봉인⑦]이다. 여기는 C 논제만 본다

import { designatedLabels, PASSAGE_REFERENCE, referenceGroup } from '../fq/v2/passage.ts';
import { condition_blocks, relay_marker, 조건발문re } from './math_essay.ts';

export interface 소문항 {
  /** 「1-1」 같은 번호. 번호 없는 논제 하나면 null */
  번호: string | null;
  /** 인식에 넣을 글 — 번호와 공통 발문을 뗀 소문항 본문 */
  텍스트: string;
  /** 이 소문항이 딸린 문항의 공통 발문 (없으면 빈 문자열) */
  공통발문: string;
  /** 참조 제시문 기호 — 소문항 자신의 참조가 먼저, 없으면 공통 발문의 참조. 둘 다 없으면 빈 배열 (= 모든 제시문) */
  참조: string[];
  /** 텍스트에서 뗀 분량·배점 표기 원문 (「(300자 안팎, 40점)」 등, 여럿이면 공백으로 잇는다). 없으면 빈 문자열 */
  분량배점?: string;
  /** 조건 블록 (들여쓴 (가)(나), 오종래 2026-10-20) — 텍스트에서 뗐다. 있을 때만 */
  조건?: { id: string; 텍스트: string }[];
  /** 이어달리기 참조 표지 (「[1-3]에서 구한」, 오종래 2026-10-20) — 텍스트에서 뗐다. 있을 때만 */
  이어받기?: { 번호: string | null; 표지: string; 대상: string };
  /** 조건 블록·표지를 떼기 전 본문 — 소문항 창 논제를 다시 세울 때 쓴다. 뗀 것이 있을 때만 */
  원문?: string;
  /** 「[문항 N]」 소문항 (오종래 2026-10-20) — 문항 머리 앞 발문 · 문항 자신의 발문 줄. 소문항 창 논제를 다시 세울 때 쓴다 */
  문항?: { 머리발문: string; 발문: string };
}

/**
 * 분량·배점 표기 — 논제 텍스트에서 뗀다. 인식할 실체가 아니다 (오종래 2026-10-19 연세대 인문논술).
 *   (N자 안팎, N점) · (N자 이내, N점) · (N±N자, N점) · 「(총 N점)」만 있는 줄 · [N점]
 * [가정] 「(N자 내외, N점)」도 안팎·이내와 같은 꼴로 뗀다
 * 소문항 배점은 화면이 분량배점에서 읽는다 (기본배점)
 */
const SCORE_NOTE = /[ \t]*(?:\(\s*\d+\s*자\s*(?:안팎|이내|내외)\s*,\s*\d+(?:\.\d+)?\s*점\s*\)|\(\s*\d+\s*±\s*\d+\s*자\s*,\s*\d+(?:\.\d+)?\s*점\s*\)|\[\s*\d+(?:\.\d+)?\s*점\s*\]|^[ \t]*\(\s*총\s*\d+(?:\.\d+)?\s*점\s*\)[ \t]*$)/gm;

/** 글 → 분량·배점 표기를 뗀 글 + 뗀 표기들 */
export function 분량배점떼기(글: string): { 글: string; 뗀것: string[] } {
  const 뗀것: string[] = [];
  const 남은 = 글.replace(SCORE_NOTE, (m) => { 뗀것.push(m.trim()); return ''; });
  return { 글: 남은.replace(/\n{3,}/g, '\n\n').trim(), 뗀것 };
}

/**
 * 소문항 번호 「(1-1)」 · 「2-1」 — 글 머리, 줄 머리, 또는 문장 끝(. ? ! 。) 뒤.
 * [오종래 2026-10-19] 괄호 없는 숫자-숫자형 「2-1」도 — 뒤에 「.」「)」나 공백이 와야 번호다 (「2-1=1」은 아니다)
 * [오종래 2026-10-19 수리논술] 대괄호형 「[2-1]」도
 * [오종래 2026-10-19 가톨릭대] 「논제 1」「논제 2」 — 번호는 「1」「2」. 「문제(논제 1, 논제 2)에」처럼 줄 가운데는 아니다
 * [오종래 2026-10-19 연세대] 대괄호형 「[문제 1]」「[문제 2]」 — 번호는 「1」「2」. 괄호 없는 「문제 N」은 문항 머리(HEAD)다
 */
const ITEM = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*(?:\((\d+-\d+)\)|(\d+-\d+)(?:[.)]|(?=[ \t]))|\[(\d+-\d+)\]|논제[ \t]*(\d+)(?=[ \t.:)]|$)|\[문제[ \t]*(\d+)\])[ \t]*/g;
/**
 * 계단 번호 「(1)」 — 글 머리, 줄 머리, 문장 끝 뒤 (소문항 본문 안에서 찾으므로 소문항 번호 바로 뒤도 글 머리다).
 * 문장 가운데의 「(1)의 변화」는 계단이 아니다.
 * [오종래 2026-10-19] 원문자형 「①②③」 · 대괄호형 「[1][2]」도 같은 자리면 계단이다. 번호는 숫자로 (① → 「1」)
 */
const STEP = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*(?:\((\d+)\)|([①-⑳])|\[(\d+)\])[ \t]*/g;
const stepNo = (m: RegExpMatchArray) => m[1] ?? m[3] ?? String(m[2].charCodeAt(0) - 0x2460 + 1);
const itemNo = (m: RegExpMatchArray) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
/** 문항 머리 「[문항 1]」·「문제 1」·「문항·2」·「문항 2」 — 공통 발문이 여기서 새로 시작한다 (「문항·N」 오종래 2026-10-19 가톨릭대) */
const HEAD = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*(?:\[문항\s*\d+\]|문제\s*\d+|문항[ \t]*[·・.]?[ \t]*\d+)/g;

function 참조of(text: string): string[] {
  const last = [...text.matchAll(PASSAGE_REFERENCE)].at(-1);
  return last ? designatedLabels(referenceGroup(last)) : [];
}

/** 「[문항 N]」 머리 — 줄 머리 (오종래 2026-10-20: C-1a에도 소문항 분리) */
const MUNHANG = /(?:^|(?<=\n))[ \t]*\[문항[ \t]*(\d+)\][ \t]*/g;
/** 「제시문 [가]」「제시문 [다], [라]」 — 뒤에 「를」이 없어도 (「제시문 [가]의 [자료 1]과」「제시문 [나]의 조사에서」) */
const 제시문기호 = /제시문\s*((?:\[[가-하]\](?:\s*(?:[,·~∼～]|및|와|과)\s*(?=\[))?)+)/g;
const 참조모두 = (text: string) => [...text.matchAll(제시문기호)].flatMap((m) => designatedLabels(m[1]));

/**
 * 「[문항 N]」마다 소문항 하나 [오종래 2026-10-20 확정 — C-2에만 쓰던 분리를 C-1a에도] (숭실대 경상계열 스마트폰).
 * 번호 = 「N」. 문항 머리 뒤 첫 줄이 「…물음에 답하시오」면 그 문항의 발문 — 공통 발문(첫 문항 머리 앞 글)에 잇는다.
 * 배점 = 문항 발문 줄 끝의 「(N점)」 → 소문항 분량배점 (본문 안 「(N점)」은 그대로 — 2026-10-19 규칙).
 * 참조 = 문항 발문과 본문이 「제시문 [X]」로 짚은 기호 모두 (발문 → 본문 순)
 * 문항 머리가 하나뿐이면 본문에 계단 「[1][2]」「(1)」이 없을 때만 (소문항 창 논제 — 창논제가 「[문항 N] 발문」 머리째 다시 넣는다)
 */
function 문항으로(text: string, heads: RegExpMatchArray[]): 소문항[] {
  const 머리발문 = text.slice(0, heads[0].index!).trim().replace(/^문제[ \t]*\d+(?:[ \t]*[:：.]|[ \t]+)[ \t]*(?=\S)/, '');
  return heads.flatMap((m, k) => {
    const 몸 = text.slice(m.index! + m[0].length, heads[k + 1]?.index ?? text.length).trim();
    const 줄 = 몸.split('\n');
    const 발문있음 = 줄.length > 1 && /물음에\s*답하시오/.test(줄[0]);
    const 점 = 발문있음 ? (줄[0].match(/[ \t]*\(\s*\d+(?:\.\d+)?\s*점\s*\)[ \t]*$/)?.[0] ?? '') : '';
    const 발문 = 발문있음 ? 줄[0].slice(0, 줄[0].length - 점.length).trim() : '';
    const body = 발문있음 ? 줄.slice(1).join('\n').trim() : 몸;
    const 참조 = [...new Set([...참조모두(발문), ...참조모두(body)])];
    const 공통발문 = [머리발문, 발문].filter(Boolean).join('\n');
    return 계단으로({ 번호: m[1], 텍스트: body, 공통발문, 참조: 참조.length ? 참조 : 참조of(머리발문) })
      .map((u) => ({ ...u, 분량배점: 점.trim(), 문항: { 머리발문, 발문 } }));
  });
}

/**
 * 소문항 하나 → 계단들. 본문에 계단 번호 「(N)」가 없으면 그대로. 있으면 계단마다 한 단위 —
 * 번호 = 「N」(소문항 번호가 있으면 「소문항-N」), 첫 계단 앞 글(계단의 발문)은 공통 발문에 잇는다,
 * 참조 = 계단 자신 → 계단 발문 → 공통 발문 순서.
 */
function 계단으로(u: 소문항): 소문항[] {
  const steps = [...u.텍스트.matchAll(STEP)];
  if (!steps.length) return [u];
  const 발문 = u.텍스트.slice(0, steps[0].index!).trim();
  // 「다음 조건을 모두 만족시키는」 뒤 ①②… 줄은 계단이 아니라 조건 블록 [오종래 2026-10-20 확정] — 나누지 않는다 (split_thesis가 condition_blocks로 뗀다)
  if (조건발문re.test(발문) && steps.every((m) => m[2])) return [u];
  const 공통발문 = [u.공통발문, 발문].filter(Boolean).join('\n');
  // [오종래 2026-10-19] 위 참조는 계단 발문 → 공통 발문에서만 — u.참조는 계단 본문까지 읽은 것이라 뒤 계단의 참조가 앞 계단으로 샌다
  const 위참조 = 참조of(발문).length ? 참조of(발문) : 참조of(u.공통발문);
  return steps.map((m, k) => {
    const body = u.텍스트.slice(m.index! + m[0].length, steps[k + 1]?.index ?? u.텍스트.length).trim();
    const 자기참조 = 참조of(body);
    return { 번호: u.번호 ? `${u.번호}-${stepNo(m)}` : stepNo(m), 텍스트: body, 공통발문, 참조: 자기참조.length ? 자기참조 : 위참조 };
  });
}

/**
 * 논제 → 소문항들. 「(N-M)」 번호가 없으면 논제 전체가 소문항 하나다 (번호 null, 공통 발문 없음).
 * 공통 발문 = 문항 머리(또는 글 처음)부터 그 문항의 첫 소문항 번호 앞까지.
 * 소문항(또는 논제 전체) 안의 계단 「(1)(2)(3)」은 계단마다 나눈다 (계단으로).
 */
export function split_thesis(논제: string): 소문항[] {
  // 분량·배점 표기는 나눈 뒤 소문항마다 뗀다 — 표기가 어느 소문항 것인지 남기려고
  // 조건 블록·이어받기 표지(오종래 2026-10-20 서경대)도 소문항마다 뗀다 — 인식에는 발문만 넣고, 뗀 것은 제약 C로 (math_essay)
  return 나누기(논제).map((u) => {
    const 본문 = 분량배점떼기(u.텍스트), 발문 = 분량배점떼기(u.공통발문);
    const 블록 = condition_blocks(본문.글);
    const 표지 = relay_marker(블록.텍스트);
    const 뗌 = 블록.조건.length > 0 || !!표지.이어받기;
    return {
      ...u, 텍스트: 표지.텍스트, 공통발문: 발문.글, 분량배점: [u.분량배점 ?? '', ...본문.뗀것].filter(Boolean).join(' '),
      ...(블록.조건.length ? { 조건: 블록.조건 } : {}), ...(표지.이어받기 ? { 이어받기: 표지.이어받기 } : {}), ...(뗌 ? { 원문: 본문.글 } : {}),
    };
  });
}

function 나누기(논제: string): 소문항[] {
  const text = 논제.replace(/\r\n?/g, '\n');
  const items = [...text.matchAll(ITEM)];
  // 「[문항 N]」 소문항 — 「(N-M)」 번호가 없을 때 (번호가 있으면 [문항 N]은 공통 발문 머리다)
  const 문항머리 = [...text.matchAll(MUNHANG)];
  if (!items.length && (문항머리.length > 1 || (문항머리.length === 1 && ![...text.matchAll(STEP)].length))) return 문항으로(text, 문항머리);
  if (!items.length) {
    // 「문제 N:」 머리줄 [오종래 2026-10-20 숭실대] — 소문항이 없으면 논제에서 뗀다 (실체가 아니다 — 「문제 2: 오늘날 …」의 B 「문제 2: 오늘날 민주주」)
    const t = text.trim().replace(/^문제[ \t]*\d+(?:[ \t]*[:：.]|[ \t]+)[ \t]*(?=\S)/, '');
    return t ? 계단으로({ 번호: null, 텍스트: t, 공통발문: '', 참조: 참조of(t) }) : [];
  }
  const heads = [...text.matchAll(HEAD)].map((m) => m.index!);

  return items.flatMap((m, k) => {
    const start = m.index! + m[0].length;
    const nextItem = items[k + 1]?.index ?? text.length;
    // 다음 소문항 앞에 문항 머리가 있으면 거기서 끊는다 (다음 문항의 공통 발문)
    const nextHead = heads.find((h) => h >= start && h < nextItem);
    const body = text.slice(start, nextHead ?? nextItem).trim();

    // 공통 발문 — 이 소문항 앞의 마지막 문항 머리(없으면 글 처음)부터, 그 뒤 첫 소문항 번호 앞까지
    const head = heads.filter((h) => h <= m.index!).at(-1) ?? 0;
    const first = items.find((x) => x.index! >= head)!;
    const 공통발문 = text.slice(head, first.index!).trim();

    const 자기참조 = 참조of(body);
    return 계단으로({ 번호: itemNo(m), 텍스트: body, 공통발문, 참조: 자기참조.length ? 자기참조 : 참조of(공통발문) });
  });
}
