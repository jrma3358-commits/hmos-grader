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

export type 경로이름 = '인수분해' | '완전제곱식' | '근의 공식' | '근의 공식 2';

export interface 다경로검증 {
  결과: 'O' | 'X' | '판정불가';
  /** 검증된 경로 (O일 때) */
  경로?: 경로이름;
  /** 찾은 경로 꼴 하나하나의 검증 */
  시도: { 경로: 경로이름; 식: string; 맞음: boolean; 까닭: string }[];
}

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
    while (s[i] === '²') i++, (v = v * v);
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
