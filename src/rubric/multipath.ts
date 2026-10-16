// 수리 서술형 다경로 검증 (오종래 2026-10-16) — ② 세우기 줄 조각을 교사 판정(△) 대신 엔진이 수학적으로 검증한다.
//   원식 = 문항의 이차방정식 ax²+bx+c=0 (수 계수만. 문자 계수(「k」)가 있으면 원식이 없어 △ 그대로)
//   1. 인수분해     (x+p)(x+q)=0 꼴 — 전개가 원식과 같다 (ab=c, a+b=b계수 · 최고차 계수가 있으면 비례로)
//   2. 완전제곱식   (x+p)²=q 꼴 — 전개하면 원식과 같다
//   3. 근의 공식    x=(-b±√(b²-4ac))/2a 에 수를 넣은 식 — 계산한 두 값이 원식의 근과 같다
//   4. 근의 공식 2  x=(-b'±√(b'²-ac))/a 에 수를 넣은 식 — 계산한 두 값이 원식의 근과 같다 (근호 안이 b'²-ac)
//   경로 꼴이 하나라도 검증되면 O(🔆 다경로), 꼴은 있는데 모두 틀리면 X, 아는 꼴이 없으면 판정불가(교사)
// 계산은 작은 산술 해석기로 한다 — eval을 쓰지 않는다. 문자가 섞이면 계산하지 않는다(공식 정의 줄 「(-b±√(b²-4ac))/2a」).

/** 이차식 ax²+bx+c (= 0) */
export interface 이차식 {
  a: number;
  b: number;
  c: number;
}

export type 경로이름 = '인수분해' | '완전제곱식' | '근의 공식' | '근의 공식 2' | '판별식 D' | '판별식 D/4' | '방정식 세우기' | '근과 계수의 관계' | '식 변형' | '인수분해 공식';

export interface 다경로검증 {
  결과: 'O' | 'X' | '판정불가';
  /** 검증된 경로 (O일 때) */
  경로?: 경로이름;
  /** 찾은 경로 꼴 하나하나의 검증 */
  시도: { 경로: 경로이름; 식: string; 맞음: boolean; 까닭: string; 오류?: string }[];
  /** 엔진이 이름 붙인 오류 — 「D와 D/4 혼동 — 공식 불완전 암기」 (2026-10-16) */
  오류?: string;
}

/** D와 D/4 혼동 (오종래 2026-10-16) — b=2b′(짝수 b)인 문항에서 「D=…」로 쓰고 D/4 값을 넣었다 */
export const D혼동오류 = 'D와 D/4 혼동 — 공식 불완전 암기';

const 같다 = (x: number, y: number) => Math.abs(x - y) < 1e-9;
const 정리 = (s: string) =>
  String(s ?? '')
    .replace(/[ \t]+/g, '')
    .replace(/[−–]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^2/g, '²');

// ── 다항식 (x에 대해 2차까지) ──

/** 「x²+2x-3」 「x+3」 「2x-1」 → 계수 [상수, x, x²]. 수 계수만 — 다른 문자가 있으면 null */
export function parse_poly(식: string): [number, number, number] | null {
  const s = 정리(식);
  if (!s || /[^0-9.x²+\-]/.test(s)) return null;
  const 항 = s.match(/[+-]?[^+-]+/g);
  if (!항) return null;
  const 계수: [number, number, number] = [0, 0, 0];
  for (const t of 항) {
    const m = t.match(/^([+-]?)(\d*(?:\.\d+)?)(x²|x)?$/);
    if (!m || (!m[2] && !m[3])) return null;
    const 수 = (m[1] === '-' ? -1 : 1) * (m[2] ? Number(m[2]) : 1);
    계수[m[3] === 'x²' ? 2 : m[3] === 'x' ? 1 : 0] += 수;
  }
  return 계수;
}

/** 문항 글에서 원식 — 「…=0」 앞의 x² 식 (수 계수). 없으면 null */
export function parse_quadratic(글: string): 이차식 | null {
  for (const m of 정리(글).matchAll(/([0-9.x²+\-]*x²[0-9.x²+\-]*)=0/g)) {
    const p = parse_poly(m[1]);
    if (p && p[2] !== 0) return { a: p[2], b: p[1], c: p[0] };
  }
  return null;
}

