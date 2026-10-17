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

export type 경로이름 = '인수분해' | '완전제곱식' | '근의 공식' | '근의 공식 2' | '판별식 D' | '판별식 D/4' | '방정식 세우기' | '근과 계수의 관계' | '식 변형' | '인수분해 공식' | '근의 성질(차수 낮추기)' | '근 직접 대입' | '나머지 정리' | '직접 나눗셈' | '인수분해 역산' | '몫·나머지꼴' | '경우의 수 식' | '경우 나누기';

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

// ── 산술 해석기 — 수 · + - * / · 괄호 · √ · ² · 계승 「n!」 · 순열 「nPr」 · 조합 「nCr」 (2026-10-17 q3) ──

/** n! — 0 이상 정수만, 아니면 NaN */
const 계승 = (n: number) => {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let v = 1;
  for (let i = 2; i <= n; i++) v *= i;
  return v;
};

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
    // 「²」 「³」 — 세제곱은 q6 「(-1)³」 「(α+β)³」 (2026-10-16) · 「!」 계승은 나눗셈보다 먼저 — 「1/2!」 = 1/(2!) (2026-10-17 q3)
    while (s[i] === '²' || s[i] === '³' || s[i] === '!') v = s[i] === '!' ? (i++, 계승(v)) : s[i++] === '²' ? v * v : v * v * v;
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
    // 「3P2」 순열 · 「5C2」 조합 (2026-10-17 q3)
    const pc = /^([PC])(\d+)/.exec(s.slice(i));
    if (pc) {
      i += pc[0].length;
      const n = Number(m![0]), r = Number(pc[2]);
      if (!Number.isInteger(n) || r > n) return NaN;
      const 순열 = 계승(n) / 계승(n - r);
      return pc[1] === 'P' ? 순열 : 순열 / 계승(r);
    }
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
  // 「x²」 「x³」 다항식은 등호가 없어도 수학 문항 — 「다항식 x²+2x+a를 x-2로 나누었을 때」 (q7, 2026-10-16)
  if (/(?<![a-zA-Z])x[²³]/.test(s)) return true;
  // 경우의 수 · 확률 · 순열 「3P2」 · 조합 「5C2」 · 계승 「4!」 문항 (2026-10-17 q3)
  if (/경우의수|확률|\d[PC]\d|\d!/.test(s)) return true;
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

/**
 * 근의 성질 (오종래 2026-10-16 q6 학생 6) — 항등식은 아니지만 α · β가 원식의 근이라 성립하는 등식
 * (「α²=2-α」 「α³=3α-2」 「α³+β³=3(α+β)-4」). 원식의 두 실근을 α · β에 넣어(두 가지 순서 모두) 양변이 같으면 맞다
 */
function 근에서성립(왼: string, 오른: string, 원?: 이차식): boolean {
  const r = 원 ? roots(원) : [];
  if (r.length !== 2) return false;
  return [[r[0], r[1]], [r[1], r[0]]].every(([a, b]) => {
    const l = 근넣어계산(왼, a, b), rr = 근넣어계산(오른, a, b);
    return l !== null && rr !== null && 같다(l, rr);
  });
}

