// 서술형 B 교사 모범답안 → ③ 풀기 줄 (오종래 2026-10-16) — 교사는 라벨 없이 줄바꿈으로 쓰기만 한다.
// ①②④ 조각은 엔진 F2 그대로. 풀기 = 세우기 이후 ~ 답구하기 이전 구간, 줄 하나 = 풀기 조각 하나 (인식결과.교사풀기 → 봉인2_풀기).
//   답 줄     = 엔진 ④ 급소 K 핵심어가 마지막으로 나온 줄 — 없으면 마지막 줄 (오종래 2026-10-16)
//   세우기 끝 = 답 줄 앞에서 엔진 ② 세우기 조각의 실체(단락 급소·노드)가 마지막으로 나온 줄
//              (답 줄을 먼저 잡는다 — 세우기 실체는 대개 논제 주어라 답 줄에도 나온다, 오종래 2026-10-16 보완)
//   풀기      = 그 사이의 빈 줄 아닌 줄들
import type { 모범답, 조각뼈대 } from './types.ts';
import { evaluate } from './multipath.ts';

export interface 풀기구간 {
  /** 빈 줄을 뺀 줄 수 */
  줄수: number;
  /** 세우기 끝 줄 (1부터). 세우기 실체가 답 줄 앞 어느 줄에도 없으면 null — 첫 줄까지를 앞 구간으로 본다 */
  세우기끝: number | null;
  /** 답 시작 줄 (1부터) */
  답줄: number;
  /** 답 줄의 글 — 정답 검증(teacher_input.ts)이 대조한다 */
  답글: string;
  /** K 핵심어가 나오는 줄이 없어 마지막 줄을 답으로 보았다 */
  답대체: boolean;
  풀기: string[];
}

/** 조건에 맞는 마지막 줄의 번호 (0부터), 없으면 -1 */
const 마지막 = (줄: string[], f: (l: string) => boolean) => {
  for (let i = 줄.length - 1; i >= 0; i--) if (f(줄[i])) return i;
  return -1;
};

const 깨끗이 =(t: string | null | undefined) => String(t ?? '').trim().replace(/^[,，]\s*/, '');

/** 세우기 조각의 실체 — 인문은 근거 문장의 단락 급소, 수리 구조면 노드 */
const 세우기실체 = (c: 조각뼈대) => 깨끗이(c.근거?.단락급소 ?? c.node?.entity);
/** 답구하기 조각의 급소 글자 — 경로 K 핵심어, 없으면 K 실체 · 노드 */
const 답글자 = (c: 조각뼈대) => {
  const K = c.경로?.length ? c.경로[c.경로.length - 1] : null;
  return 깨끗이(K ? K.핵심어 || K.실체 : c.node?.entity);
};