/** 두 이차식이 비례하는가 (0이 아닌 상수배) — 같은 방정식 */
const 비례 = (u: [number, number, number], 원: 이차식) => {
  const v: [number, number, number] = [원.c, 원.b, 원.a];
  if (u.every((x) => 같다(x, 0))) return false;
  return 같다(u[0] * v[1], u[1] * v[0]) && 같다(u[0] * v[2], u[2] * v[0]) && 같다(u[1] * v[2], u[2] * v[1]);
};

/** 원식의 실근 (작은 것부터). 실근이 없으면 [] */
export function roots(원: 이차식): number[] {
  const D = 원.b * 원.b - 4 * 원.a * 원.c;
  if (D < -1e-12) return [];
  const r = Math.sqrt(Math.max(D, 0));
  return [(-원.b - r) / (2 * 원.a), (-원.b + r) / (2 * 원.a)].sort((x, y) => x - y);
}

// ── 산술 해석기 — 수 · + - * / · 괄호 · √ · ² 만 ──

/** 수식을 계산한다. 문자가 있거나 해석이 안 되면 null, 음수 제곱근은 NaN */
export function evaluate(수식: string): number | null {
  const s = 정리(수식);
  let i = 0;
  const 실패 = () => {
    throw new Error('해석 불가');
  };
  const 식 = (): number => {
    let v = 항();
    while (s[i] === '+' || s[i] === '-') v = s[i++] === '+' ? v + 항() : v - 항();
    return v;
  };
  const 항 = (): number => {
    let v = 인수();
    while (s[i] === '*' || s[i] === '/') v = s[i++] === '*' ? v * 인수() : v / 인수();
    return v;
  };
  const 인수 = (): number => {
    if (s[i] === '-') return i++, -인수();
    if (s[i] === '+') return i++, 인수();
    return 거듭();
  };
  const 거듭 = (): number => {
    let v = 기본();
    // 「²」 「³」 — 세제곱은 q6 「(-1)³」 「(α+β)³」 (2026-10-16)
    while (s[i] === '²' || s[i] === '³') v = s[i++] === '²' ? v * v : v * v * v;
    return v;
  };
  const 기본 = (): number => {
    if (s[i] === '(') {
      i++;
      const v = 식();
      if (s[i++] !== ')') 실패();
      return v;
    }
    if (s[i] === '√') return i++, Math.sqrt(거듭());
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) 실패();
    i += m![0].length;
    return Number(m![0]);
  };
  try {
    const v = 식();
    return i === s.length ? v : null;
  } catch {
    return null;
  }
}

// ── 경로 찾기 ──

/** 학생 답의 마디 — 줄 · 쉼표(괄호 밖) · 「또는」으로 나눈다. 「∴」 뒤 결론도 마디 */
const 마디들 = (답: string) =>
  String(답 ?? '')
    .split(/\r?\n/)
    .flatMap((l) => l.split(/∴/))
    .flatMap((l) => l.split(/[,，](?![^(]*\))/))
    .flatMap((l) => l.split(/또는/))
    .map((x) => x.trim())
    .filter(Boolean);

/** 1. 인수분해 — 「(x+3)(x-1)=0」 「2(x+3)(x-1)=0」 */
function 인수분해(마디: string, 원: 이차식): 다경로검증['시도'][number] | null {
  const m = 정리(마디).match(/^(\d*(?:\.\d+)?)\*?\(([^()]+)\)\*?\(([^()]+)\)=0$/);
  if (!m) return null;
  const k = m[1] ? Number(m[1]) : 1;
  const f = parse_poly(m[2]), g = parse_poly(m[3]);
  if (!f || !g || f[2] || g[2] || !f[1] || !g[1]) return null; // 일차식 둘이어야
  const 전개: [number, number, number] = [k * f[0] * g[0], k * (f[1] * g[0] + f[0] * g[1]), k * f[1] * g[1]];
  const 맞음 = 비례(전개, 원);
  return { 경로: '인수분해', 식: 마디, 맞음, 까닭: 맞음 ? '전개가 원식과 같다' : '전개가 원식과 다르다' };
}

