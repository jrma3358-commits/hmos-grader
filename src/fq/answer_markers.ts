// 답구하기 · 답표현하기 표지 (오종래 2026-10-19 — deploy/hmos-spec/답구하기_답표현하기_명세서.md)
// 채점 4축 도달 조건 가운데 엔진이 셀 수 있는 것만 본다:
//   수리 답구하기 ② 단위 · ③ 형식 / 인문 답표현하기 ① 논제가 요구한 서술 형식(표지만 — 충족은 판정하지 않는다) · ② 분량 · ④ 완결.
//   수리 ① 결과값 도달 · 인문 ③ 결론-논제 일치는 여기서 보지 않는다.
// 표지 목록은 봉인 표지사전(봉인/표지사전.json 「답구하기」 · 「답표현하기」)에 있다 — 이 파일은 받은 목록으로 찾기만 한다 (불변원칙 4).

export interface AnswerMarkerTable { 단위표지: readonly string[]; 형식표지: readonly string[] }
export interface ExpressMarkerTable { 형식표지: readonly string[]; 완결표지: readonly string[]; 분량기준: string }

export type ValueForm = '벡터' | '행렬' | '분수' | '소수' | '정수';

const 끝부호 = /[\s.!?。"'”’」』)\]]+$/u;

/** 마지막 문장 — 마지막 줄의 마지막 문장 (마침표·물음표·느낌표로 나눈다) */
export function last_sentence(text: string): string {
  const 줄 = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const 끝줄 = 줄.at(-1) ?? '';
  const 문장 = 끝줄.split(/(?<=[.!?。])\s+/).map((t) => t.trim()).filter(Boolean);
  return 문장.at(-1) ?? '';
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 수 바로 뒤에 붙은 단위 표지 — 「3cm」「5 개」. 낱말 안 글자는 단위가 아니다 (「분수」「원인」「개념」). 「3분의 1」의 「분」은 분수 */
export function units_in(text: string, units: readonly string[]): string[] {
  return units.filter((u) => {
    const 뒤 = /^[A-Za-z]/.test(u) ? '(?![A-Za-z])' : u === '분' ? '(?!의)' : '';
    return new RegExp(`\\d\\s*${esc(u)}${뒤}`, 'u').test(text);
  });
}

/** 글 끝의 값 꼴 — 마지막에 나온 값 하나 (벡터 (a, b) · 행렬 · 분수 a/b·「a분의 b」 · 소수 · 정수). 값이 없으면 null */
export function value_form(text: string): ValueForm | null {
  const 값들: { at: number; form: ValueForm }[] = [];
  const 모으기 = (re: RegExp, form: ValueForm) => { for (const m of text.matchAll(re)) 값들.push({ at: (m.index ?? 0) + m[0].length, form }); };
  모으기(/행렬|\[\s*\[/g, '행렬');
  모으기(/벡터|\(\s*-?\d+(?:\.\d+)?\s*(?:,\s*-?\d+(?:\.\d+)?\s*)+\)|<\s*-?\d+(?:\.\d+)?\s*(?:,\s*-?\d+(?:\.\d+)?\s*)+>/g, '벡터');
  모으기(/-?\d+\s*\/\s*\d+|\d+\s*분의\s*\d+/g, '분수');
  모으기(/-?\d+\.\d+/g, '소수');
  모으기(/-?\d+/g, '정수');
  if (!값들.length) return null;
  // 같은 자리에서 끝나면 더 큰 꼴(위에서 먼저 모은 것)을 쓴다 — 「1/2」의 「2」를 정수로 읽지 않는다
  const 끝 = Math.max(...값들.map((v) => v.at));
  return 값들.find((v) => v.at === 끝)!.form;
}

export interface MathAnswerCheck {
  답줄: string;
  단위: { 기준출처: '모범답안' | '논제'; 기준: string[]; 학생: string[]; 맞음: boolean };
  형식: { 요구: string[]; 학생: ValueForm | null; 맞음: boolean };
}

/**
 * 수리 답구하기 ② 단위 · ③ 형식.
 * 단위 — 기준은 모범답안 마지막 문장(없으면 논제)의 단위: 기준에 단위가 있으면 학생 답 마지막 문장에 그 단위가 있어야, 없으면 학생 답에도 없어야 맞다.
 * 형식 — 논제에 형식 표지(「분수」 등)가 있으면 학생 답 끝 값의 꼴이 그 꼴이어야 맞다. 논제에 없으면 따지지 않는다(맞음)
 */
export function check_math_answer(학생답: string, 논제: string, 모범답안: string, table: AnswerMarkerTable): MathAnswerCheck {
  const 답줄 = last_sentence(학생답);
  const 모범끝 = 모범답안.trim() ? last_sentence(모범답안) : '';
  const 기준출처 = 모범끝 ? '모범답안' : '논제';
  const 기준 = units_in(모범끝 || 논제, table.단위표지);
  const 학생 = units_in(답줄, table.단위표지);
  const 단위맞음 = 기준.length ? 학생.some((u) => 기준.includes(u)) : 학생.length === 0;
  const 요구 = table.형식표지.filter((f) => 논제.includes(f));
  const 학생꼴 = value_form(답줄);
  const 형식맞음 = !요구.length || (!!학생꼴 && 요구.includes(학생꼴));
  return { 답줄, 단위: { 기준출처, 기준, 학생, 맞음: 단위맞음 }, 형식: { 요구, 학생: 학생꼴, 맞음: 형식맞음 } };
}

export interface LengthRule { 기준: number; 최소: number | null; 최대: number | null; 근거: string }

/** 논제의 분량 — 「800 ± 80자」 그대로 · 「N자 내외/안팎/정도」·「N자」는 분량기준(봉인 표지사전 답표현하기.분량기준 — 2026-10-23부터 ±25%) · 「N자 이내」는 N까지 · 「N자 이상」은 N부터. 없으면 null */
export function parse_length(논제: string, 분량기준: string): LengthRule | null {
  const 비율 = Number((String(분량기준).match(/(\d+(?:\.\d+)?)\s*%/) || [])[1] ?? NaN) / 100;
  const pm = 논제.match(/(\d[\d,]*)\s*[±]\s*(\d[\d,]*)\s*자/);
  const 수 = (t: string) => Number(t.replace(/,/g, ''));
  if (pm) return { 기준: 수(pm[1]), 최소: 수(pm[1]) - 수(pm[2]), 최대: 수(pm[1]) + 수(pm[2]), 근거: pm[0] };
  const m = 논제.match(/(\d[\d,]*)\s*자\s*(내외|안팎|정도|이내|이하|이상)?/);
  if (!m) return null;
  const n = 수(m[1]);
  if (m[2] === '이내' || m[2] === '이하') return { 기준: n, 최소: null, 최대: n, 근거: m[0] };
  if (m[2] === '이상') return { 기준: n, 최소: n, 최대: null, 근거: m[0] };
  if (!Number.isFinite(비율)) return { 기준: n, 최소: null, 최대: null, 근거: m[0] };
  return { 기준: n, 최소: Math.round(n * (1 - 비율)), 최대: Math.round(n * (1 + 비율)), 근거: `${m[0]} → ${분량기준}` };
}

export interface ExpressAnswerCheck {
  형식: { 요구: string[] };
  분량: { 규칙: LengthRule | null; 글자수: number; 맞음: boolean | null };
  완결: { 마지막문장: string; 표지: string | null; 맞음: boolean };
}

/**
 * 인문 답표현하기 — ① 논제가 요구한 서술 형식 표지(충족은 보지 않는다) · ② 분량(공백 포함 글자 수, 논제에 분량이 없으면 null) ·
 * ④ 완결(마지막 문장이 완결 표지로 끝나는가)
 */
export function check_human_answer(학생답: string, 논제: string, table: ExpressMarkerTable): ExpressAnswerCheck {
  const 요구 = table.형식표지.filter((f) => 논제.includes(f));
  const 규칙 = parse_length(논제, table.분량기준);
  const 글자수 = 학생답.trim().replace(/\r?\n/g, '').length;
  const 분량맞음 = !규칙 || (규칙.최소 == null && 규칙.최대 == null) ? null
    : (규칙.최소 == null || 글자수 >= 규칙.최소) && (규칙.최대 == null || 글자수 <= 규칙.최대);
  const 마지막문장 = last_sentence(학생답);
  const 몸 = 마지막문장.replace(끝부호, '');
  const 표지 = [...table.완결표지].sort((a, b) => b.length - a.length).find((t) => 몸.endsWith(t)) ?? null;
  return { 형식: { 요구 }, 분량: { 규칙, 글자수, 맞음: 분량맞음 }, 완결: { 마지막문장, 표지, 맞음: !!표지 } };
}