export function split_solve_lines(답안: string, 조각들: 조각뼈대[]): 풀기구간 {
  const 줄 = String(답안 ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const 세우기 = 조각들.filter((c) => c.파트 === '세우기').map(세우기실체).filter(Boolean);
  const 답 = 조각들.filter((c) => c.파트 === '답구하기').map(답글자).filter(Boolean);
  let 답i = 마지막(줄, (l) => 답.some((t) => l.includes(t)));
  const 답대체 = 답i < 0;
  if (답대체) 답i = 줄.length - 1;
  const 끝 = 마지막(줄.slice(0, Math.max(답i, 0)), (l) => 세우기.some((t) => l.includes(t)));
  // 세우기 실체가 답 줄 앞 어느 줄에도 없으면 첫 줄까지를 앞 구간(근거·세우기)으로 본다
  const 앞끝 = 끝 >= 0 ? 끝 : 0;
  return {
    줄수: 줄.length,
    세우기끝: 끝 >= 0 ? 끝 + 1 : null,
    답줄: 답i + 1,
    답글: 줄[답i] ?? '',
    답대체,
    풀기: 답i > 앞끝 ? 줄.slice(앞끝 + 1, 답i) : [],
  };
}

// ── 수리 모범답안 줄 나누기 (오종래 2026-10-16 q5) — 계열 수리만. 인문 서술형 B는 위 split_solve_lines 그대로 ──
//   「~하면」으로 끝나는 줄 → ① 근거대기
//   「∴」 결론 줄          → ④ 답구하기 (모범 값 = 그 줄의 「x=값」들, 학생 답 값과 직접 대조)
//   식 세우는 줄 (등식)    → ② 세우기
//   ③ 풀기는 없다 — 인수분해처럼 세우기가 곧 풀기 (세우기=풀기)
//   어느 것에도 들지 않는 줄은 조각을 내지 않고 미분류로 보인다

export interface 수리줄나누기 {
  근거대기: string[];
  세우기: string[];
  /** 「또는」으로 이은 등식 마디 (2026-10-16 학생 1) — 없으면 세우기=풀기 */
  풀기: string[];
  답: 모범답 | null;
  미분류: string[];
}

/**
 * 줄 중간 「∴」 (오종래 2026-10-16 q4 ③) — 「D=-4k+8=0 ∴ k=2」의 「∴」 뒤도 결론이다. 앞(「D=-4k+8=0」)과 결론(「∴ k=2」)으로 나눈다.
 * 「∴」가 없으면 결론 null
 */
export function split_conclusion(줄: string): { 앞: string; 결론: string | null } {
  const i = 줄.indexOf('∴');
  return i < 0 ? { 앞: 줄, 결론: null } : { 앞: 줄.slice(0, i).trim(), 결론: 줄.slice(i).trim() };
}

/** 비교 기호 — 등호 · 부등호 (오종래 2026-10-16 q4 ②). 「<=」「≦」는 「≤」로, 「>=」「≧」는 「≥」로 맞춘다 */
const 비교 = '(?:<=|>=|[=<>≤≥≦≧])';
const 기호맞춤 = (op: string) => ({ '<=': '≤', '≦': '≤', '>=': '≥', '≧': '≥' } as Record<string, string>)[op] ?? op;
const 값꼴 = new RegExp(`([A-Za-z](?:_?\\w)?)(${비교})(.+?)(?=또는|이다|입니다|[,，.。]|[A-Za-z](?:_?\\w)?${비교}|$)`, 'g');

/**
 * 결론 줄의 「x=값」들 — 띄어쓰기 무시, 「또는」·쉼표로 나뉜다. 값은 숫자면 수로 맞춘 글자 (1/2 = 0.5)
 * [오종래 2026-10-16 q4 ②] 부등식 답도 — 「k<2」 「k>2」 「k≥1」은 기호째 값이다 (「k<2」 ≠ 「k>2」 ≠ 「k=2」)
 */
export function answer_values(줄: string): string[] {
  const s = String(줄 ?? '').replace(/∴/g, '').replace(/\s+/g, '').replace(/[−–]/g, '-');
  const 값 = [...s.matchAll(값꼴)].flatMap((m) => 복부호(m[3]).map((v) => `${m[1]}${기호맞춤(m[2])}${수맞춤(v)}`));
  return [...new Set(값)].sort();
}

/** 「a±b」(수)는 두 값 a+b · a-b로 편다 — 완전제곱식 풀이 「x=-1±2」 = 「x=1 또는 x=-3」 (2026-10-16 학생 3). 수가 아니면 그대로 */
function 복부호(v: string): string[] {
  const m = v.match(/^\(?(-?\d+(?:\.\d+)?)\)?±\(?(\d+(?:\.\d+)?)\)?$/);
  if (!m) return [v];
  const [a, b] = [Number(m[1]), Number(m[2])];
  return [String(a + b), String(a - b)];
}

/** 「-3/2」 「0.5」 「3」 같은 수는 수로 맞춘다 — 아니면 글자 그대로 */
function 수맞춤(v: string): string {
  const m = v.match(/^\(?(-?\d+(?:\.\d+)?)\)?(?:\/\(?(-?\d+(?:\.\d+)?)\)?)?$/);
  if (!m) return v;
  const n = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
  return Number.isFinite(n) ? String(Math.round(n * 1e9) / 1e9) : v;
}

// [오종래 2026-10-16 학생 1] 풀기 조각이 명시적으로 있으면 엔진이 잡는다 — 인수분해 문항이라도.
//   풀기 조각 = 「또는」으로 이은 등식들 (「x+3=0 또는 x-1=0」). 한 줄에 세우기와 함께 쉼표로 이어 써도
//   (「(x+3)(x-1)=0, x+3=0 또는 x-1=0」) 쉼표 마디마다 본다. 「∴」 결론 줄은 풀기가 아니다
// [오종래 2026-10-16] ±가 있는 등식도 풀기 조각 (「x+1=±√4」 「x=-1±2」) — 완전제곱식 풀이
// [오종래 2026-10-16] 「~하면」 「~이므로」로 끝나는 마디는 풀기가 아니다 — 풀기는 등식 · 계산 결과 줄만
//   (「근의 공식을 이용하면 x = (-b ± √(b²-ac)) / a 이므로」는 공식을 적은 근거 문장)
// [오종래 2026-10-16 q4] 조건 문장(「서로 다른 두 점에서 만나므로 D>0에서」 — 「~에서」로 끝나는 줄)도 풀기가 아니다
const 근거끝 = /(하면|이므로|에서)[\s,，.]*$/;
// [오종래 2026-10-16] 숫자 없이 문자로만 된 등식(「x = (-b'±√(b'²-ac)) / a」)은 공식 정의 — 풀기가 아니다.
//   풀기는 실제 숫자(0-9)가 들어간 계산 줄만. 위첨자 「²」는 숫자로 세지 않는다 (지수 표기라 공식에도 나온다)
// [오종래 2026-10-16] 근의 공식 패턴 — 「(-b±√…)」 「(-b'±√…)」 꼴 등식은 숫자(4·2)가 있어도 공식이다 (「x=(-b±√(b²-4ac))/2a」)
const 근의공식 = /\(\s*-\s*b\s*['′’]?\s*±\s*√/;
// [오종래 2026-10-16 q4 ④] 부등식 계산 줄도 풀기 — 「-4k+8>0」 (등호 없는 부등식). 「D=2²-4×1×(k-1)>0」처럼 등호가 있으면 식 세우기 그대로
const 부등식계산 = (마디: string) => /[<>≤≥≦≧]/.test(마디) && !/=/.test(마디);
// [오종래 2026-10-16 q4 학생 2] 「D/4=…」 꼴도 풀기 — 등식(「D/4=-k+2=0」) · 부등식(「D/4=1-(k-1)=-k+2>0」) 모두
const D4계산 = (마디: string) => /^D\s*\/\s*4\s*=/.test(마디);
// [오종래 2026-10-16 q6 ②] 「=」로 시작하는 계산 줄도 풀기 — 「= (-1)³-3×(-2)×(-1)」 「= -1-6=-7」 (앞 줄 식을 이어 계산)
const 이어계산 = (마디: string) => /^=/.test(마디);
// [오종래 2026-10-16 q7 ④] 수 계산 사슬이 있는 줄도 풀기 — 「R=f(-1)=1-2-7=-8」 (이웃한 두 변이 모두 수로 계산된다)
const 수계산 = (마디: string) => {
  const 변 = 마디.split('=').map((x) => x.trim());
  return 변.some((e, i) => i + 1 < 변.length && e !== '' && 변[i + 1] !== '' && evaluate(e) !== null && evaluate(변[i + 1]) !== null);
};
const 풀기마디 = (마디: string) =>
  !근거끝.test(마디) && !근의공식.test(마디) && /[0-9]/.test(마디) &&
  ((/또는/.test(마디) && (마디.match(/=/g) ?? []).length >= 2) || (/±/.test(마디) && /=/.test(마디)) || 부등식계산(마디) || D4계산(마디) || 이어계산(마디) || 수계산(마디));
const 마디들 = (줄: string) => 줄.split(/[,，](?![^(]*\))/).map((x) => x.trim()).filter(Boolean);

/** 글에서 풀기 조각 — 줄마다 「∴」 앞만(결론은 풀기가 아니다, 줄 중간 「∴」도 q4 ③), 쉼표 마디 중 풀기 마디 */
export function solve_segments(글: string): string[] {
  return String(글 ?? '').split(/\r?\n/).map((l) => split_conclusion(l.trim()).앞).filter(Boolean).flatMap(마디들).filter(풀기마디);
}

/** 문항 글에 홀로 쓰인 문자들(「x」 「a」 「R」) — 답 값이 될 수 있는 문자 (「D」 「f」처럼 풀이에만 나오는 문자는 아니다) */
export const question_letters = (문항글: string) =>
  new Set([...String(문항글 ?? '').matchAll(/(?<![A-Za-z])([A-Za-z])(?![A-Za-z])/g)].map((m) => m[1]));

/** 한 줄의 답 값 — 「∴」 결론, 아니면 「R=f(-1)=1-2-7=-8」처럼 문자 하나로 시작해 수로 끝나는 줄 (q7 ①) */
export function line_answer_values(줄: string): string[] {
  const { 결론 } = split_conclusion(줄);
  if (결론) return answer_values(결론);
  const m = 줄.trim().match(/^([A-Za-z])\s*=/);
  const v = m ? final_value(줄) : null;
  return m && v !== null ? [`${m[1]}=${v}`] : [];
}

/** @param 문항글 주면 — 「∴」 결론 말고도 문항 문자로 시작해 수로 끝나는 줄을 답 값에 더한다 (답이 둘인 문항, q7 ①) */
export function classify_math_lines(답안: string, 문항글?: string): 수리줄나누기 {
  const 줄 = String(답안 ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: 수리줄나누기 = { 근거대기: [], 세우기: [], 풀기: [], 답: null, 미분류: [] };
  for (const 원줄 of 줄) {
    // 줄 중간 「∴」 — 뒤는 결론, 앞은 여느 줄처럼 (q4 ③)
    const { 앞: l, 결론 } = split_conclusion(원줄);
    if (결론) out.답 = { 줄: 결론, 값: answer_values(결론) }; // 결론이 여럿이면 마지막
    if (!l) continue;
    // [오종래 2026-10-16 q7 ⑤] 「~로 놓으면」(「f(x)=x²+2x+a로 놓으면」)도 ① 근거대기
    if (/(하면|로\s*놓으면)[\s,，.]*$/.test(l)) out.근거대기.push(l);
    // [오종래 2026-10-16 q6 ⑥] 「~이므로」로 끝나는 등식 줄(「x²+x-2=0의 두 근이 α, β이므로」)은 세우기가 아니다 — 미분류
    else if (/=/.test(l) && /이므로[\s,，.]*$/.test(l)) out.미분류.push(l);
    else if (/=/.test(l)) {
      // 쉼표 마디 — 풀기 마디는 ③ 풀기, 나머지 등식 마디는 한데 묶어 ② 세우기
      const 풀기 = 마디들(l).filter(풀기마디);
      const 세우기 = 마디들(l).filter((x) => !풀기마디(x));
      out.풀기.push(...풀기);
      if (세우기.length) out.세우기.push(풀기.length ? 세우기.join(', ') : l);
    } else if (마디들(l).some(풀기마디)) {
      // 등호 없는 부등식 계산 줄 (q4 ④) — 풀기 마디는 ③, 나머지 마디는 미분류
      out.풀기.push(...마디들(l).filter(풀기마디));
      const 남은 = 마디들(l).filter((x) => !풀기마디(x));
      if (남은.length) out.미분류.push(남은.join(', '));
    } else out.미분류.push(l);
  }
  // [오종래 2026-10-16 q6 ①] 「∴」 줄이 없으면 「=」가 있는 마지막 줄의 끝 값(수)이 답 — 「= -1-6=-7」 → -7
  // [오종래 2026-10-16 q7 ①] 답이 둘인 문항 — 「∴ a=-7」 말고 「R=f(-1)=…=-8」도 답 값 (문항에 나오는 문자만)
  if (문항글) {
    const 문자 = question_letters(문항글);
    const 더 = 줄.filter((l) => !l.includes('∴')).flatMap(line_answer_values).filter((v) => 문자.has(v.match(/^[A-Za-z]/)?.[0] ?? ''));
    if (더.length) {
      const 값 = [...new Set([...(out.답?.값 ?? []), ...더])].sort();
      out.답 = { 줄: out.답 ? `${out.답.줄} · ${더.join(', ')}` : 더.join(', '), 값 };
    }
  }
  if (!out.답) {
    const 끝줄 = 줄.filter((l) => l.includes('=')).at(-1);
    const v = 끝줄 ? final_value(끝줄) : null;
    if (끝줄 && v !== null) out.답 = { 줄: 끝줄, 값: [v], 끝값: true };
  }
  return out;
}

/** 줄 끝 값 — 마지막 「=」 뒤가 수이면 그 수(1/2 = 0.5로 맞춘 글자), 아니면 null (2026-10-16 q6) */
export function final_value(줄: string): string | null {
  const 뒤 = String(줄 ?? '').replace(/∴/g, '').split('=').at(-1)!.replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[.。]$/, '');
  if (!뒤) return null;
  const v = 수맞춤(뒤);
  return /^-?\d+(\.\d+)?$/.test(v) ? v : null;
}

/** 학생 답의 결론 — 「∴」가 있는 마지막 줄의 「∴」부터(줄 중간 「∴」도, q4 ③), 없으면 「=」가 있는 마지막 줄, 그것도 없으면 답 전체 */
export function student_answer_line(학생답: string): string {
  const 줄 = String(학생답 ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const 결론줄 = 줄.filter((l) => l.includes('∴')).at(-1);
  return 결론줄 ? split_conclusion(결론줄).결론! : (줄.filter((l) => l.includes('=')).at(-1) ?? 줄.join(' '));
}