export function verify_identity(학생답: string, 원?: 이차식): 다경로검증 {
  const 표본 = [[1.3, -0.7], [2.1, 0.4], [-1.6, 2.9]];
  const 시도: 다경로검증['시도'] = [];
  for (const 마디 of 식마디들(학생답)) {
    const 변 = 정리(마디).split('=');
    // 이웃한 두 변이 모두 α · β를 품은 등식만 — 「α+β=-1」은 값이지 변형이 아니다
    for (let i = 0; i + 1 < 변.length; i++) {
      if (!근문자.test(변[i]) || !근문자.test(변[i + 1])) continue;
      const 계산됨 = 표본.map(([a, b]) => [근넣어계산(변[i], a, b), 근넣어계산(변[i + 1], a, b)]);
      if (계산됨.some(([l, r]) => l === null || r === null)) continue;
      const 항등 = 계산됨.every(([l, r]) => 같다(l!, r!));
      // 항등식이 아니어도 원식의 근에서 성립하면 맞다 — 근의 성질로 차수 낮추기 (q6 학생 6)
      const 근성질 = !항등 && 근에서성립(변[i], 변[i + 1], 원);
      const 맞음 = 항등 || 근성질;
      // 틀렸으면 — 오른변의 항 하나의 부호만 바꿔 항등식이 되는지 본다 (공식 부호 오기억, 2026-10-16 q6 학생 2)
      const 고침 = 맞음 ? null : 부호하나고침(변[i], 변[i + 1], 표본);
      시도.push({
        경로: 근성질 ? '근의 성질(차수 낮추기)' : 공식이름(변[i + 1]), 식: `${변[i]}=${변[i + 1]}`, 맞음,
        까닭: 항등 ? 'α · β에 수를 넣어도 양변이 같다 (항등식)'
          : 근성질 ? `α · β가 원식의 근이라 성립한다 (근 ${roots(원!).join(', ')}을 넣어 양변이 같다)`
          : 고침 ? `수를 넣으면 양변이 다르다 — ${고침.원래}를 ${고침.고친}로 바꾸면 항등식` : '수를 넣으면 양변이 다르다',
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
  // 근과 계수 · 식 변형 줄인데 학생이 그 꼴을 쓰지 않았으면 — 근을 직접 구해 넣은 경로인지 본다 (q6 학생 5)
  const 아니면직접 = (v: 다경로검증) => (v.결과 === '판정불가' ? verify_direct_roots(학생답, 원) : v);
  if (verify_vieta(모범줄, 원).시도.length) return 아니면직접(verify_vieta(학생답, 원));
  if (verify_identity(모범줄).시도.length) return 아니면직접(verify_identity(학생답, 원));
  return verify_multipath(학생답, 원);
}

/**
 * 근 직접 대입 (오종래 2026-10-16 q6 학생 5) — 방정식을 풀어 「α=-2, β=1」로 놓고 값을 바로 계산한 경로.
 * 「답이 맞고 수학적으로 옳으면 경로 무관하게 O」 — 학생이 놓은 α · β가 원식의 두 근(어느 순서든)이면 맞다, 아니면 X
 */
export function verify_direct_roots(학생답: string, 원: 이차식): 다경로검증 {
  const 근 = roots(원);
  const 값of = (문자: 'α' | 'β') => 식마디들(학생답).map((d) => 정리(d).match(new RegExp(`^${문자}=(.+)$`))).filter(Boolean).map((m) => evaluate(m![1])).find((v) => v !== null && Number.isFinite(v));
  const a = 값of('α'), b = 값of('β');
  if (a === undefined || b === undefined || 근.length !== 2) return { 결과: '판정불가', 시도: [] };
  const 맞음 = (같다(a!, 근[0]) && 같다(b!, 근[1])) || (같다(a!, 근[1]) && 같다(b!, 근[0]));
  return {
    결과: 맞음 ? 'O' : 'X',
    ...(맞음 ? { 경로: '근 직접 대입' as const } : {}),
    시도: [{ 경로: '근 직접 대입', 식: `α=${a}, β=${b}`, 맞음, 까닭: `원식의 근 ${근.join(', ')}과 ${맞음 ? '같다' : '다르다'}` }],
  };
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
  // 라벨 「양 끝 모음 나열:」 · 단위 「72(가지)」는 뗀다 (2026-10-17 q3)
  for (const 줄 of String(학생답 ?? '').split(/\r?\n/).map((l) => l.replace(/\([가-힣]+\)/g, '').replace(/[:：]/g, ','))) {
    // 「또는」으로 이은 두 등식(「x=1 또는 x=-3」)은 한 사슬이 아니다 — 쉼표처럼 나눈다
    // 한글 낱말(「이므로」 「이고」)에서도 사슬을 끊는다 — 「a+8=1이므로 a=-7」은 「a+8=1」 · 「a=-7」 (2026-10-17 q7 학생 2)
    for (const 마디 of 줄.replace(/∴/g, ',').split(/[,，](?![^(]*\))|또는|[가-힣]+/).map((x) => x.trim()).filter(Boolean)) {
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

// ── 나머지 정리 (오종래 2026-10-16 q7) ──
//   다항식 = 문항의 「다항식 x²+2x+a」(x 말고 문자 하나 — 상수). 조건 = 「x-2로 나누었을 때 나머지가 1」 → f(2)=1,
//   「x+1로 나누었을 때의 나머지 R」 → f(-1) (나머지는 미지). 상수의 참값은 수 나머지 조건에서 엔진이 푼다

export interface 나머지조건 {
  /** 나누는 식 x-c의 c */
  근: number;
  /** 나머지 (수). 「나머지 R」처럼 미지면 null */
  나머지: number | null;
  /** 미지 나머지의 이름 — 「나머지 R」의 R. 학생이 「R=」 없이 쓴 f(c) 값을 이 이름의 답으로 읽는다 (2026-10-17) */
  이름?: string;
}

export interface 다항식조건 {
  식: string;
  문자: string;
  조건: 나머지조건[];
  /** 수 나머지 조건으로 푼 상수 값 — 없으면 null */
  참값: number | null;
}

/** 문항 글에서 다항식 · 나머지 조건 — 「다항식 …를 x-2로 나누었을 때 나머지가 1」. 없으면 null */
export function parse_polynomial_conditions(글: string): 다항식조건 | null {
  const s = String(글 ?? '');
  const m = s.match(/다항식\s*([0-9x²³a-wyzA-Z+\-\s]+?)\s*(을|를|이|가|은|는|의)/);
  if (!m) return null;
  const 식 = 정리(m[1]);
  const 문자들 = [...new Set(식.match(/[a-wyzA-Z]/g) ?? [])];
  if (!/x/.test(식) || 문자들.length !== 1) return null;
  const 조건: 나머지조건[] = [...s.matchAll(/x\s*([+\-])\s*(\d+(?:\.\d+)?)\s*로\s*나누었을\s*때의?\s*나머지(?:가|는)?\s*(?:(-?\d+(?:\.\d+)?)|([A-Za-z])(?![A-Za-z]))?/g)].map((c) => ({
    근: (c[1] === '-' ? 1 : -1) * Number(c[2]),
    나머지: c[3] !== undefined ? Number(c[3]) : null,
    ...(c[4] ? { 이름: c[4] } : {}),
  }));
  if (!조건.length) return null;
  const 원: 다항식조건 = { 식, 문자: 문자들[0], 조건, 참값: null };
  // 상수 참값 — 수 나머지 조건 하나로 P(c; t)=r을 푼다 (P는 상수에 대해 일차라고 보고, 두 값에서 직선으로)
  const 수조건 = 조건.find((c) => c.나머지 !== null);
  if (수조건) {
    const g = (t: number) => (다항식값(원, 수조건.근, t) ?? NaN) - 수조건.나머지!;
    const g0 = g(0), g1 = g(1);
    if (Number.isFinite(g0) && Number.isFinite(g1) && !같다(g1, g0)) 원.참값 = -g0 / (g1 - g0);
  }
  return 원;
}

/** 다항식 값 P(x; t) */
export function 다항식값(원: { 식: string; 문자: string }, x: number, t: number): number | null {
  return 넣어계산(원.식, { [원.문자]: t, x });
}

/** ① 나머지 조건 — 학생이 f(c)를 썼는가, 수 나머지면 그 값과 같은 변이 있는가 (「f(2)=1」 「f(2)=4+4+a=1」) */
export function wrote_remainder(학생답: string, 조건: 나머지조건): boolean {
  const c = 같다(조건.근, Math.round(조건.근)) ? String(Math.round(조건.근)) : String(조건.근);
  return 식마디들(학생답).some((d) => {
    const 변 = 정리(d).split('=');
    if (!변.includes(`f(${c})`)) return false;
    if (조건.나머지 === null) return true;
    return 변.some((e) => { const v = evaluate(e); return v !== null && 같다(v, 조건.나머지!); });
  });
}

/** 학생이 f(x)를 같은 다항식으로 정의했는가 — 「f(x)=x²+2x+a」 (x · 상수에 여러 값을 넣어 본다). 없으면 판정불가 */
export function verify_definition(학생답: string, 원: 다항식조건): 다경로검증 {
  const 시도: 다경로검증['시도'] = [];
  for (const d of 식마디들(학생답)) {
    const m = 정리(d).match(/^f\(x\)=(.+)$/);
    if (!m) continue;
    // 상수 문자가 남은 정의는 모든 상수 값에서, 상수를 넣어 쓴 정의(「f(x)=x²+2x-7」)는 참값에서 같아야 맞다
    const 상수있음 = new RegExp(원.문자).test(m[1]);
    const 상수값들 = 상수있음 ? [-2, 0.7, 3] : 원.참값 !== null ? [원.참값] : [];
    const 맞음 = 상수값들.length > 0 && [-1.5, 0.5, 2.3].every((x) => 상수값들.every((t) => {
      const l = 넣어계산(m[1], { [원.문자]: t, x }), r = 다항식값(원, x, t);
      return l !== null && r !== null && 같다(l, r);
    }));
    시도.push({ 경로: '나머지 정리', 식: d, 맞음, 까닭: 맞음 ? `다항식 ${원.식}과 같다` : `다항식 ${원.식}과 다르다` });
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '나머지 정리', 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

/**
 * ② 나머지 정리 줄 검증 — 「f(2)=4+4+a=1」 「R=f(-1)=1-2-7=-8」.
 * f(c) 뒤의 변: 상수 문자가 있으면 모든 상수 값에서 P(c)와 같아야, 수면 그 c의 수 나머지 또는 참값에서의 P(c)와 같아야 맞다
 */
/** 줄에 나오는 f(c)의 c들 — 「R=f(-1)=1-2-7=-8」 → [-1] (조각이 볼 c를 모범 줄에서 정한다, 2026-10-17 q7 학생 1) */
export const remainder_points = (줄: string) => [...정리(줄).matchAll(/f\((-?\d+(?:\.\d+)?)\)/g)].map((m) => Number(m[1]));

/**
 * 대입 부호 오류 (2026-10-17 q7 학생 1) — f(c)를 항마다 펼친 학생 식(「1+2-7」)과 다항식 항의 값(1, -2, -7)이
 * 항 하나의 부호만 다르면 그 항을 낸다: 「f(-1) 대입 부호 오류 — 2×(-1)=+2로 계산」. 아니면 null
 */
/** 괄호 밖 +, - 로 나눈 항 — 「(-1)²+2×(-1)-7」 → 「(-1)²」 「+2*(-1)」 「-7」 */
export function 겉항들(식: string): string[] {
  const 항: string[] = [];
  let 깊이 = 0, 지금 = '';
  for (const ch of 정리(식)) {
    if (ch === '(') 깊이++;
    if (ch === ')') 깊이--;
    if ((ch === '+' || ch === '-') && 깊이 === 0 && 지금 && !/[*/]$/.test(지금)) {
      항.push(지금);
      지금 = ch;
    } else 지금 += ch;
  }
  if (지금) 항.push(지금);
  return 항;
}

export function substitution_sign_error(원: 다항식조건, c: number, 학생식: string): string | null {
  const 항들 = 겉항들; // 괄호 밖 +, - 로 — 「(-1)²+2×(-1)-7」 (2026-10-17 q7 학생 4)
  const 다항항 = 항들(원.식);
  const 학생항 = 항들(학생식);
  if (원.참값 === null || 다항항.length !== 학생항.length) return null;
  const 참값 = 원.참값;
  const 다른 = 다항항
    .map((t, i) => ({ t, i, 참: 넣어계산(t, { [원.문자]: 참값, x: c }), 학생: evaluate(학생항[i]) }))
    .filter((x) => x.참 === null || x.학생 === null || !같다(x.참, x.학생));
  if (다른.length !== 1) return null;
  const { t, i, 참, 학생 } = 다른[0];
  if (참 === null || 학생 === null || !같다(참, -학생)) return null;
  const cs = c < 0 ? `(${c})` : `${c}`; // 음수만 괄호
  const 대입 = t.replace(/^\+/, '').replace(/x²/, `${cs}²`).replace(/(\d)x/, `$1×${cs}`).replace(/x/, cs);
  const 쓴항 = /^[+-]/.test(학생항[i]) ? 학생항[i] : `+${학생항[i]}`;
  return `f(${c}) 대입 부호 오류 — ${대입}=${쓴항}로 계산`;
}

/** @param 볼근 주면 그 c의 f(c) 사슬만 본다 (② 「f(2)=…」 조각 · ③ 「R=f(-1)=…」 조각이 서로의 줄로 틀리지 않게) */
export function verify_remainder_chain(학생답: string, 원: 다항식조건, 볼근?: number[]): 다경로검증 {
  const 시도: 다경로검증['시도'] = [];
  for (const d of 식마디들(학생답)) {
    const 변 = 정리(d).split('=');
    const at = 변.findIndex((e) => /^f\(-?\d+(\.\d+)?\)$/.test(e));
    if (at < 0) continue;
    const c = Number(변[at].slice(2, -1));
    if (볼근 && 볼근.length && !볼근.some((x) => 같다(x, c))) continue;
    const 뒤 = 변.slice(at + 1).filter(Boolean);
    if (!뒤.length) continue;
    const 수나머지 = 원.조건.find((k) => 같다(k.근, c) && k.나머지 !== null)?.나머지;
    const 맞음 = 뒤.every((e) => {
      if (new RegExp(원.문자).test(e)) {
        return [-2, 0.7, 3].every((t) => { const l = 넣어계산(e, { [원.문자]: t }), r = 다항식값(원, c, t); return l !== null && r !== null && 같다(l, r); });
      }
      const v = evaluate(e);
      if (v === null) return true; // 계산할 수 없는 변은 보지 않는다
      if (수나머지 != null && 같다(v, 수나머지)) return true;
      const p = 원.참값 !== null ? 다항식값(원, c, 원.참값) : null;
      return p !== null && 같다(v, p);
    });
    // 틀렸으면 — 상수 없는 수 식(「1+2-7」)에서 대입 부호 오류를 찾아 이름 붙인다
    const 오류 = 맞음 ? null : 뒤.filter((e) => !new RegExp(원.문자).test(e) && evaluate(e) !== null).map((e) => substitution_sign_error(원, c, e)).find(Boolean) ?? null;
    시도.push({ 경로: '나머지 정리', 식: d, 맞음, 까닭: 맞음 ? `f(${c})의 값이 다항식 ${원.식}에서 나온 값과 같다` : `f(${c})의 값이 다항식 ${원.식}에서 나온 값과 다르다`, ...(오류 ? { 오류 } : {}) });
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '나머지 정리', 시도 };
  const 오류 = 시도.find((t) => t.오류)?.오류;
  return { 결과: 시도.length ? 'X' : '판정불가', 시도, ...(오류 ? { 오류 } : {}) };
}

/**
 * 이름 붙은 나머지의 학생 값 (오종래 2026-10-17 q7) — 문항이 「x+1로 나누었을 때의 나머지 R」로 R=f(-1)을 정했으므로
 * 학생이 「R=」 없이 쓴 「f(-1)=1+2-7=-4」의 끝 값을 「R=-4」로 읽는다. 끝이 수인 f(c) 사슬의 마지막 것
 */
export function named_remainder_values(학생답: string, 원: 다항식조건): string[] {
  return 원.조건.flatMap((k) => {
    if (!k.이름) return [];
    const 끝값들 = 식마디들(학생답).flatMap((d) => {
      const 변 = 정리(d).split('=');
      if (!변.some((e) => /^f\(-?\d+(\.\d+)?\)$/.test(e) && 같다(Number(e.slice(2, -1)), k.근))) return [];
      const v = evaluate(변.at(-1)!);
      return v !== null && Number.isFinite(v) ? [v] : [];
    });
    return 끝값들.length ? [`${k.이름}=${String(Math.round(끝값들.at(-1)! * 1e9) / 1e9)}`] : [];
  });
}

// ── 직접 나눗셈 (오종래 2026-10-17 q7 학생 2) — 나머지 정리 대신 다항식을 x-c로 직접 나눈 경로 ──
//   「x²+2x+a를 x-2로 직접 나눗셈하면 / 몫: x+4, 나머지: a+8」 — 엔진이 검증한다:
//   피제식 = 문항 다항식 (상수째면 모든 상수 값에서, 상수를 넣은 꼴이면 참값에서) · c = 문항 나머지 조건의 c ·
//   몫×(x-c)+나머지 ≡ 피제식. 수 나머지 조건(나머지가 1)이면 학생이 나머지를 그 수와 같다고 써야(「a+8=1」) 맞다

export interface 나눗셈 {
  근: number;
  피제식: string;
  몫: string;
  나머지: string;
  /** 몫×(x-c)+나머지 ≡ 피제식, 피제식 = 문항 다항식 */
  맞음: boolean;
  /** 수 나머지 조건 — 나머지를 그 수와 같다고 썼는가 (미지 나머지면 true) */
  조건맞음: boolean;
  까닭: string;
}

const 나눗셈머리 = /([0-9x²³a-wyzA-Z+\-*()]+)(?:을|를)x([+\-])(\d+(?:\.\d+)?)(?:으로|로)(?:직접)?나(?:눗셈|누)/;

/** 학생 답의 직접 나눗셈들 — 나눗셈 머리 줄부터 다음 머리 줄 앞까지에서 「몫」 「나머지」를 찾는다 */
export function division_checks(학생답: string, 원: 다항식조건): 나눗셈[] {
  const 줄 = String(학생답 ?? '').split(/\r?\n/).map(정리).filter(Boolean);
  const 결과: 나눗셈[] = [];
  for (let i = 0; i < 줄.length; i++) {
    const h = 줄[i].match(나눗셈머리);
    if (!h) continue;
    const 근 = (h[2] === '-' ? 1 : -1) * Number(h[3]);
    let 몫 = '', 나머지 = '';
    for (let j = i; j < 줄.length && (j === i || !나눗셈머리.test(줄[j])); j++) {
      const 뒤 = j === i ? 줄[j].slice(h.index! + h[0].length) : 줄[j];
      몫 ||= 뒤.match(/몫(?::|：|은|는|이)?([^,，가-힣:]+)/)?.[1] ?? '';
      나머지 ||= 뒤.match(/나머지(?::|：|는|가|은)?([^,，가-힣:]+)/)?.[1] ?? '';
    }
    if (!몫 || !나머지) continue;
    // 「나머지 R=-8」 「몫은 Q=x+1」 — 등호가 있으면 마지막 값 (2026-10-17 q7 학생 5)
    몫 = 몫.split('=').at(-1)!;
    나머지 = 나머지.split('=').at(-1)!;
    const 피제식 = h[1];
    const 상수있음 = new RegExp(원.문자).test(피제식);
    const 상수값들 = 상수있음 ? [-2, 0.7, 3] : 원.참값 !== null ? [원.참값] : [];
    const 조건 = 원.조건.find((k) => 같다(k.근, 근));
    const 같은다항식 = 상수값들.length > 0 && [-1.5, 0.5, 2.3].every((x) => 상수값들.every((t) => {
      const l = 넣어계산(피제식, { [원.문자]: t, x }), r = 다항식값(원, x, t);
      return l !== null && r !== null && 같다(l, r);
    }));
    const 항등 = [-1.5, 0.5, 2.3, 4].every((x) => [-2, 0.7, 3].every((t) => {
      const p = 넣어계산(피제식, { [원.문자]: t, x }), q = 넣어계산(몫, { [원.문자]: t, x }), r = 넣어계산(나머지, { [원.문자]: t, x });
      return p !== null && q !== null && r !== null && 같다(p, q * (x - 근) + r);
    }));
    const 맞음 = !!조건 && 같은다항식 && 항등;
    // 수 나머지 — 「a+8=1」처럼 나머지 식과 그 수를 같다고 쓴 마디, 또는 나머지가 곧 그 수
    const 나머지같다 = (e: string) => [-2, 0.7, 3].every((t) => {
      const l = 넣어계산(e, { [원.문자]: t }), r = 넣어계산(나머지, { [원.문자]: t });
      return l !== null && r !== null && 같다(l, r);
    });
    const 조건맞음 = !조건 || 조건.나머지 === null || (() => {
      const 수 = 조건.나머지!;
      const v = evaluate(나머지);
      if (v !== null && 같다(v, 수)) return true;
      return 식마디들(학생답).some((d) => {
        const 변 = 정리(d).split('=');
        return 변.length === 2 && 변.some((e, k) => 나머지같다(e) && (() => { const w = evaluate(변[1 - k]); return w !== null && 같다(w, 수); })());
      });
    })();
    const 나눔 = `x${근 < 0 ? '+' : '-'}${Math.abs(근)}`;
    const 까닭 = !조건 ? `x-c의 c(${근})가 문항 나머지 조건에 없다`
      : !같은다항식 ? `피제식 ${피제식}이 다항식 ${원.식}과 다르다`
      : !항등 ? `몫×(${나눔})+나머지가 ${피제식}과 다르다`
      : !조건맞음 ? `나머지 ${나머지}를 ${조건.나머지}와 같다고 쓰지 않았다`
      : `(${나눔})(${몫})${/^-/.test(나머지) ? '' : '+'}${나머지}가 ${피제식}과 같다${조건.나머지 !== null ? ` · 나머지 ${나머지}=${조건.나머지}` : ''}`;
    결과.push({ 근, 피제식, 몫, 나머지, 맞음, 조건맞음, 까닭 });
  }
  return 결과;
}

/** 직접 나눗셈 경로 검증 — 볼근을 주면 그 c로 나눈 것만 본다. 나눗셈이 없으면 판정불가 */
export function verify_division(학생답: string, 원: 다항식조건, 볼근?: number[]): 다경로검증 {
  const 시도 = division_checks(학생답, 원)
    .filter((d) => !볼근 || !볼근.length || 볼근.some((c) => 같다(c, d.근)))
    .map((d) => ({ 경로: '직접 나눗셈' as const, 식: `${d.피제식}÷(x${d.근 < 0 ? '+' : '-'}${Math.abs(d.근)}) — 몫 ${d.몫}, 나머지 ${d.나머지}`, 맞음: d.맞음 && d.조건맞음, 까닭: d.까닭 }));
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '직접 나눗셈', 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

// ── 인수분해 역산 (오종래 2026-10-17 q7 학생 4) — 나머지가 r이면 P-r은 x-c로 나누어떨어진다 ──
//   「x²+2x+a-1=(x-2)(x+4)=x²+2x-8」 — 엔진이 검증한다 (규칙 확정 2026-10-17):
//   1. (x-c)(x+d)=[전개식] 꼴을 찾는다  2. L = 문항 다항식 - 나머지 (모든 상수 값에서)
//   3. x-c 인수의 c가 그 수 나머지 조건의 c  4. 상수 참값을 넣으면 L과 곱 · 전개식이 x에 대해 같다

const 곱꼴 = /^\(x([+\-])(\d+(?:\.\d+)?)\)\(x([+\-])(\d+(?:\.\d+)?)\)$/;

export function verify_factor_remainder(학생답: string, 원: 다항식조건, 볼근?: number[]): 다경로검증 {
  const 시도: 다경로검증['시도'] = [];
  const 상수들 = [-2, 0.7, 3], 점들 = [-1.5, 0.5, 2.3, 4];
  for (const d of 식마디들(학생답)) {
    const 변 = 정리(d).split('=');
    const pi = 변.findIndex((e) => 곱꼴.test(e));
    const L = 변[0];
    if (pi < 1 || !/x/.test(L) || !new RegExp(원.문자).test(L)) continue;
    const m = 변[pi].match(곱꼴)!;
    const 인수근 = [(m[1] === '-' ? 1 : -1) * Number(m[2]), (m[3] === '-' ? 1 : -1) * Number(m[4])];
    if (볼근 && 볼근.length && !인수근.some((c) => 볼근.some((b) => 같다(b, c)))) continue;
    // 2. L - P 가 상수 -r 인가 — 아니면 이 경로 꼴이 아니다
    const 차들 = 점들.flatMap((x) => 상수들.map((t) => {
      const l = 넣어계산(L, { [원.문자]: t, x }), q = 다항식값(원, x, t);
      return l === null || q === null ? NaN : l - q;
    }));
    if (!차들.every((v) => Number.isFinite(v) && 같다(v, 차들[0]))) continue;
    const 빼기 = -차들[0];
    // 3. 그 수 나머지 조건의 x-c가 곱의 인수
    const 조건 = 원.조건.find((k) => k.나머지 !== null && 같다(k.나머지, 빼기) && 인수근.some((c) => 같다(c, k.근)));
    // 4. 상수 참값에서 L ≡ 곱 ≡ 전개식
    const 참값 = 원.참값;
    const 일치 = 참값 !== null && 점들.every((x) => {
      const l = 넣어계산(L, { [원.문자]: 참값, x });
      return l !== null && 변.slice(1).every((e) => { const r = 넣어계산(e, { [원.문자]: 참값, x }); return r !== null && 같다(l, r); });
    });
    const 맞음 = !!조건 && 일치;
    const 까닭 = !조건 ? `L = 다항식 ${원.식} - ${빼기}이지만 그 나머지 조건의 x-c가 곱의 인수가 아니다`
      : !일치 ? `${원.문자}=${참값}을 넣으면 양변이 다르다`
      : `L = 다항식 ${원.식} - ${빼기} · x${조건.근 < 0 ? '+' : '-'}${Math.abs(조건.근)} 인수 · ${원.문자}=${참값}에서 양변이 같다`;
    시도.push({ 경로: '인수분해 역산', 식: d, 맞음, 까닭 });
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '인수분해 역산', 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

/**
 * f 없이 쓴 나머지 정리 (2026-10-17 q7 학생 4) — 「x²+2x-7을 x+1로 나누면 … R=(-1)²+2×(-1)-7=-8」.
 * 답에 「x-c로 나누」가 있고 c를 넣은 변(「(-1)」 · 양수면 「2²」도)이 있으면 f(c)로 본다 — 값이 상수 참값의 P(c)(또는 수 나머지)와 같아야 맞다.
 * 대입 부호 오류는 이름을 붙인다
 */
export function verify_substitution(학생답: string, 원: 다항식조건, 볼근?: number[]): 다경로검증 {
  const 시도: 다경로검증['시도'] = [];
  const 글 = 정리(학생답);
  for (const k of 원.조건) {
    const c = k.근;
    if (볼근 && 볼근.length && !볼근.some((b) => 같다(b, c))) continue;
    const 나눔 = `x${c < 0 ? '+' : '-'}${Math.abs(c)}`;
    if (!글.includes(`${나눔}로나누`) && !글.includes(`${나눔}으로나누`)) continue;
    const 표 = [`(${c})`, ...(c > 0 ? [`${c}²`] : [])];
    for (const d of 식마디들(학생답)) {
      const 변 = 정리(d).split('=');
      const at = 변.findIndex((e) => !/f\(/.test(e) && 표.some((x) => e.includes(x)));
      if (at < 0) continue;
      const 뒤 = 변.slice(at).filter(Boolean);
      const 맞음 = 뒤.every((e) => {
        if (new RegExp(원.문자).test(e)) {
          return [-2, 0.7, 3].every((t) => { const l = 넣어계산(e, { [원.문자]: t }), r = 다항식값(원, c, t); return l !== null && r !== null && 같다(l, r); });
        }
        const v = evaluate(e);
        if (v === null) return true;
        if (k.나머지 !== null && 같다(v, k.나머지)) return true;
        const p = 원.참값 !== null ? 다항식값(원, c, 원.참값) : null;
        return p !== null && 같다(v, p);
      });
      const 오류 = 맞음 ? null : 뒤.filter((e) => !new RegExp(원.문자).test(e) && evaluate(e) !== null).map((e) => substitution_sign_error(원, c, e)).find(Boolean) ?? null;
      시도.push({ 경로: '나머지 정리', 식: d, 맞음, 까닭: `x=${c}을 넣은 값이 다항식 ${원.식}에서 나온 값과 ${맞음 ? '같다' : '다르다'} (f 없이 대입)`, ...(오류 ? { 오류 } : {}) });
    }
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '나머지 정리', 시도 };
  const 오류 = 시도.find((t) => t.오류)?.오류;
  return { 결과: 시도.length ? 'X' : '판정불가', 시도, ...(오류 ? { 오류 } : {}) };
}

/** f 표기 경로가 판정불가일 때 볼 다른 경로 — 몫·나머지꼴(q7 학생 5) · 직접 나눗셈 · 인수분해 역산 · f 없이 대입. 맞은 경로가 먼저, 없으면 틀린 것, 없으면 판정불가 */
export function verify_remainder_alternatives(학생답: string, 원: 다항식조건, 볼근?: number[]): 다경로검증 {
  const 결과들 = [verify_quotient_form, verify_division, verify_factor_remainder, verify_substitution].map((f) => f(학생답, 원, 볼근));
  return 결과들.find((v) => v.결과 === 'O') ?? 결과들.find((v) => v.결과 === 'X') ?? { 결과: '판정불가', 시도: [] };
}

// ── 몫·나머지꼴 (오종래 2026-10-17 q7 학생 5) — 「x²+2x+a=(x-2)(x+4)+1=x²+2x-7」 「x²+2x-7=(x+1)(x+1)-8」 ──
//   (x-c)(몫)+r=[전개식] 꼴을 엔진이 검증한다 (규칙 확정 2026-10-17). 「=」로 시작하는 줄은 앞 줄에 이어 붙인다:
//   1. L = 문항 다항식 (상수째면 모든 상수 값에서, 상수를 넣은 꼴이면 참값에서)  2. x-c의 c가 문항 나머지 조건의 c
//   3. r = 수 나머지(나머지가 1) 또는 참값의 P(c)(「나머지 R」)  4. 상수 참값에서 L ≡ (x-c)(몫)+r ≡ 전개식
//   「(x-2)Q(x)+1」처럼 몫이 문자뿐인 줄은 검증하지 않는다

const 몫나머지꼴 = /^\(x([+\-])(\d+(?:\.\d+)?)\)\((.+)\)([+\-]\d+(?:\.\d+)?)$/;

/** 「=」로 시작하는 줄을 앞 줄에 이어 붙인 답 */
export const join_continued_lines = (답: string) =>
  String(답 ?? '').split(/\r?\n/).reduce<string[]>((줄, l) => {
    if (/^\s*=/.test(l) && 줄.length) 줄[줄.length - 1] += l.trim();
    else 줄.push(l);
    return 줄;
  }, []).join('\n');

export function verify_quotient_form(학생답: string, 원: 다항식조건, 볼근?: number[]): 다경로검증 {
  const 시도: 다경로검증['시도'] = [];
  const 점들 = [-1.5, 0.5, 2.3, 4];
  for (const d of 식마디들(join_continued_lines(학생답))) {
    const 변 = 정리(d).split('=');
    const qi = 변.findIndex((e) => 몫나머지꼴.test(e));
    const L = 변[0];
    if (qi < 1 || !/x/.test(L)) continue;
    const m = 변[qi].match(몫나머지꼴)!;
    const c = (m[1] === '-' ? 1 : -1) * Number(m[2]);
    if (볼근 && 볼근.length && !볼근.some((b) => 같다(b, c))) continue;
    const r = Number(m[4]);
    const 조건 = 원.조건.find((k) => 같다(k.근, c));
    const 참값 = 원.참값;
    // 1. L = 문항 다항식
    const 상수있음 = new RegExp(원.문자).test(L);
    const 상수값들 = 상수있음 ? [-2, 0.7, 3] : 참값 !== null ? [참값] : [];
    const 같은다항식 = 상수값들.length > 0 && 점들.every((x) => 상수값들.every((t) => {
      const l = 넣어계산(L, { [원.문자]: t, x }), p = 다항식값(원, x, t);
      return l !== null && p !== null && 같다(l, p);
    }));
    // 3. r = 수 나머지 또는 참값의 P(c)
    const 기대 = 조건 ? (조건.나머지 ?? (참값 !== null ? 다항식값(원, c, 참값) : null)) : null;
    const 나머지맞음 = 기대 !== null && 같다(r, 기대);
    // 4. 참값에서 모든 변이 x에 대해 같다
    const 일치 = 참값 !== null && 점들.every((x) => {
      const l = 넣어계산(L, { [원.문자]: 참값, x });
      return l !== null && 변.slice(1).every((e) => { const v = 넣어계산(e, { [원.문자]: 참값, x }); return v !== null && 같다(l, v); });
    });
    const 맞음 = !!조건 && 같은다항식 && 나머지맞음 && 일치;
    const 나눔 = `x${c < 0 ? '+' : '-'}${Math.abs(c)}`;
    const 까닭 = !조건 ? `${나눔}의 c(${c})가 문항 나머지 조건에 없다`
      : !같은다항식 ? `${L}이 다항식 ${원.식}과 다르다`
      : !나머지맞음 ? `나머지 ${r} — ${기대}이어야 한다`
      : !일치 ? `${원.문자}=${참값}을 넣으면 양변이 다르다`
      : `(${나눔})(${m[3]})${m[4]}가 ${원.식}과 같다 (${원.문자}=${참값}) · 나머지 ${r}`;
    시도.push({ 경로: '몫·나머지꼴', 식: d, 맞음, 까닭 });
  }
  const 틀린 = 시도.find((t) => !t.맞음);
  if (시도.length && !틀린) return { 결과: 'O', 경로: '몫·나머지꼴', 시도 };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

// ── 경우의 수 (오종래 2026-10-17 q3 순열, 안 A 확정) — 모범답안 줄 조각으로 채점한다 ──
//   문항 노드 조각은 만들지 않는다. ① 근거대기 = 같은 것이 있는 순열(÷2!)을 썼는가 · ② 세우기 = 줄의 식(1/2!×3P2=3, 4!=24) 검증
//   ③ 풀기 = 「∴ 3×24=72(가지)」의 계산 검증 · ④ 답구하기 = 끝 값 72 일치

export interface 경우의수문항 {
  /** 문항의 나열 대상 — 「a,a,b,c,d,e」 */
  원소: string[];
  /** 같은 것 — 「a」 2개 */
  중복: { 원소: string; 개수: number }[];
}

/** 문항 글에서 경우의 수 문항 — 「경우의 수」가 있어야. 「a,a,b,c,d,e」 같은 나열 대상이 있으면 같은 것을 센다. 없으면 null */
export function parse_counting_item(글: string): 경우의수문항 | null {
  const s = String(글 ?? '');
  if (!/경우의\s*수/.test(s)) return null;
  const m = s.match(/(?<![A-Za-z0-9])((?:[A-Za-z0-9]\s*[,，]\s*){2,}[A-Za-z0-9])(?![A-Za-z0-9])/);
  const 원소 = m ? m[1].split(/[,，]/).map((x) => x.trim()) : [];
  const 수 = new Map<string, number>();
  for (const x of 원소) 수.set(x, (수.get(x) ?? 0) + 1);
  return { 원소, 중복: [...수].filter(([, n]) => n > 1).map(([원소, 개수]) => ({ 원소, 개수 })) };
}

/** ① 같은 것이 있는 순열 — 같은 것 n개마다 「÷n!」 「/n!」(「1/2!×3P2」)을 썼는가. 같은 것이 없는 문항이면 null */
export function wrote_same_permutation(학생답: string, 문항: 경우의수문항): boolean | null {
  if (!문항.중복.length) return null;
  const s = 정리(학생답);
  return 문항.중복.every((d) => new RegExp(`/\\(?${d.개수}!`).test(s));
}

/** 줄의 계산 마디 — 「라벨: 식=값(단위)」에서 라벨(「:」 앞)과 단위(「(가지)」)를 뗀다 · 「→ 4!=24」의 화살표도 (q3 학생 1) */
const 계산마디들 = (답: string) =>
  String(답 ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[^:：]*[:：]/, '').replace(/[∴→⇒]/g, '').replace(/\([가-힣]+\)/g, ''))
    .flatMap((l) => l.split(/[,，](?![^(]*\))/))
    .map((x) => 정리(x).replace(/[가-힣.。]+$/, ''))
    .filter((x) => x.includes('='));

/**
 * ② 세우기 줄 (경우의 수) — 모범 줄 「1/2!×3P2=3」의 값(3)을 학생이 순열 · 조합 · 계승 식(!, P, C)으로 맞게 세웠는가.
 * 학생 마디의 변이 모두 같고(「4!=24」) 그 값이 모범 값과 같으면 O. 순열 · 조합 · 계승 식은 있는데 그런 마디가 없으면 X
 * (「3P2=6」 — ÷2!을 빠뜨림 · 「4!=12」 — 계산 틀림), 그런 식이 하나도 없으면 판정불가
 * 「4×3×2×1」 「3×2」처럼 계승 · 순열을 풀어 쓴 곱도 그런 식으로 본다 (q3 학생 2)
 */
export function verify_counting_line(모범줄: string, 학생답: string): 다경로검증 {
  const 모범 = counting_line_value(모범줄);
  const 시도: 다경로검증['시도'] = [];
  for (const d of 계산마디들(학생답)) {
    const 변 = d.split('=').filter(Boolean);
    if (!변.some((e) => /[!PC]/.test(e) || 풀어쓴순열(e))) continue;
    const 값 = 변.map(evaluate);
    if (값.some((v) => v === null)) continue;
    const 같음 = 값.every((v) => 같다(v!, 값[0]!));
    시도.push({ 경로: '경우의 수 식', 식: d, 맞음: 같음 && 모범 !== null && 같다(값[0]!, 모범), 까닭: !같음 ? `변의 값이 다르다 (${값.join(' ≠ ')})` : `계산 값 ${값[0]} — 모범 값 ${모범}과 ${모범 !== null && 같다(값[0]!, 모범) ? '같다' : '다르다'}` });
  }
  const 맞은 = 시도.find((t) => t.맞음);
  if (맞은) return { 결과: 'O', 경로: '경우의 수 식', 시도: [맞은] };
  return { 결과: 시도.length ? 'X' : '판정불가', 시도 };
}

/** 「4×3×2×1」 「3×2」 — 1씩 줄어드는 자연수의 곱 (계승 · 순열을 풀어 쓴 꼴, q3 학생 2). 「2×2」는 아니다 */
const 풀어쓴순열 = (e: string) => {
  const f = 정리(e).split('*');
  return f.length >= 2 && f.every((x) => /^\d+$/.test(x)) && f.every((x, i) => i === 0 || Number(x) === Number(f[i - 1]) - 1);
};

/** 경우의 수 줄의 값 — 「양 끝 모음 나열: 1/2! × 3P2 = 3」 → 3 */
export function counting_line_value(줄: string): number | null {
  return 계산마디들(줄).map((d) => evaluate(d.split('=').at(-1)!)).find((v) => v !== null) ?? null;
}

/** 오류 이름 (오종래 2026-10-17 q3 학생 2) — 모범 줄 라벨에서 「나열」을 뗀다: 「양 끝 모음 경우의 수 오류 — 중복 미처리」 */
export const 중복미처리오류 = (모범줄: string) => {
  const 라벨 = (String(모범줄 ?? '').match(/^([^:：]*)[:：]/)?.[1] ?? '').replace(/\s*나열\s*$/, '').trim();
  return `${라벨 ? 라벨 + ' ' : ''}경우의 수 오류 — 중복 미처리`;
};

/**
 * ② 세우기 줄 — 학생 결론 곱(「∴ 4×24=96」)에서 다른 줄의 모범 값(24)을 뺀 인수(4)가 이 줄의 학생 값 (q3 학생 2)
 * 모범 줄 값(3)과 다르면 X — 모범 줄이 ÷n!(같은 것)인데 학생이 ÷n!을 쓰지 않았으면 오류 「… 경우의 수 오류 — 중복 미처리」.
 * 결론 곱이 없거나 · 인수를 하나로 좁힐 수 없거나 · 모범 값과 같으면 판정불가 (여기서 O를 주지 않는다)
 */
export function verify_counting_factor(모범줄: string, 학생답: string, 다른줄값: number[], 문항: 경우의수문항): 다경로검증 {
  const 줄값 = counting_line_value(모범줄);
  const 마디 = 계산마디들(학생답);
  const 결론 = 마디.filter((d) => /^\d+(?:\*\d+)+$/.test(d.split('=')[0]) && !풀어쓴순열(d.split('=')[0])).at(-1);
  if (줄값 === null || !결론) return { 결과: '판정불가', 시도: [] };
  const 인수 = 결론.split('=')[0].split('*').map(Number);
  for (const w of 다른줄값) {
    const i = 인수.findIndex((x) => 같다(x, w));
    if (i < 0) return { 결과: '판정불가', 시도: [] };
    인수.splice(i, 1);
  }
  if (인수.length !== 1 || 같다(인수[0], 줄값)) return { 결과: '판정불가', 시도: [] };
  const 학생값 = 인수[0];
  const 출처 = 마디.find((d) => d !== 결론 && 같다(evaluate(d.split('=').at(-1)!) ?? NaN, 학생값));
  const 오류 = wrote_same_permutation(모범줄, 문항) && !wrote_same_permutation(학생답, 문항) ? 중복미처리오류(모범줄) : undefined;
  const 까닭 = `결론 「${결론}」에서 다른 줄 값 ${다른줄값.join(', ')}을 뺀 인수 ${학생값}${출처 ? ` (「${출처}」)` : ''} — 모범 값 ${줄값}과 다르다`;
  return { 결과: 'X', 시도: [{ 경로: '경우의 수 식', 식: 출처 ?? 결론, 맞음: false, 까닭, 오류 }], 오류 };
}

// ── 경우 나누기 (오종래 2026-10-17 q3 학생 1, (가) 확정) — ÷2! 대신 같은 것(a,a)을 경우로 나누어 센다 ──
//   「i) … → 4!=24(가지)」 「ii) … → 2!×4!=48(가지)」 「따라서, 24+48=72(가지)」
//   1. 경우 표지(i) ii) · (1)(2) · ①②) 둘 이상 · 2. 경우마다 끝 식(!, P, C, ×)의 변이 모두 같다
//   3. 합 줄의 항이 경우 값이고 합이 모범 끝 값. 경우가 겹치지 않고 빠짐없는지는 보지 않는다 ((가))
const 경우표지 = /^\s*(?:\(?(?:i{1,3}|iv|vi{0,3}|ix|x)\)|\(\d+\)|[①-⑳])/i;

export interface 경우나누기검증 extends 다경로검증 {
  /** 경우마다 끝 식의 값 — [24, 48] */
  경우값: number[];
}

/** 경우 나누기 경로 — 경우 끝 값들과 합 줄을 검증한다. 경우 표지가 둘 미만이거나 경우 식 · 합 줄이 없으면 판정불가 */
export function verify_case_split(학생답: string, 모범끝값: number | null): 경우나누기검증 {
  const 블록: string[][] = [];
  for (const l of String(학생답 ?? '').split(/\r?\n/)) {
    if (경우표지.test(l)) 블록.push([l.replace(경우표지, '')]);
    else 블록.at(-1)?.push(l);
  }
  const 시도: 다경로검증['시도'] = [];
  const 경우값: number[] = [];
  if (블록.length < 2 || 모범끝값 === null) return { 결과: '판정불가', 시도, 경우값 };
  for (const b of 블록) {
    const 끝 = 계산마디들(b.join('\n')).filter((d) => /[!PC*]/.test(d)).at(-1);
    const 값 = 끝 ? 끝.split('=').filter(Boolean).map(evaluate) : [];
    if (!끝 || 값.some((v) => v === null)) return { 결과: '판정불가', 시도, 경우값 };
    const 같음 = 값.every((v) => 같다(v!, 값[0]!));
    시도.push({ 경로: '경우 나누기', 식: 끝, 맞음: 같음, 까닭: 같음 ? `경우 값 ${값[0]}` : `변의 값이 다르다 (${값.join(' ≠ ')})` });
    if (!같음) return { 결과: 'X', 시도, 경우값 };
    경우값.push(값[0]!);
  }
  // 합 줄 — 첫 변이 경우 값들의 합(「24+48」, 순서 무관)인 마디
  const 차례 = [...경우값].sort((x, y) => x - y);
  const 합식 = 계산마디들(학생답).find((d) => {
    const 항 = d.split('=')[0].split('+').map(evaluate);
    return 항.length === 경우값.length && 항.every((v) => v !== null) && (항 as number[]).sort((x, y) => x - y).every((v, i) => 같다(v, 차례[i]));
  });
  if (!합식) return { 결과: '판정불가', 시도, 경우값 };
  const 합 = 경우값.reduce((x, y) => x + y, 0);
  const 변 = 합식.split('=').filter(Boolean).map(evaluate);
  const 맞음 = 변.every((v) => v !== null && 같다(v, 합)) && 같다(합, 모범끝값);
  시도.push({ 경로: '경우 나누기', 식: 합식, 맞음, 까닭: `경우 값의 합 ${합} — 모범 끝 값 ${모범끝값}과 ${맞음 ? '같다' : '다르다'}` });
  return 맞음 ? { 결과: 'O', 경로: '경우 나누기', 시도, 경우값 } : { 결과: 'X', 시도, 경우값 };
}

/**
 * ② 세우기 줄 — 경우 나누기로 (q3 학생 1 「양 끝 1/2!×3P2=3」). 모범 끝 값 72 = 줄 값 3 × 나머지 인수 24이므로
 * 경우 값마다 나머지 인수로 나눈 몫의 합(24÷24 + 48÷24 = 1+2)이 줄 값 3이면 O
 */
export function verify_case_split_line(모범줄: string, 학생답: string, 모범끝값: number | null): 다경로검증 {
  const v = verify_case_split(학생답, 모범끝값);
  const 줄값 = counting_line_value(모범줄);
  if (v.결과 !== 'O' || 줄값 === null || 모범끝값 === null || 같다(줄값, 0)) return v;
  const 인수 = 모범끝값 / 줄값;
  const 몫 = v.경우값.map((x) => x / 인수);
  const 맞음 = 같다(몫.reduce((x, y) => x + y, 0), 줄값);
  const 까닭 = `경우 값 ${v.경우값.join(', ')} ÷ ${인수} = ${몫.join(' + ')} — 줄 값 ${줄값}과 ${맞음 ? '같다' : '다르다'}`;
  const 시도 = [...v.시도, { 경로: '경우 나누기' as const, 식: v.시도.map((t) => t.식).join(' · '), 맞음, 까닭 }];
  return 맞음 ? { 결과: 'O', 경로: '경우 나누기', 시도 } : { 결과: 'X', 시도 };
}
