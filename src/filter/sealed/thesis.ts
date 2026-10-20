// [봉인⑨] 논제가 제시문에 무엇을 요구하는지 읽는 규칙 (문항분석 명세서-2 §3-3).
// [오종래 2026-10-20 확정] 요구 종류 셋 — 표지는 봉인 표지사전 「논제요구」 (이 파일은 받은 목록으로 찾기만 한다):
//   · 표적 — 논제가 제시문을 반박한다 (「비판하시오」 · 「반박하시오」 …)
//   · 관계 — 논제 자체가 제시문 관계를 묻는다 (「공통점」 · 「차이점」 …)
//   · 도구 — 논제가 제시문을 근거·도구로 쓴다 (「바탕으로」 · 「참고하여」 …)
//   제시문을 부르는 문장마다 표적 → 관계 → 도구 차례로 먼저 걸리는 것. 표지가 없으면 도구 (기본값).
//   제시문을 부르는 문장이 없으면 제시문 전부를 도구로 쓴다고 본다.
import { loadSealedTable, SealedError } from '../../fq/sealed/index.ts';
import type { 급소K } from '../../rubric/types.ts';

export type 요구종류 = '표적' | '관계' | '도구';

export interface 논제요구 {
  종류: 요구종류;
  /** 이 요구가 부른 제시문 id (논제 글 순서) */
  제시문: string[];
  /** 걸린 표지. 표지 없이 도구(기본값)면 null */
  표지: string | null;
  /** 요구를 읽은 논제 문장 */
  문장: string;
}

export type 논제요구표 = Record<요구종류, readonly string[]>;

/** 표적 → 관계 → 도구 (오종래 2026-10-20 확정) */
export const 요구순서: 요구종류[] = ['표적', '관계', '도구'];

/** 봉인 표지사전 「논제요구」 — 없으면 소리 내어 실패한다 */
export function 논제요구표지(): 논제요구표 {
  const t = (loadSealedTable() as unknown as Record<string, unknown>)['논제요구'] as Partial<논제요구표> | undefined;
  if (!t || 요구순서.some((k) => !Array.isArray(t[k]))) {
    throw new SealedError('[봉인⑨] 봉인 표지사전에 「논제요구」(표적 · 관계 · 도구 표지 목록)가 없습니다 — 오종래가 정해야 합니다.');
  }
  return t as 논제요구표;
}

const 이스케이프 = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 문장이 부르는 제시문 id — [가] (가) 〈가〉 <가>, 범위 「[가]~[다]」는 사이 제시문까지 (제시문ids 순서) */
export function 부른제시문(문장: string, 제시문ids: string[]): string[] {
  const 표 = (id: string) => new RegExp(`[\\[(〈<]\\s*${이스케이프(id)}\\s*[\\])〉>]`);
  const 자리 = 제시문ids.map((id) => ({ id, at: 문장.search(표(id)) })).filter((x) => x.at >= 0);
  const 부름 = new Set(자리.map((x) => x.id));
  for (const m of 문장.matchAll(/[\[(〈<]\s*([^\])〉>\s]+)\s*[\])〉>]\s*[~∼]\s*[\[(〈<]\s*([^\])〉>\s]+)\s*[\])〉>]/g)) {
    const [i, j] = [제시문ids.indexOf(m[1]), 제시문ids.indexOf(m[2])];
    if (i >= 0 && j > i) 제시문ids.slice(i, j + 1).forEach((id) => 부름.add(id));
  }
  return 제시문ids.filter((id) => 부름.has(id));
}

/** 논제 → 문장 (「.」「?」 뒤, 줄바꿈) */
const 문장들 = (논제: string) => 논제.split(/(?<=[.?!。])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/** 논제 문장의 요구 종류 — 표적 → 관계 → 도구, 표지가 없으면 도구 */
export function 요구of(문장: string, 표지표: 논제요구표): { 종류: 요구종류; 표지: string | null } {
  for (const 종류 of 요구순서) {
    const 표지 = 표지표[종류].find((m) => 문장.includes(m));
    if (표지) return { 종류, 표지 };
  }
  return { 종류: '도구', 표지: null };
}

export function 봉인9_논제요구(_논제k: 급소K, 제시문ids: string[], 논제 = ''): 논제요구[] {
  const 표지표 = 논제요구표지();
  const 요구들 = 문장들(논제).flatMap((문장): 논제요구[] => {
    const 제시문 = 부른제시문(문장, 제시문ids);
    return 제시문.length ? [{ ...요구of(문장, 표지표), 제시문, 문장 }] : [];
  });
  return 요구들.length ? 요구들 : [{ 종류: '도구', 제시문: [...제시문ids], 표지: null, 문장: '' }];
}