/** 2. 완전제곱식 — 「(x+1)²=4」 「2(x+1)²=8」 */
function 완전제곱식(마디: string, 원: 이차식): 다경로검증['시도'][number] | null {
  const m = 정리(마디).match(/^(\d*(?:\.\d+)?)\*?\(([^()]+)\)²=(.+)$/);
  if (!m) return null;
  const k = m[1] ? Number(m[1]) : 1;
  const f = parse_poly(m[2]), q = evaluate(m[3]);
  if (!f || f[2] || !f[1] || q === null) return null;
  const 전개: [number, number, number] = [k * f[0] * f[0] - q, 2 * k * f[0] * f[1], k * f[1] * f[1]];
  const 맞음 = 비례(전개, 원);
  return { 경로: '완전제곱식', 식: 마디, 맞음, 까닭: 맞음 ? '전개하면 원식과 같다' : '전개하면 원식과 다르다' };
}

/** 3·4. 근의 공식 — 「x=(…±√(…))/…」에 수를 넣은 식. 두 값이 원식의 근과 같은가. 근호 안이 b'²-ac면 근의 공식 2 */
function 근의공식(마디: string, 원: 이차식): 다경로검증['시도'][number] | null {
  const 변 = 정리(마디).split('=');
  if (변.length < 2 || !/^x$/.test(변[0])) return null;
  const 식 = 변.slice(1).find((e) => e.includes('±') && e.includes('√'));
  if (!식) return null;
  const 두값 = [식.replace('±', '+'), 식.replace('±', '-')].map(evaluate);
  if (두값.some((v) => v === null)) return null; // 문자가 섞인 공식 정의 줄 — 경로 꼴이 아니다
  const 근호 = evaluate((식.match(/√(\([^()]*(?:\([^()]*\)[^()]*)*\)|\d+(?:\.\d+)?)/) ?? [])[1] ?? '');
  const 이름: 경로이름 = 근호 !== null && 같다(근호, (원.b / 2) ** 2 - 원.a * 원.c) && !같다(근호, 원.b ** 2 - 4 * 원.a * 원.c) ? '근의 공식 2' : '근의 공식';
  const 근 = roots(원);
  const 값 = (두값 as number[]).sort((x, y) => x - y);
  const 맞음 = 근.length === 2 && 값.every((v, i) => Number.isFinite(v) && 같다(v, 근[i]));
  const 보임 = 값.map((v) => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '허수')).join(', ');
  return { 경로: 이름, 식: 마디, 맞음, 까닭: `계산 값 ${보임} — 원식의 근 ${근.join(', ') || '없음'}과 ${맞음 ? '같다' : '다르다'}` };
}

