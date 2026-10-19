// 수리논술 C-2 인식 규칙 [오종래 2026-10-19 확정]
//
//   1. 소문항: [2-1][2-2][2-3] 등 번호 라벨이 붙은 것만 독립 논제 (split_thesis)
//   2. 라벨 없는 글 — 제시문 [I][II][III] · 조건 (가)(나)(다) · 공통 발문의 문제 설정 — 은 제약조건(C)이다. 배경 설정이지 논제가 아니다
//   3. 순서: 제약조건을 먼저 읽고 → 소문항 논제에 얹는다
//   4. 소문항 이어달리기: 앞 소문항 결과(B, 엔진 급소)가 다음 소문항의 제약(C)으로 넘어간다
//   5. 「각각」 구조: k마다 (i)·(ii) 중 하나씩 — 끊겨 주어진 반쪽씩 나눠 가지는 실체. 전체를 조합해야 하나의 f(x)가 완성된다
//
// 이 파일은 글의 모양(기호·「각각」·「중 하나」·함수 꼴)만 읽는다. 풀지 않는다.

export type 제약종류 = '설정' | '제시문' | '조건' | '이어받기';

/** 「각각」 조각 조합 구조 (규칙 5) */
export interface 조각조합 {
  구조: '조각조합';
  /** 조각을 나누는 변수 (「각각의 정수 k」 → k). 없으면 빈 글 */
  변수: string;
  /** 변수 범위 (「1≤k≤8」). 없으면 빈 글 */
  범위: string;
  /** 하나씩 고르는 조각들 — (i)·(ii) 순서 */
  조각: string[];
  /** 조각을 조합해 완성되는 실체 (「f(x)」). 못 찾으면 null */
  완성: string | null;
}

export interface 제약C {
  색: 'C';
  종류: 제약종류;
  /** 「설정」 · 제시문 기호(I·가…) · 이어받기면 앞 소문항 번호 */
  출처: string;
  /** 짧은 실체 — 첫 문장 (이어받기는 앞 소문항 급소 B) */
  실체: string;
  텍스트: string;
  구조?: 조각조합;
}

const 로마 = /^(?:I{1,3}|IV|VI{0,3}|IX|X)$/;
/** 함수 꼴 「f(x)」「g(t)」「h(t)」 — 이어받기·제약 연결의 열쇠 */
const 함수꼴 = /[A-Za-z]'?\([A-Za-z]\)/g;
const 첫문장 = (t: string) => (t.trim().split(/(?<=[.。])\s|\n/)[0] ?? '').trim();
const 함수들 = (t: string) => [...new Set([...t.matchAll(함수꼴)].map((m) => m[0].replace("'", '')))];

/** 「각각」 + (i)(ii)… + 「중 하나」 → 조각 조합 구조. 아니면 null (규칙 5) */
export function piece_structure(text: string, 설정: string = ''): 조각조합 | null {
  if (!/각각/.test(text) || !/중\s*하나/.test(text)) return null;
  const 항목 = [...text.matchAll(/\((i{1,3}|iv|v|vi{0,3})\)\s*([\s\S]*?)(?=\((?:i{1,3}|iv|v|vi{0,3})\)|$)/g)];
  if (항목.length < 2) return null;
  const 조각 = 항목.map((m) => m[2].replace(/\s*중\s*하나[\s\S]*$/, '').replace(/\s+/g, ' ').trim());
  const 범위 = (text.match(/([^\s,]+≤\s*[A-Za-z]\s*≤[^\s,인]+)/) ?? [])[1] ?? '';
  const 변수 = (text.match(/각각의\s*(?:정수|자연수|실수)?\s*([A-Za-z])\b/) ?? [])[1] ?? '';
  // 완성 = 조각이 정하는 함수 (「f'(x)=0」 → f(x)), 없으면 설정 글의 첫 함수
  const 완성 = 함수들(조각.join(' '))[0] ?? 함수들(설정)[0] ?? null;
  return { 구조: '조각조합', 변수, 범위, 조각, 완성 };
}

/**
 * 제약조건 C — 공통 발문의 문제 설정(첫 줄 = 발문은 빼고) → 제시문 [I][II] → 조건 (가)(나)(다) 순서 (규칙 2·3).
 * 공통 발문 첫 줄(「[문항 2] 다음 제시문을 이용하여 … 서술하시오.」)은 상황 P 그대로다
 */
export function math_constraints(공통발문: string, 제시문: { id: string; 텍스트: string }[]): 제약C[] {
  const 설정글 = 공통발문.split('\n').slice(1).join('\n').trim();
  const out: 제약C[] = [];
  if (설정글) out.push({ 색: 'C', 종류: '설정', 출처: '설정', 실체: 첫문장(설정글), 텍스트: 설정글 });
  for (const p of 제시문) {
    if (로마.test(p.id)) out.push({ 색: 'C', 종류: '제시문', 출처: p.id, 실체: 첫문장(p.텍스트), 텍스트: p.텍스트 });
  }
  for (const p of 제시문) {
    if (로마.test(p.id)) continue;
    const 구조 = piece_structure(p.텍스트, 설정글);
    out.push({ 색: 'C', 종류: '조건', 출처: p.id, 실체: 첫문장(p.텍스트), 텍스트: p.텍스트, ...(구조 ? { 구조 } : {}) });
  }
  return out;
}

/** 이어달리기 (규칙 4) — 앞 소문항 결과(급소 B)를 이 소문항의 제약 C로 */
export const relay_constraint = (앞번호: string, 앞급소: string[]): 제약C[] =>
  앞급소.filter(Boolean).map((b) => ({ 색: 'C', 종류: '이어받기', 출처: 앞번호, 실체: b, 텍스트: `(${앞번호}) 결과 「${b}」` }));

/**
 * 제약 연결 — 소문항 노드 실체에 제약의 함수 꼴(「f(x)」「g(t)」)이 나오면 그 제약이 이 소문항에 얹힌 것이다.
 * 함수 꼴이 없는 제약은 실체 글 그대로 찾는다
 */
export function constraint_links(노드실체: string[], 제약: 제약C[]): { 출처: string; 종류: 제약종류; 말: string }[] {
  const 글 = 노드실체.join(' ');
  const out: { 출처: string; 종류: 제약종류; 말: string }[] = [];
  for (const c of 제약) {
    const 열쇠 = c.구조?.완성 ? [c.구조.완성] : 함수들(c.종류 === '이어받기' ? c.실체 : c.텍스트);
    const 말 = (열쇠.length ? 열쇠 : [c.실체]).find((k) => k && 글.includes(k));
    if (말) out.push({ 출처: c.출처, 종류: c.종류, 말 });
  }
  return out;
}