/** 학생 답에서 다경로 꼴을 찾아 원식으로 검증한다 */
export function verify_multipath(학생답: string, 원: 이차식): 다경로검증 {
  const 시도 = 마디들(학생답).flatMap((d) => [인수분해(d, 원), 완전제곱식(d, 원), 근의공식(d, 원)].filter((x) => x !== null));
  const 맞은 = 시도.find((t) => t.맞음);
  if (맞은) return { 결과: 'O', 경로: 맞은.경로, 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

// ── 판별식 경로 (오종래 2026-10-16 q4 학생 2) — 문자 계수(「k」) 이차방정식의 판별식 D · D/4 ──
//   원식 = 모범답안 세우기 줄의 「x²+2x+k-1=0」 (x 말고 문자 하나). 학생의 「D=… = …」 「D/4=… = …」 사슬의 식마다
//   문자에 여러 값을 넣어 b²-4ac(D) · (b/2)²-ac(D/4)와 같은지 본다. 끝의 「>0」 「<0」 「=0」은 조건이라 떼고 본다

/** 문자 계수 이차방정식 — 식(좌변, 우변 0) · 문자 */
export interface 문자이차식 {
  식: string;
  문자: string;
}

/** 글에서 문자 계수 이차방정식 「…x²…=0」 — x 말고 문자가 꼭 하나. 없으면 null */
export function parse_parametric_quadratic(글: string): 문자이차식 | null {
  for (const m of 정리(글).matchAll(/([^=,，\n]*x²[^=,，\n]*)=0(?![0-9.])/g)) {
    const 문자들 = [...new Set((m[1].match(/[a-wyzA-Z]/g) ?? []))];
    if (문자들.length === 1) return { 식: m[1].replace(/^[^0-9a-zA-Z(+\-]+/, ''), 문자: 문자들[0] };
  }
  return null;
}

/** 식에 값을 넣어 계산 — 문자 · x를 괄호 수로 바꾸고 생략된 곱셈(「2x」 「2(」 「)(」)을 채운다 */
function 넣어계산(식: string, 값: Record<string, number>): number | null {
  let s = 정리(식);
  for (const [k, v] of Object.entries(값)) s = s.replaceAll(k, `(${v})`);
  s = s.replace(/(\d|\)|²|³)\(/g, '$1*(');
  return evaluate(s);
}

/** 문자 값 k에서 원식의 계수 a, b, c — x = 0, 1, -1을 넣어 푼다 */
function 계수at(원: 문자이차식, k: number): 이차식 | null {
  const P = (x: number) => 넣어계산(원.식, { [원.문자]: k, x });
  const p0 = P(0), p1 = P(1), m1 = P(-1);
  if (p0 === null || p1 === null || m1 === null) return null;
  return { a: (p1 + m1) / 2 - p0, b: (p1 - m1) / 2, c: p0 };
}

/** 학생 답의 판별식 사슬을 원식으로 검증한다 — 사슬의 모든 식이 맞으면 맞음 */
export function verify_discriminant(학생답: string, 원: 문자이차식): 다경로검증 {
  const 시료 = [-2.5, 0.7, 3.1];
  const 시도: 다경로검증['시도'] = [];
  // 한글 말 사이의 식도 — 「판별식 D=1-(k+1)>0」 (2026-10-16 q4 학생 3)
  for (const 마디 of 마디들(학생답).flatMap((d) => d.split(/[가-힣]+/)).map((x) => x.trim()).filter(Boolean)) {
    const m = 정리(마디).match(/^D(\/4)?=(.+)$/);
    if (!m) continue;
    const 사등분 = !!m[1];
    const 변 = m[2].split('=');
    변[변.length - 1] = 변[변.length - 1].replace(/[<>≤≥≦≧]0$/, '');
    if (변.length > 1 && 변[변.length - 1] === '0') 변.pop(); // 「…=0」 조건
    const 식들 = 변.filter(Boolean);
    if (!식들.length) continue;
    const 모두 = (기대of: (q: 이차식) => number) =>
      식들.every((e) =>
        시료.every((k) => {
          const q = 계수at(원, k);
          const v = 넣어계산(e, { [원.문자]: k });
          return !!q && v !== null && 같다(v, 기대of(q));
        }),
      );
    const D값 = (q: 이차식) => q.b ** 2 - 4 * q.a * q.c;
    const D4값 = (q: 이차식) => (q.b / 2) ** 2 - q.a * q.c;
    const 맞음 = 모두(사등분 ? D4값 : D값);
    // D와 D/4 혼동 (2026-10-16) — 「D=」로 썼는데 식이 D/4 값이고, b가 문자와 상관없는 짝수(b=2b′)일 때만
    const b들 = 시료.map((k) => 계수at(원, k)?.b);
    // b는 x=±1 값으로 푼 것이라 부동소수 끝수가 있다 — 반올림한 정수와 같고 짝수인지로 본다
    const 짝수b = b들.every((b) => b !== undefined && 같다(b, b들[0]!) && 같다(b, Math.round(b)) && Math.round(b) % 2 === 0);
    const 혼동 = !맞음 && !사등분 && 짝수b && 모두(D4값);
    시도.push({
      경로: 사등분 ? '판별식 D/4' : '판별식 D',
      식: 마디,
      맞음,
      까닭: 혼동
        ? `D/4를 D로 표기 오류 — 식이 (b/2)²-ac(D/4) 값이다 (원식 ${원.식}=0)`
        : 맞음 ? `${사등분 ? '(b/2)²-ac' : 'b²-4ac'}와 같다 (원식 ${원.식}=0)` : `${사등분 ? '(b/2)²-ac' : 'b²-4ac'}와 다르다 (원식 ${원.식}=0)`,
      ...(혼동 ? { 오류: D혼동오류 } : {}),
    });
  }
  const 맞은 = 시도.find((t) => t.맞음);
  if (맞은) return { 결과: 'O', 경로: 맞은.경로, 시도 };
  const 오류 = 시도.find((t) => t.오류)?.오류;
  return { 결과: 시도.length ? 'X' : '판정불가', 시도, ...(오류 ? { 오류 } : {}) };
}

// ── 방정식 세우기 검증 (오종래 2026-10-16 q4 학생 2) — 학생이 세운 이차방정식(「x²+2x+k-1=0」 「-x+1=x²+x+k」)이
//   원식과 같은 방정식인가: (좌변 - 우변)이 원식의 0 아닌 상수배인지 x · 문자에 여러 값을 넣어 본다.
//   모범답안과 같은 경로(방정식 세우기)라 🔆 다경로가 아니다

/** 마디 안 한글 말(「에서」 「이므로」)에서도 나눈다 — 「x²+x+k=-x+1에서 x²+2x+k-1=0」 → 식 둘 */
const 식마디들 = (답: string) => 마디들(답).flatMap((d) => d.split(/[가-힣]+/)).map((x) => x.trim()).filter(Boolean);

export function verify_equation(학생답: string, 원: 문자이차식): 다경로검증 {
  const 점들 = [-2, 0.5, 1.7, 3].flatMap((x) => [-1.3, 0.6, 2.2].map((k) => ({ x, k })));
  const G = (p: { x: number; k: number }) => 넣어계산(원.식, { [원.문자]: p.k, x: p.x });
  const 시도: 다경로검증['시도'] = [];
  for (const 마디 of 식마디들(학생답)) {
    const s = 정리(마디);
    if (!s.includes('x²') || /^D/.test(s)) continue; // 판별식 줄은 아니다
    const 변 = s.split('=');
    if (변.length !== 2 || !변[0] || !변[1]) continue;
    const F = (p: { x: number; k: number }) => {
      const l = 넣어계산(변[0], { [원.문자]: p.k, x: p.x }), r = 넣어계산(변[1], { [원.문자]: p.k, x: p.x });
      return l === null || r === null ? null : l - r;
    };
    if (점들.some((p) => F(p) === null)) continue; // 다른 문자가 섞였다 — 이 원식의 식이 아니다
    const 기준 = 점들.find((p) => !같다(G(p) ?? 0, 0))!;
    const λ = F(기준)! / G(기준)!;
    const 맞음 = !같다(λ, 0) && 점들.every((p) => 같다(F(p)!, λ * G(p)!));
    시도.push({ 경로: '방정식 세우기', 식: 마디, 맞음, 까닭: 맞음 ? `원식 ${원.식}=0과 같은 방정식` : `원식 ${원.식}=0과 다른 방정식` });
  }
  const 맞은 = 시도.find((t) => t.맞음);
  if (맞은) return { 결과: 'O', 경로: 맞은.경로, 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

// ── 수학 문항 계열 고정 (오종래 2026-10-16) — 수학 문항은 수리 계열로만 채점한다 ──
//   수학 문항 = 등호가 있고 x 항(「x²」 「2x」 「+x」 「x=」)이 있는 식이 문항 글에 있다.
//   식 하나만으로는 보지 않는다 — 인문사회 논술(경제 「Q=100-2P」)에도 식이 나온다

export const 계열오류글 = '이 문항은 수리 계열로 채점해야 합니다';

export function is_math_item(글: string): boolean {
  const s = 정리(글);
  return /=/.test(s) && /(?<![a-zA-Z])x(?:²|[=+\-<>*/)])|\dx(?![a-zA-Z])|[=+\-(*/]x(?![a-zA-Z])/.test(s);
}

/** 요청 계열 → 실제 계열. 「자동」이면 수학 문항은 수리, 아니면 인문사회국어. 인문사회국어로 수학 문항을 넣으면 계열오류 */
export function resolve_subject(요청: unknown, 글: string): '수리' | '인문사회국어' {
  const 수학 = is_math_item(글);
  if (요청 === '자동') return 수학 ? '수리' : '인문사회국어';
  const 계열 = 요청 === '수리' ? '수리' : '인문사회국어';
  if (계열 === '인문사회국어' && 수학) throw Object.assign(new Error(계열오류글), { name: '계열오류' });
  return 계열;
}

// ── 근과 계수의 관계 · 식 변형 (오종래 2026-10-16 q6) ──
//   ③ 근과 계수의 관계 — 학생의 「α+β=…」 「αβ=…」 값이 원식 계수에서 나온 -b/a · c/a와 같은가
//   ④ 식 변형 — 양변에 α · β가 있는 등식(「α³+β³=(α+β)³-3αβ(α+β)」)에 수를 넣어 양변이 같은가 (항등식)
//   ② 세우기 줄 조각은 모범 줄의 꼴로 검증을 고른다 (verify_setup): 근과 계수 줄 · 식 변형 줄 · 그 밖(풀이 경로 — 인수분해 등)

const 근문자 = /[αβ]/;

/** α · β에 수를 넣어 계산 — 생략된 곱셈(「3αβ」 「αβ(」 「)(」)을 채운다 */
function 근넣어계산(식: string, a: number, b: number): number | null {
  let s = 정리(식).replace(/α/g, `(${a})`).replace(/β/g, `(${b})`);
  s = s.replace(/(\d|\)|²|³)\(/g, '$1*(');
  return evaluate(s);
}

export function verify_vieta(학생답: string, 원: 이차식): 다경로검증 {
  const 합 = -원.b / 원.a, 곱 = 원.c / 원.a;
  const 시도: 다경로검증['시도'] = [];
  for (const 마디 of 식마디들(학생답)) {
    const s = 정리(마디);
    const m = s.match(/^(α\+β|β\+α|αβ|βα|α\*β)=(.+)$/);
    if (!m) continue;
    const v = evaluate(m[2]);
    if (v === null) continue;
    const 기대 = /\+/.test(m[1]) ? 합 : 곱;
    const 맞음 = 같다(v, 기대);
    시도.push({ 경로: '근과 계수의 관계', 식: 마디, 맞음, 까닭: `${/\+/.test(m[1]) ? '-b/a' : 'c/a'} = ${기대} 과 ${맞음 ? '같다' : '다르다'}` });
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '근과 계수의 관계', 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

/**
 * 공식 부호 오기억 — 오른변의 맨 바깥 항(괄호 밖 +/-로 나뉜 항) 하나의 부호만 바꿔 항등식이 되면 그 항을 낸다.
 * 보이는 항은 계수 · 문자까지(뒤 괄호는 뗀다): 「+3αβ(α+β)」 → 「+3αβ」 → 「-3αβ」
 */
function 부호하나고침(왼: string, 오른: string, 표본: number[][]): { 원래: string; 고친: string } | null {
  let 깊이 = 0;
  const 자리: number[] = [];
  for (let i = 0; i < 오른.length; i++) {
    const ch = 오른[i];
    if (ch === '(') 깊이++;
    else if (ch === ')') 깊이--;
    else if ((ch === '+' || ch === '-') && 깊이 === 0 && i > 0) 자리.push(i);
  }
  for (const i of 자리) {
    const 바꾼 = 오른.slice(0, i) + (오른[i] === '+' ? '-' : '+') + 오른.slice(i + 1);
    const 같음 = 표본.every(([a, b]) => {
      const l = 근넣어계산(왼, a, b), r = 근넣어계산(바꾼, a, b);
      return l !== null && r !== null && 같다(l, r);
    });
    if (!같음) continue;
    const 끝 = 자리.find((j) => j > i) ?? 오른.length;
    const 항 = 오른.slice(i, 끝).replace(/\(.*$/, '');
    return { 원래: 항, 고친: (항[0] === '+' ? '-' : '+') + 항.slice(1) };
  }
  return null;
}

/** 식 변형의 꼴 이름 (2026-10-16 q6 학생 3) — 오른변이 두 괄호의 곱 「(α+β)(α²-αβ+β²)」이면 인수분해 공식, 그 밖은 식 변형 */
const 공식이름 = (오른: string): 경로이름 => (/^\([^()]*\)\([^()]*\)$/.test(오른) ? '인수분해 공식' : '식 변형');

export function verify_identity(학생답: string): 다경로검증 {
  const 표본 = [[1.3, -0.7], [2.1, 0.4], [-1.6, 2.9]];
  const 시도: 다경로검증['시도'] = [];
  for (const 마디 of 식마디들(학생답)) {
    const 변 = 정리(마디).split('=');
    // 이웃한 두 변이 모두 α · β를 품은 등식만 — 「α+β=-1」은 값이지 변형이 아니다
    for (let i = 0; i + 1 < 변.length; i++) {
      if (!근문자.test(변[i]) || !근문자.test(변[i + 1])) continue;
      const 계산됨 = 표본.map(([a, b]) => [근넣어계산(변[i], a, b), 근넣어계산(변[i + 1], a, b)]);
      if (계산됨.some(([l, r]) => l === null || r === null)) continue;
      const 맞음 = 계산됨.every(([l, r]) => 같다(l!, r!));
      // 틀렸으면 — 오른변의 항 하나의 부호만 바꿔 항등식이 되는지 본다 (공식 부호 오기억, 2026-10-16 q6 학생 2)
      const 고침 = 맞음 ? null : 부호하나고침(변[i], 변[i + 1], 표본);
      시도.push({
        경로: 공식이름(변[i + 1]), 식: `${변[i]}=${변[i + 1]}`, 맞음,
        까닭: 맞음 ? 'α · β에 수를 넣어도 양변이 같다 (항등식)' : 고침 ? `수를 넣으면 양변이 다르다 — ${고침.원래}를 ${고침.고친}로 바꾸면 항등식` : '수를 넣으면 양변이 다르다',
        ...(고침 ? { 오류: `${변[i]} 공식 부호 오류 — ${고침.원래} → ${고침.고친}` } : {}),
      });
    }
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: 시도[0].경로, 시도 };
  const 오류 = 시도.find((t) => t.오류)?.오류;
  return { 결과: 시도.length ? 'X' : '판정불가', 시도, ...(오류 ? { 오류 } : {}) };
}

/** ② 세우기 줄 조각 검증 — 모범 줄의 꼴로 고른다: 근과 계수 줄 · 식 변형 줄 · 그 밖은 풀이 경로(verify_multipath) */
export function verify_setup(모범줄: string, 학생답: string, 원: 이차식): 다경로검증 {
  if (verify_vieta(모범줄, 원).시도.length) return verify_vieta(학생답, 원);
  if (verify_identity(모범줄).시도.length) return verify_identity(학생답);
  return verify_multipath(학생답, 원);
}

// ── 풀기 계산 검증 (오종래 2026-10-16) — 학생 계산 줄의 「=」 앞뒤 값이 같은가 ──
//   한 줄의 「A=B=C」에서 이웃한 두 변을, 「=」로 시작하는 줄은 앞 줄의 마지막 변과 이어 본다.
//   두 변이 모두 수로 계산되는 짝만 본다 — 문자식(「x+3=0」 「-4k+8>0」 「α+β」)은 계산하지 않는다.
//   수로 계산되는 짝이 모두 같으면 O, 하나라도 다르면 X, 계산되는 짝이 없으면 판정불가(교사)

export interface 계산검증 {
  결과: 'O' | 'X' | '판정불가';
  짝: { 왼: string; 오른: string; 같음: boolean }[];
}

export function verify_calculation(학생답: string): 계산검증 {
  const 짝: 계산검증['짝'] = [];
  let 앞끝 = '';
  for (const 줄 of String(학생답 ?? '').split(/\r?\n/)) {
    // 「또는」으로 이은 두 등식(「x=1 또는 x=-3」)은 한 사슬이 아니다 — 쉼표처럼 나눈다
    for (const 마디 of 줄.replace(/∴/g, ',').split(/[,，](?![^(]*\))|또는/).map((x) => x.trim()).filter(Boolean)) {
      if (!마디.includes('=')) continue;
      const 변 = 마디.split('=').map((x) => x.trim().replace(/[가-힣].*$/, '').trim());
      if (변[0] === '' && 앞끝) 변[0] = 앞끝; // 「= …」 — 앞 줄 마지막 변에 이어서
      for (let i = 0; i + 1 < 변.length; i++) {
        if (!변[i] || !변[i + 1]) continue;
        const l = evaluate(변[i]), r = evaluate(변[i + 1]);
        if (l === null || r === null || !Number.isFinite(l) || !Number.isFinite(r)) continue;
        짝.push({ 왼: 변[i], 오른: 변[i + 1], 같음: 같다(l, r) });
      }
      앞끝 = 변.at(-1) ?? 앞끝;
    }
  }
  if (!짝.length) return { 결과: '판정불가', 짝 };
  return { 결과: 짝.every((p) => p.같음) ? 'O' : 'X', 짝 };
}
