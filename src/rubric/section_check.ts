// 구간 정합성 측정 — 인문 분류형 논제의 학생 답을 네비게이션 경로 4구간 입구 · 출구에 대본다 (오종래 2026-10-23 설계 확정).
// 글자 대조가 아니다: 문장마다 부른 단락(기호 · 그 단락만의 개념) · 축 극성(대립 축 어휘, 「아니라」 밀침) · 기능표지(대비 · 결론 · 양보)를 인식해
// 구간마다 통과(O/X)를 정한다. Claude는 쓰지 않는다. 낱말 목록은 봉인(sealed/section_words.ts · group.ts · 표지사전 「논리펼치기」).
// 답구하기 배점은 처방전_규칙 10-2 일방통행 어긋남 등급 — 네 구간 판정에서 센다.
import { designatedLabels } from '../fq/v2/passage.ts';
import { 축같은뜻, 축점수 } from './sealed/group.ts';
import { 각각표지, 나열이음, 이어받기지시어, 절경계, 총괄표지 } from './sealed/section_words.ts';
import { 같은뜻, 고르기자리, 방법론, 외재표현, 깎는평가어, 결론더함, 근거자리, 꼬리, 묶음표지, 물리침, 불용어, 비판표지, 비평관점, 선택표지, 양보표지, 역접더함, 요약서술, 판단서술, 해석서술 } from './sealed/section_words.ts';
import type { 부류판정, 조각 } from './types.ts';

export interface 구간표지 {
  /** 표지사전 「논리펼치기」 대비반론 */
  대비: string[];
  /** 표지사전 「논리펼치기」 결론연결 */
  결론: string[];
  /** 엔진 ② 기능표지 (논리표지 작업) — 찾은 표지가 있는가 */
  기능표지: boolean;
  /** 엔진 답표지 ② 분량 · ④ 완결 (check_human_answer) — null은 따지지 않음 */
  분량: boolean | null;
  완결: boolean;
}

export interface 칸판정 { 결과: 'O' | 'X' | '판정불가'; 근거: string }

export interface 구간측정결과 {
  조각: Record<string, 칸판정>;
  조건: { '① 근거 추출': 칸판정; '③ 매듭': 칸판정; '① 서술 형식': 칸판정; '③ 결론': 칸판정 };
  단계: { 단계: string; 판정: 'O' | 'X' }[];
  어긋남: number;
  등급: number;
  /** 학생이 고른 부류 · 상대 부류 (단락 기호) */
  선택: string[] | null;
  상대: string[];
  /** 학생 묶음 (묶음 문장에서 읽은 두 묶음) */
  학생묶음: string[][] | null;
  /** 논제 유형 — 대응형은 논리펼치기 조건 ①②③을 쓰지 않는다 (/api/axis-grade가 본다) */
  유형: '분류형' | '선택적용형' | '대응형';
}

/** 구간 측정 루브릭인가 — 분류형(묶음) · 선택·적용형(관점선택) · 대응형(대응) 역할 조각이 있다 */
export const is_sectioned = (루브릭: 조각[]) => 루브릭.some((c) => c.역할 === '묶음' || c.역할 === '관점선택' || c.역할 === '대응');

const 문장들of = (글: string) => 글.replace(/\s*\n\s*/g, ' ').split(/(?<=[.?!。])\s+/).map((s) => s.trim()).filter(Boolean);

/** 낱말 → 어간 (꼬리 떼기) → 같은 뜻 대표. 뜻표 = 공통 같은 뜻 + (분류형이면) 그 대립 축의 같은 뜻 (오종래 2026-10-23 ③) */
function 어간(w: string, 뜻표: readonly string[][] = 같은뜻): string {
  let s = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  for (let 바뀜 = true; 바뀜; ) {
    바뀜 = false;
    for (const t of 꼬리) if (s.length > t.length + 1 && s.endsWith(t)) { s = s.slice(0, -t.length); 바뀜 = true; break; }
  }
  const 묶음 = 뜻표.find((g) => g.some((x) => x === s || (x.length >= 2 && s.startsWith(x))));
  return 묶음 ? 묶음[0] : s;
}
function 공통개념들(글: string, 뜻표: readonly string[][] = 같은뜻): Set<string> {
  const 원 = 글.replace(/[[(<][가-하][\])>]/g, ' ');
  const 여러낱말 = 뜻표.flatMap((g) => g.filter((x) => x.includes(' ') && 원.includes(x)).map(() => g[0]));
  return new Set([...여러낱말, ...원.split(/[\s,.?!·'"‘’“”「」()]+/).map((w) => 어간(w, 뜻표)).filter((w) => w.length >= 2 && !불용어.has(w))]);
}
const 있나 = (글: string, 표: readonly string[]) => 표.some((m) => 글.includes(m));
/** 범위 표현 「(라)에서 (사)까지」 「[라]~[사]」 — 참조 범위일 뿐 묶음이 아니다 (오종래 2026-10-23 가) */
const 범위떼기 = (s: string) => s
  .replace(/[[(<][가-하][\])>]\s*(에서|부터)\s*[[(<][가-하][\])>]\s*까지/g, ' ')
  .replace(/[[(<][가-하][\])>]\s*[~∼～]\s*[[(<][가-하][\])>]/g, ' ');

/**
 * 구간 정합성 측정(학생답, 루브릭, 표지) → 조각마다 O/X · 조건 · 일방통행 등급
 * 루브릭의 ① 제시문 조각(단락 · 글)과 묶음 조각의 엔진 부류를 쓴다
 */
export function measure_sections(학생답: string, 루브릭: 조각[], 표: 구간표지): 구간측정결과 {
  if (루브릭.some((c) => c.역할 === '관점선택')) return measure_application(학생답, 루브릭, 표);
  if (루브릭.some((c) => c.역할 === '대응')) return measure_correspondence(학생답, 루브릭, 표);
  const 단락조각 = 루브릭.filter((c) => c.파트 === '근거대기' && c.제시문);
  const 기호들 = 단락조각.map((c) => c.제시문!.단락);
  const 부류: 부류판정 | null = 루브릭.find((c) => c.역할 === '묶음')?.부류 ?? null;
  const 쪽of = (x: string) => (!부류 ? 0 : 부류.부류[0].단락.includes(x) ? 1 : 부류.부류[1].단락.includes(x) ? -1 : 0);
  const 극성 = (s: string) => (부류 ? 축점수(s, 부류.축) : 0);
  // 같은 뜻 — 공통 + 이 부류 대립 축에 딸린 같은 뜻 (오종래 2026-10-23 ③ — 제시문 내용에 기대는 묶음은 축에 둔다)
  const 뜻표 = [...같은뜻, ...(부류 ? 축같은뜻(부류.축) : [])];
  const 개념들 = (글: string) => 공통개념들(글, 뜻표);
  const 단락개념 = new Map(단락조각.map((c) => [c.제시문!.단락, 개념들(c.제시문!.글 ?? '')]));
  // 그 단락에만 있는 개념 — 기호 없이 부른 문장을 알아본다
  const 고유 = new Map(기호들.map((x) => [x, new Set([...단락개념.get(x)!].filter((w) => 기호들.every((y) => y === x || !단락개념.get(y)!.has(w))))]));

  const 문장 = 문장들of(학생답);
  const 명시 = (s: string) => [...new Set(designatedLabels(s))].filter((x) => 기호들.includes(x));
  const 부른 = (s: string) => {
    const e = 명시(s);
    if (e.length) return e;
    const 개 = 개념들(s);
    const 맞은 = 기호들.filter((x) => [...고유.get(x)!].some((w) => 개.has(w)));
    return 맞은.length === 1 ? 맞은 : [];
  };
  const 대비표 = [...표.대비, ...역접더함];

  // 마디 — 묶음 문장 · 요약 마디 · 비판 마디
  const 묶음at = 문장.findIndex((s) => { const t = 범위떼기(s); return 명시(t).length >= 3 || (명시(t).length >= 2 && 묶음표지.test(t)); });
  const 비판at = 문장.findIndex((s, i) => i > 묶음at && 비판표지.test(s));
  const 요약마디 = 묶음at >= 0 ? 문장.slice(묶음at + 1, 비판at < 0 ? undefined : 비판at) : [];
  const 비판마디 = 비판at >= 0 ? 문장.slice(비판at) : [];

  // 학생 묶음 — 기호 사이 글: 길면(설명이 끼면) 경계, 「와/과」는 쉼표가 함께 있을 때 경계
  let 학생묶음: string[][] | null = null;
  if (묶음at >= 0) {
    const s = 범위떼기(문장[묶음at]);
    const 자리 = [...s.matchAll(/[[(<]([가-하])[\])>]/g)].filter((m) => 기호들.includes(m[1]));
    const 틈 = 자리.slice(1).map((m, i) => s.slice(자리[i].index! + 3, m.index!));
    const 쉼표있음 = 틈.some((g) => /^\s*,\s*$/.test(g));
    학생묶음 = [[자리[0]?.[1]].filter(Boolean) as string[]];
    틈.forEach((g, i) => {
      const 경계 = !/^\s*(,|와|과|및|·)\s*$/.test(g) || (쉼표있음 && /^\s*(와|과)\s*$/.test(g));
      if (경계) 학생묶음!.push([]);
      학생묶음!.at(-1)!.push(자리[i + 1][1]);
    });
  }
  const 같은묶음 = (a: string[][], b: string[][]) => a.length === b.length && a.every((g) => b.some((h) => h.length === g.length && h.every((x) => g.includes(x))));

  // 학생이 고른 부류 — 선택 표지 문장의 기호 · 「(마)와 (사)의 관점에서」 · 비판 대상 기호의 반대쪽
  const 엔진묶음 = 부류 ? 부류.부류.map((g) => g.단락) : 학생묶음 ?? [];
  const 묶음of = (xs: string[]) => 엔진묶음.find((g) => xs.length && xs.every((x) => g.includes(x))) ?? null;
  let 선택: string[] | null = null;
  const 선택문장 = 문장.slice(Math.max(0, 묶음at + 1), 비판at < 0 ? undefined : 비판at + 1).find((s) => 선택표지.test(s) && 명시(s).length);
  if (선택문장) 선택 = 묶음of(명시(선택문장));
  if (!선택 && 비판at >= 0) {
    // 비판 마디 첫 문장의 기호 나열 — 뒤가 근거 자리(「의 관점에서」)면 고른 부류, 아니면 비판 대상이라 그 반대쪽
    const s = 문장[비판at];
    const 자리 = [...s.matchAll(/[[(<]([가-하])[\])>]/g)].filter((m) => 기호들.includes(m[1]));
    const 끝기호 = 자리.at(-1);
    if (끝기호) {
      const xs = 자리.map((m) => m[1]);
      if (근거자리.test(s.slice(끝기호.index! + 3))) 선택 = 묶음of(xs);
      else { const 상대묶음 = 묶음of(xs); 선택 = 상대묶음 ? 엔진묶음.find((g) => g !== 상대묶음) ?? null : null; }
    }
  }
  const 상대 = 선택 ? 기호들.filter((x) => !선택!.includes(x)) : [];
  const 선택쪽 = 선택 ? 쪽of(선택[0]) : 0;

  const 조각: Record<string, 칸판정> = {};
  // ① 근거대기 [X] — X만 부른 문장 가운데 하나라도: 극성이 X 쪽 · 또는 극성 없이 X 개념을 담는다 (반대쪽이면 아니다)
  const 단락판정 = new Map<string, 칸판정>();
  for (const c of 단락조각) {
    const x = c.제시문!.단락;
    const 후보 = 문장.filter((s) => { const b = 부른(s); return b.length === 1 && b[0] === x; });
    const 맞은 = 후보.find((s) => { const p = 극성(s) * 쪽of(x); return p > 0 || (극성(s) === 0 && [...개념들(s)].some((w) => 단락개념.get(x)!.has(w))); });
    const r: 칸판정 = !후보.length ? { 결과: 'X', 근거: `[${x}]만 부른 문장이 없다` }
      : 맞은 ? { 결과: 'O', 근거: `[${x}] 문장 「${맞은.slice(0, 60)}」 — 극성 ${극성(맞은)} · [${x}] 쪽 ${쪽of(x)}` }
      : { 결과: 'X', 근거: `[${x}] 문장의 극성이 [${x}] 쪽과 반대 — 「${후보[0].slice(0, 60)}」 (극성 ${극성(후보[0])})` };
    단락판정.set(x, r);
    조각[c.id] = r;
  }
  // ② 세우기
  for (const c of 루브릭.filter((c) => c.파트 === '세우기' && c.역할)) {
    if (c.역할 === '묶음') {
      const ok = !!학생묶음 && 엔진묶음.length > 0 && 같은묶음(학생묶음, 엔진묶음);
      조각[c.id] = { 결과: ok ? 'O' : 'X', 근거: `학생 묶음 ${학생묶음 ? 학생묶음.map((g) => g.map((x) => `[${x}]`).join('·')).join(' / ') : '없음'} · 엔진 부류 ${엔진묶음.map((g) => g.map((x) => `[${x}]`).join('·')).join(' / ')}` };
    } else if (c.역할 === '선택요약') {
      const 단락다 = !!선택 && 선택.every((x) => 단락판정.get(x)?.결과 === 'O');
      const 마디극성 = 요약마디.reduce((a, s) => a + 극성(s), 0) * 선택쪽;
      const ok = 단락다 && 마디극성 > 0;
      조각[c.id] = { 결과: ok ? 'O' : 'X', 근거: !선택 ? '고른 부류를 읽지 못함' : `고른 부류 ${선택.map((x) => `[${x}]`).join('·')} · 단락 소화 ${단락다 ? '모두' : 선택.filter((x) => 단락판정.get(x)?.결과 !== 'O').map((x) => `[${x}] 안 됨`).join(' ')} · 요약 마디 극성 ${마디극성 > 0 ? '고른 쪽' : '아님'}` };
    }
  }
  // ③ 논리펼치기 — 상대비판(상대 단락 차례) · 인정재반박
  const 상대비판 = 루브릭.filter((c) => c.역할 === '상대비판');
  상대비판.forEach((c, k) => {
    const y = 상대[k];
    if (!y) { 조각[c.id] = { 결과: 'X', 근거: 선택 ? `상대 부류 단락이 ${상대.length}개뿐` : '고른 부류를 읽지 못해 상대를 정하지 못함' }; return; }
    const at = 비판마디.findIndex((s, i) => {
      if (!부른(s).includes(y)) return false;
      const 창 = 비판마디.slice(i, i + 3).join(' ');
      // 근거 — 고른 부류 기호 · 고른 쪽 극성 · 또는 상대를 깎는 평가어 (라)
      return 있나(창, 대비표) && (명시(창).some((x) => 선택!.includes(x)) || 극성(창) * 선택쪽 > 0 || 있나(창, 깎는평가어));
    });
    조각[c.id] = at >= 0 ? { 결과: 'O', 근거: `상대 [${y}] 비판 — 「${비판마디[at].slice(0, 60)}」 뒤 대비 표지와 고른 쪽 근거` }
      : { 결과: 'X', 근거: 비판마디.some((s) => 부른(s).includes(y)) ? `[${y}]를 불렀으나 대비 표지 · 고른 쪽 근거가 이어지지 않음` : `비판 마디에서 상대 [${y}]를 부르지 않음` };
  });
  for (const c of 루브릭.filter((c) => c.역할 === '인정재반박')) {
    const at = 문장.findIndex((s, i) => {
      const j = 양보표지.map((m) => s.indexOf(m)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
      if (j === undefined) return false;
      return 있나(s.slice(j), 대비표) || 있나(문장.slice(i + 1, i + 3).join(' '), 대비표);
    });
    조각[c.id] = at >= 0 ? { 결과: 'O', 근거: `양보 → 역접 「${문장[at].slice(0, 60)}」` } : { 결과: 'X', 근거: '양보 표지 뒤 역접(인정 뒤 재반박)이 없음' };
  }

  // 조건 — 논리 ① 근거 추출 · ③ 매듭 · 답표현 ① 서술 형식 · ③ 결론
  const 모든개념 = new Set([...단락개념.values()].flatMap((s) => [...s]));
  const 대비문장 = 비판마디.filter((s) => 있나(s, 대비표));
  const 근거없는 = 대비문장.filter((s) => !명시(s).length && ![...개념들(s)].some((w) => 모든개념.has(w)));
  // 결론 자리 (나) — 마지막 결론 표지 문장부터 끝까지, 없으면 마지막 두 문장. 문단(OCR 쪽 바뀜에 끊긴다)으로 가르지 않는다
  const 결론표 = [...표.결론, ...결론더함];
  const 결론at = 문장.reduce((at, s, i) => (i >= Math.max(0, 비판at) && 있나(s, 결론표) ? i : at), -1);
  const 결론자리 = 결론at >= 0 ? 문장.slice(결론at) : 문장.slice(-2);
  const 끝 = 결론자리.join(' '), 끝문장 = 결론자리.at(-1) ?? '';
  // ③ 매듭 · ③ 결론 (다) — 극성 대신 판단 서술로 닫히는가 · 결론은 상대를 겨누는가(상대 기호 · 비판 말 · 깎는 평가어)
  const 닫힘 = 결론at >= 0 || 판단서술.test(끝문장);
  const 겨눔 = 명시(끝).some((x) => 상대.includes(x)) || 비판표지.test(끝) || 있나(끝, 깎는평가어);
  const 조건 = {
    '① 근거 추출': (대비문장.length && !근거없는.length ? { 결과: 'O', 근거: `대비 문장 ${대비문장.length}개 모두 제시문 기호 · 개념` } : { 결과: 'X', 근거: 대비문장.length ? `제시문 근거 없는 대비 문장 — 「${근거없는[0].slice(0, 50)}」` : '비판 마디에 대비 문장이 없음' }) as 칸판정,
    '③ 매듭': (닫힘 ? { 결과: 'O', 근거: 결론at >= 0 ? `결론 표지 문장 「${문장[결론at].slice(0, 40)}」` : `판단 서술로 닫힘 「${끝문장.slice(-40)}」` } : { 결과: 'X', 근거: `결론 표지 · 판단 서술 없이 끝남 「${끝문장.slice(-40)}」` }) as 칸판정,
    '① 서술 형식': (묶음at >= 0 && 요약마디.length && 비판마디.length ? { 결과: 'O', 근거: '묶음 · 요약 · 비판 세 마디' } : { 결과: 'X', 근거: `마디 빠짐 — 묶음 ${묶음at >= 0 ? 'O' : 'X'} · 요약 ${요약마디.length ? 'O' : 'X'} · 비판 ${비판마디.length ? 'O' : 'X'}` }) as 칸판정,
    '③ 결론': (닫힘 && 겨눔 ? { 결과: 'O', 근거: '결론 자리가 판단으로 닫히고 상대를 겨눔' } : { 결과: 'X', 근거: `결론 자리 — 닫힘 ${닫힘 ? 'O' : 'X'} · 상대 겨눔(상대 기호 · 비판 말 · 깎는 평가어) ${겨눔 ? 'O' : 'X'}` }) as 칸판정,
  };

  // 일방통행 (10-2) — 근거대기 · 세우기 · 논리펼치기 · 답표현하기
  const 판 = (xs: { 결과: string }[]) => (xs.some((x) => x.결과 === 'X') ? 'X' : 'O') as 'O' | 'X'; // 판정불가(교사 칸)는 단계 판정에서 뺀다
  const 파트칸 = (p: string) => 루브릭.filter((c) => c.파트 === p && 조각[c.id]).map((c) => 조각[c.id]);
  const 단계 = [
    { 단계: '근거대기', 판정: 판(파트칸('근거대기')) },
    { 단계: '세우기', 판정: 판(파트칸('세우기')) },
    { 단계: '논리펼치기', 판정: 판([...파트칸('풀기'), 조건['① 근거 추출'], { 결과: 표.기능표지 ? 'O' : 'X' }, 조건['③ 매듭']]) },
    { 단계: '답표현하기', 판정: 판([조건['① 서술 형식'], { 결과: 표.분량 === false ? 'X' : 'O' }, 조건['③ 결론'], { 결과: 표.완결 ? 'O' : 'X' }]) },
  ];
  const 어긋남 = 단계.filter((s) => s.판정 === 'X').length;
  return { 조각, 조건, 단계, 어긋남, 등급: 어긋남 === 0 ? 4 : 어긋남 === 1 ? 3 : 어긋남 === 2 ? 2 : 1, 선택, 상대, 학생묶음, 유형: '분류형' };
}

/**
 * 선택·적용형 측정 (오종래 2026-10-23 추천안 1~4) — 「두 관점 중 하나를 선택하고, 그 관점에서 [다]를 해석」.
 * 고른 관점 = 관점 기호 바로 뒤 고르기 자리(「(가)를 통해 해석」 「[나]의 관점에서」) · 대상 구절 = 따옴표 인용 · 대상 글과 겹치는 2어절 · 대상에만 있는 낱말(시어).
 * 관점 개념어 = 고른 관점 단락에 가장 많이 나오는 비평 관점 묶음 + 그 단락에만 있는 개념
 */
function measure_application(학생답: string, 루브릭: 조각[], 표: 구간표지): 구간측정결과 {
  const 개념들 = (글: string) => 공통개념들(글);
  const 후보 = 루브릭.find((c) => c.역할 === '고른관점')?.관점후보 ?? [];
  const 대상 = 루브릭.find((c) => c.역할 === '대상')?.적용대상 ?? { 단락: '', 글: '' };
  const 후보기호 = 후보.map((p) => p.단락);
  const 문장 = 문장들of(학생답);
  const 명시 = (s: string) => [...new Set(designatedLabels(s))].filter((x) => 후보기호.includes(x) || x === 대상.단락);
  // 관점마다 비평 관점 묶음 · 고유 개념
  const 묶음of = (글: string) => [...비평관점].sort((a, b) => b.낱말.filter((w) => 글.includes(w)).length - a.낱말.filter((w) => 글.includes(w)).length)[0];
  const 개념of = new Map(후보.map((p) => [p.단락, 개념들(p.글)]));
  const 대상개념 = 개념들(대상.글);
  const 고유of = (x: string) => new Set([...개념of.get(x)!].filter((w) => 후보.every((p) => p.단락 === x || !개념of.get(p.단락)!.has(w)) && !대상개념.has(w)));
  // 대상 구절 — 대상 줄(시는 행, 산문은 문장) 번호로 센다
  const 줄 = 대상.글.split(/\n|(?<=[.?!。])\s+/).map((l) => l.trim()).filter(Boolean);
  const 붙임 = (s: string) => s.replace(/\s+/g, '');
  const 시어 = new Set([...대상개념].filter((w) => 후보.every((p) => !개념of.get(p.단락)!.has(w))));
  const 구절of = (s: string): number[] => {
    const 찾은 = new Set<number>();
    const 넣기 = (조각글: string) => 줄.forEach((l, i) => { if (조각글.length >= 2 && 붙임(l).includes(붙임(조각글))) 찾은.add(i); });
    for (const m of s.matchAll(/['‘"“「]([^'’"”」]{2,})['’"”」]/g)) 넣기(m[1].replace(/(라는|이라는|는|은|이|가|을|를|의)$/, ''));
    const 낱 = s.split(/\s+/);
    for (let i = 0; i + 1 < 낱.length; i++) 넣기(`${낱[i]} ${낱[i + 1]}`.replace(/[^\p{L}\p{N}\s]/gu, ''));
    for (const w of 개념들(s)) if (시어.has(w)) 줄.forEach((l, i) => { if (개념들(l).has(w)) 찾은.add(i); });
    return [...찾은];
  };

  // 고른 관점 — 관점 기호 바로 뒤 고르기 자리
  let 고른: string | null = null, 고른문장 = -1;
  문장.some((s, i) => {
    for (const m of s.matchAll(/[[(<]([가-하])[\])>]/g)) {
      if (후보기호.includes(m[1]) && 고르기자리.test(s.slice(m.index! + 3))) { 고른 = m[1]; 고른문장 = i; return true; }
    }
    return false;
  });
  const 고른관점 = 고른 as string | null;
  const 관점묶음 = 고른관점 ? 묶음of(후보.find((p) => p.단락 === 고른관점)!.글) : null;
  const 개념어 = new Set([...(고른관점 ? 고유of(고른관점) : []), ...(관점묶음?.낱말 ?? [])]);
  const 개념수 = (s: string) => [...개념어].filter((w) => s.includes(w)).length;

  const 조각: Record<string, 칸판정> = {};
  const 칸 = (역할: string, r: 칸판정) => 루브릭.filter((c) => c.역할 === 역할).forEach((c) => (조각[c.id] = r));
  // ① 근거대기
  const 관점문장 = 고른관점 ? 문장.find((s) => 명시(s).includes(고른관점) && 개념수(s) >= 2) : undefined;
  칸('고른관점', 관점문장 ? { 결과: 'O', 근거: `[${고른관점}] 개념 「${[...개념어].filter((w) => 관점문장.includes(w)).join(' · ')}」 — 「${관점문장.slice(0, 50)}」` }
    : { 결과: 'X', 근거: 고른관점 ? `[${고른관점}]을 부르며 그 관점 개념을 둘 이상 담은 문장이 없음` : '고른 관점을 읽지 못함' });
  const 구절문장 = 문장.map((s, i) => ({ i, 구절: 구절of(s) })).filter((x) => x.구절.length);
  칸('대상', 구절문장.length ? { 결과: 'O', 근거: `[${대상.단락}] 구절 ${[...new Set(구절문장.flatMap((x) => x.구절))].length}곳을 가져옴` } : { 결과: 'X', 근거: `[${대상.단락}]의 구절을 가져오지 않음` });
  // ② 세우기
  칸('관점선택', 고른관점 ? { 결과: 'O', 근거: `고르기 자리 「${문장[고른문장].slice(0, 50)}」 → [${고른관점}]` } : { 결과: 'X', 근거: '관점 기호 뒤 고르기 자리(「~의 관점에서」 「~를 통해 해석」)가 없음' });
  // 해석 문장 — 대상 구절 + (같은 · 다음 문장에) 관점 개념어 + 해석 서술
  const 해석 = 구절문장.filter(({ i }) => { const 창 = 문장.slice(i, i + 2).join(' '); return 개념수(창) >= 1 && 해석서술.test(창); });
  // 관점요약 (나) — 관점 선택 문장까지와 그 뒤 두 문장 안에서. 「이는」 같은 지시어로 앞 문장의 관점을 받아도 인정
  const 부른관점 = (i: number) => !!고른관점 && (명시(문장[i]).includes(고른관점) || (/^(이는|이것은|이러한|이 관점은|이 입장은)/.test(문장[i]) && i > 0 && 명시(문장[i - 1]).includes(고른관점)));
  const 요약at = 고른관점 ? 문장.slice(0, 고른문장 + 3).findIndex((s, i) => 부른관점(i) && 개념수(s) >= 1 && (요약서술.test(s) || 판단서술.test(s))) : -1;
  const 요약 = 요약at >= 0 ? 문장[요약at] : undefined;
  칸('관점요약', 요약 ? { 결과: 'O', 근거: `관점 선택 둘레 「${요약.slice(0, 60)}」` } : { 결과: 'X', 근거: '관점 선택 둘레에 고른 관점의 논지를 세운 문장이 없음' });
  // ③ 논리펼치기 — 서로 다른 구절 두 곳 · 관점일관
  const 덮은 = new Set<number>(); const 쓴: number[] = [];
  for (const h of 해석) { const 새 = h.구절.find((x) => !덮은.has(x)); if (새 !== undefined) { 덮은.add(새); 쓴.push(h.i); } }
  루브릭.filter((c) => c.역할 === '적용해석').forEach((c, k) => {
    조각[c.id] = 쓴[k] !== undefined ? { 결과: 'O', 근거: `「${문장[쓴[k]].slice(0, 60)}」 — 구절 + 관점 개념 + 해석` } : { 결과: 'X', 근거: `서로 다른 구절의 해석이 ${쓴.length}곳뿐` };
  });
  // 관점일관 (오종래 2026-10-23 확정) — 내재 관점을 고른 답이 해석 근거로 명시적 외재 표현(작가 생애 · 시대 사건 · 창작 배경)을 쓸 때만 엔진이 X.
  //   물리치려고 부른 문장(부정 · 경계 · 대비)은 근거가 아니다. 그 밖(외재 관점을 고른 답 포함)은 교사 판정
  const 내재선택 = !!관점묶음 && 관점묶음.이름.startsWith('내재');
  const 해석근거 = 문장.filter((s, i) => (구절문장.some((x) => x.i === i) || 명시(s).includes(대상.단락)) && !물리침.test(s) && !있나(s, [...표.대비, ...역접더함]));
  const 외재근거 = 내재선택 ? 해석근거.find((s) => 외재표현.test(s)) : undefined;
  칸('관점일관', 외재근거 ? { 결과: 'X', 근거: `내재 관점인데 해석 근거로 외재 표현 「${외재근거.match(외재표현)![0]}」 — 「${외재근거.slice(0, 50)}」` }
    : { 결과: '판정불가', 근거: 내재선택 ? '명시적 외재 근거 없음 — 관점일관은 교사 판정' : `고른 관점이 ${관점묶음?.이름 ?? '미확인'} — 관점일관은 교사 판정` });

  // 조건
  const 결론표 = [...표.결론, ...결론더함];
  const 결론at = 문장.reduce((at, s, i) => (있나(s, 결론표) ? i : at), -1);
  const 결론자리 = 결론at >= 0 ? 문장.slice(결론at) : 문장.slice(-2);
  const 끝 = 결론자리.join(' '), 끝문장 = 결론자리.at(-1) ?? '';
  const 닫힘 = 결론at >= 0 || 판단서술.test(끝문장);
  const 대상부름 = 명시(끝).includes(대상.단락) || 결론자리.some((s) => 구절of(s).length > 0) || /작품|시/.test(끝);
  const 관점부름 = (!!고른관점 && 명시(끝).includes(고른관점)) || 개념수(끝) >= 1;
  // 결론 (다) — 결론 자리가 대상의 해석 결과를 말하는가: 방법론 · 일반론이 아니고, 대상을 부르며 해석 서술이 있는 문장이 하나 이상
  const 결과문장 = 결론자리.filter((s) => !방법론.test(s) && (명시(s).includes(대상.단락) || 구절of(s).length > 0 || /작품|시/.test(s)) && 해석서술.test(s));
  const 조건 = {
    '① 근거 추출': (쓴.length ? { 결과: 'O', 근거: `대상 구절을 관점으로 푼 해석 ${쓴.length}곳` } : { 결과: 'X', 근거: '대상 구절을 관점 개념으로 푼 문장이 없음' }) as 칸판정,
    '③ 매듭': (닫힘 ? { 결과: 'O', 근거: 결론at >= 0 ? `결론 표지 문장 「${문장[결론at].slice(0, 40)}」` : `판단 서술로 닫힘 「${끝문장.slice(-40)}」` } : { 결과: 'X', 근거: `결론 표지 · 판단 서술 없이 끝남 「${끝문장.slice(-40)}」` }) as 칸판정,
    '① 서술 형식': (고른관점 && 요약 && 쓴.length ? { 결과: 'O', 근거: '선택 · 요약 · 해석 세 마디' } : { 결과: 'X', 근거: `마디 빠짐 — 선택 ${고른관점 ? 'O' : 'X'} · 요약 ${요약 ? 'O' : 'X'} · 해석 ${쓴.length ? 'O' : 'X'}` }) as 칸판정,
    '③ 결론': (닫힘 && 대상부름 && 관점부름 && 결과문장.length ? { 결과: 'O', 근거: `결론 자리가 해석 결과를 말함 — 「${결과문장[0].slice(0, 50)}」` }
      : { 결과: 'X', 근거: `결론 자리 — 닫힘 ${닫힘 ? 'O' : 'X'} · 대상 ${대상부름 ? 'O' : 'X'} · 관점 ${관점부름 ? 'O' : 'X'} · 해석 결과 ${결과문장.length ? 'O' : 'X (방법론 · 일반론으로 끝남)'}` }) as 칸판정,
  };
  const 판 = (xs: { 결과: string }[]) => (xs.some((x) => x.결과 === 'X') ? 'X' : 'O') as 'O' | 'X'; // 판정불가(교사 칸)는 단계 판정에서 뺀다
  const 파트칸 = (p: string) => 루브릭.filter((c) => c.파트 === p && 조각[c.id]).map((c) => 조각[c.id]);
  const 단계 = [
    { 단계: '근거대기', 판정: 판(파트칸('근거대기')) },
    { 단계: '세우기', 판정: 판(파트칸('세우기')) },
    { 단계: '논리펼치기', 판정: 판([...파트칸('풀기'), 조건['① 근거 추출'], { 결과: 표.기능표지 ? 'O' : 'X' }, 조건['③ 매듭']]) },
    { 단계: '답표현하기', 판정: 판([조건['① 서술 형식'], { 결과: 표.분량 === false ? 'X' : 'O' }, 조건['③ 결론'], { 결과: 표.완결 ? 'O' : 'X' }]) },
  ];
  const 어긋남 = 단계.filter((s) => s.판정 === 'X').length;
  return { 조각, 조건, 단계, 어긋남, 등급: 어긋남 === 0 ? 4 : 어긋남 === 1 ? 3 : 어긋남 === 2 ? 2 : 1, 선택: 고른관점 ? [고른관점] : null, 상대: 후보기호.filter((x) => x !== 고른관점), 학생묶음: null, 유형: '선택적용형' };
}

/** 원문자 ⓐ~ⓩ → 로마자 a~z (학생이 「a는」 「(a)」로 쓴다). 그 밖의 원문자는 없음 */
const 로마자of = (기호: string) => {
  const c = 기호.codePointAt(0)! - 0x24d0;
  return c >= 0 && c < 26 ? String.fromCharCode(0x61 + c) : null;
};
const 붙여 = (s: string) => s.replace(/\s+/g, '');

const 원문자식 = '[\\u24D0-\\u24E9\\u2460-\\u2473\\u3260-\\u326D]';
const 낱말식 = (w: string) => [...w.replace(/\s+/g, '')].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');

/**
 * 대응형 측정 (오종래 2026-10-23 — 1 정답 짝은 루브릭에 직접 · 2 논리펼치기 조건 뺌 · A · B · C 구역 자르기 추천안 확정).
 * 사례를 부른 자리 = 기호 · 로마자 기호 · 표현 (괄호 · 따옴표만 사이에 두고 붙으면 한 번). 범위 「ⓐ~ⓓ」는 부른 것이 아니다.
 * 문장마다: B 나열 묶음 먼저 → C 나머지를 절로 나눠 사례에 붙임 → A 문장 끝에서 닫음 (이어받기 지시어 문장은 앞 문장 마지막 사례에).
 * 대응 = 구역에 정답 범주 또는 정답 집단 · 다른 범주 후보가 섞이면 X (원전 확정 해석)
 */
function measure_correspondence(학생답: string, 루브릭: 조각[], 표: 구간표지): 구간측정결과 {
  const 사례들 = 루브릭.find((c) => c.역할 === '사례')?.사례목록?.사례 ?? 루브릭.filter((c) => c.역할 === '대응' && c.사례).map((c) => c.사례!);
  const 범주 = 루브릭.find((c) => c.범주)?.범주 ?? null;
  const 후보 = 범주?.후보 ?? [];
  const 범주들at = (글: string) => 후보.flatMap((w) => [...글.matchAll(new RegExp(낱말식(w), 'gu'))].map((m) => ({ w, at: m.index! }))).sort((a, b) => a.at - b.at).map((x) => x.w);
  const 모든집단 = 사례들.flatMap((x) => (x.정답?.집단 ?? []));
  const 집단들at = (글: string) => 모든집단.flatMap((w) => [...글.matchAll(new RegExp(낱말식(w), 'gu'))].map((m) => ({ w, at: m.index! }))).sort((a, b) => a.at - b.at).map((x) => x.w);

  const 구역 = new Map<string, string>();
  const 더함 = (기호: string, 글: string) => 구역.set(기호, `${구역.get(기호) ?? ''} ${글}`);
  const 총괄만 = new Set<string>(), 따로 = new Set<string>();
  const 문장들 = 학생답.split(/(?<=[.?!。])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  let 앞문장끝: string | null = null;
  for (const 원문장 of 문장들) {
    // 범위 「ⓐ~ⓓ」는 지운다 (자리는 그대로 — 공백으로)
    const s = 원문장.replace(new RegExp(`${원문자식}\\s*[~～\\-]\\s*${원문자식}`, 'gu'), (m) => ' '.repeat(m.length));
    const 자리: { 기호: string; at: number; end: number }[] = [];
    for (const x of 사례들) {
      const 식들 = [x.기호.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ...(로마자of(x.기호) ? [`(?<![A-Za-z])${로마자of(x.기호)}(?![A-Za-z])`] : []), ...(x.표현.length >= 2 ? [x.표현] : [])];
      for (const m of s.matchAll(new RegExp(식들.join('|'), 'gu'))) 자리.push({ 기호: x.기호, at: m.index!, end: m.index! + m[0].length });
    }
    자리.sort((a, b) => a.at - b.at);
    const 부름: typeof 자리 = [];
    for (const z of 자리) {
      const 앞 = 부름.at(-1);
      if (앞 && 앞.기호 === z.기호 && /^[\s()（）'"‘’“”]*$/.test(s.slice(앞.end, z.at))) 앞.end = Math.max(앞.end, z.end);
      else if (!앞 || z.at >= 앞.end) 부름.push({ ...z });
    }
    // A — 사례를 부르지 않은 문장: 이어받기 지시어로 시작하면 앞 문장 마지막 사례에, 아니면 버림
    //   이어받기는 바로 다음 문장만 — 이어받지 않은 문장 뒤에서는 끊는다
    if (!부름.length) {
      if (앞문장끝 && 이어받기지시어.test(s)) 더함(앞문장끝, s);
      else 앞문장끝 = null;
      continue;
    }
    // B — 나열 묶음 (사례 둘 이상이 나열 이음말만 사이에 두고)
    const 묶음칸 = new Array(s.length).fill(false);
    const 묶음안 = new Set<number>();
    for (let i = 0; i < 부름.length; ) {
      let j = i;
      while (j + 1 < 부름.length && 부름[j + 1].기호 !== 부름[j].기호 && 나열이음.test(s.slice(부름[j].end, 부름[j + 1].at))) j++;
      if (j > i) {
        const 묶음 = 부름.slice(i, j + 1);
        const 꼬리끝 = 부름[j + 1]?.at ?? s.length;
        const 꼬리 = s.slice(부름[j].end, 꼬리끝);
        const 범주순 = 범주들at(꼬리), 집단순 = 집단들at(꼬리);
        const 순서 = 각각표지.test(꼬리) || (!총괄표지.test(꼬리) && 범주순.length === 묶음.length);
        if (순서) {
          // 많으면 끝 맞춤(남은 것은 첫 사례에) · 적으면 앞 맞춤(남은 사례는 없음)
          const 나눔 = (xs: string[]) => {
            const n = 묶음.length;
            if (xs.length <= n) return 묶음.map((_, k) => (k < xs.length ? [xs[k]] : []));
            const 남 = xs.length - n + 1;
            return 묶음.map((_, k) => (k === 0 ? xs.slice(0, 남) : [xs[남 + k - 1]]));
          };
          const 범 = 나눔(범주순), 집 = 나눔(집단순);
          묶음.forEach((z, k) => { 더함(z.기호, [...범[k], ...집[k]].join(' ')); 따로.add(z.기호); });
        } else 묶음.forEach((z) => { if (!구역.has(z.기호)) 구역.set(z.기호, ''); 총괄만.add(z.기호); });
        for (let p = 묶음[0].at; p < 꼬리끝; p++) 묶음칸[p] = true;
        for (let k = i; k <= j; k++) 묶음안.add(k);
        i = j + 1;
      } else i++;
    }
    // C — 나머지를 절로 나눠 붙인다 (묶음 자리는 지움)
    const 남은 = [...s].map((ch, p) => (묶음칸[p] ? ' ' : ch)).join('');
    const 절들: { 글: string; at: number }[] = [];
    let 시작 = 0;
    for (const m of 남은.matchAll(new RegExp(`,|，|${절경계.source}`, 'g'))) { 절들.push({ 글: 남은.slice(시작, m.index!), at: 시작 }); 시작 = m.index! + m[0].length; }
    절들.push({ 글: 남은.slice(시작), at: 시작 });
    let 앞사례: string | null = null;
    for (const 절 of 절들) {
      // 묶음 자리는 다음 사례를 부른 자리까지 지워져 있어, 사례 없는 절의 앞 사례는 이 절 앞에서 따로 부른 사례다 (문장 머리면 버림)
      const 안 = 부름.filter((z, k) => !묶음안.has(k) && z.at >= 절.at && z.at < 절.at + 절.글.length);
      if (!안.length) { if (앞사례 && 절.글.trim()) 더함(앞사례, 절.글); continue; }
      if (안.length === 1) { 더함(안[0].기호, 절.글); 따로.add(안[0].기호); 앞사례 = 안[0].기호; continue; }
      const 머리 = 절.글.slice(0, 안[0].at - 절.at);
      if (앞사례 && 머리.trim()) 더함(앞사례, 머리);
      안.forEach((z, k) => { 더함(z.기호, s.slice(z.at, 안[k + 1]?.at ?? 절.at + 절.글.length)); 따로.add(z.기호); });
      앞사례 = 안.at(-1)!.기호;
    }
    // 다음 문장의 이어받기 지시어가 받는 사례 = 이 문장에서 마지막으로 부른 사례. 나열 묶음으로 끝나면 지시어는 묶음 전체를 가리켜 받지 않는다
    앞문장끝 = 묶음안.has(부름.length - 1) ? null : 부름.at(-1)!.기호;
  }
  for (const x of 따로) 총괄만.delete(x);
  const 범주in = (글: string) => 후보.filter((w) => 붙여(글).includes(붙여(w)));
  const 집단in = (글: string, x: (typeof 사례들)[number]) => (x.정답?.집단 ?? []).filter((w) => 글.includes(w));
  // 구역에 내용이 있는가 — 문장 부호 · 공백 · 머리 조사(「와」 「는」)를 떼고 두 글자 이상 (나열 「쪽발이와 흑형」의 「와」는 내용이 아니다)
  const 내용 = (글: string) => 글.replace(/[\s,.·、()（）'"‘’“”]/g, '').replace(/^(은|는|이|가|와|과|및)/, '').length >= 2;

  const 조각: Record<string, 칸판정> = {};
  // ① 근거대기
  const 안부른 = 사례들.filter((x) => !구역.has(x.기호)).map((x) => x.기호);
  루브릭.filter((c) => c.역할 === '사례').forEach((c) => (조각[c.id] = !안부른.length
    ? { 결과: 'O', 근거: `사례 ${사례들.map((x) => x.기호).join('·')}를 모두 불렀다` }
    : { 결과: 'X', 근거: `부르지 않은 사례 ${안부른.join('·')}` }));
  const 쓴범주 = 범주in(학생답);
  루브릭.filter((c) => c.역할 === '범주').forEach((c) => (조각[c.id] = 쓴범주.length
    ? { 결과: 'O', 근거: `(${범주!.단락})의 ${범주!.이름} 「${쓴범주.join(' · ')}」` }
    : { 결과: 'X', 근거: `(${범주?.단락 ?? '?'})의 범주 후보를 쓰지 않음` }));
  // ③ 논리펼치기 — 사례마다 대응
  루브릭.filter((c) => c.역할 === '대응' && c.사례).forEach((c) => {
    const x = c.사례!, 글 = 구역.get(x.기호);
    if (!x.정답) { 조각[c.id] = { 결과: '판정불가', 근거: `루브릭에 ${x.기호} 정답 짝이 없음 — 교사 판정` }; return; }
    if (글 === undefined) { 조각[c.id] = { 결과: 'X', 근거: `${x.기호}(${x.표현})를 부르지 않음 — 미작성` }; return; }
    if (총괄만.has(x.기호)) { 조각[c.id] = { 결과: 'X', 근거: `${x.기호}(${x.표현})는 총괄 나열(「모두」 · 「등」)에만 나옴 — 따로 서술하지 않음` }; return; }
    const 정답 = x.정답, 쓴 = 범주in(글), 섞임 = 쓴.filter((w) => w !== 정답.범주), 집단 = 집단in(글, x);
    조각[c.id] = 섞임.length ? { 결과: 'X', 근거: `${x.기호} 구역에 다른 범주 「${섞임.join(' · ')}」 섞임` }
      : 쓴.includes(정답.범주) || 집단.length ? { 결과: 'O', 근거: `${x.기호} 구역 「${[...쓴, ...집단].join(' · ')}」 — 정답 ${정답.범주}` }
      : { 결과: 'X', 근거: `${x.기호} 구역에 범주 · 집단이 없음 — 「${글.trim().slice(0, 40)}」` };
  });

  // 답표현하기 조건 — ① 각각 서술 · ③ 출구(구역마다 범주 · 집단 서술). 논리펼치기 조건은 대응형에 없다 (오종래 2)
  const 빈구역 = 사례들.filter((x) => !구역.has(x.기호) || !내용(구역.get(x.기호)!)).map((x) => x.기호);
  const 출구못 = 사례들.filter((x) => { const 글 = 구역.get(x.기호); return 글 === undefined || (!범주in(글).length && !집단in(글, x).length); }).map((x) => x.기호);
  const 없음: 칸판정 = { 결과: '판정불가', 근거: '대응형 — 논리펼치기 조건 없음 (오종래 2026-10-23)' };
  const 조건 = {
    '① 근거 추출': 없음,
    '③ 매듭': 없음,
    '① 서술 형식': (!빈구역.length ? { 결과: 'O', 근거: `사례 ${사례들.length}개를 각각 서술` } : { 결과: 'X', 근거: `따로 서술하지 않은 사례 ${빈구역.join('·')}` }) as 칸판정,
    '③ 결론': (!출구못.length ? { 결과: 'O', 근거: `사례마다 ${범주?.핵심어 ?? '범주'} · 집단에 닿음` } : { 결과: 'X', 근거: `${범주?.핵심어 ?? '범주'} · 집단에 닿지 않은 사례 ${출구못.join('·')}` }) as 칸판정,
  };
  const 판 = (xs: { 결과: string }[]) => (xs.some((x) => x.결과 === 'X') ? 'X' : 'O') as 'O' | 'X'; // 판정불가(교사 칸)는 단계 판정에서 뺀다
  const 파트칸 = (p: string) => 루브릭.filter((c) => c.파트 === p && 조각[c.id]).map((c) => 조각[c.id]);
  // 세우기는 조각이 없어 단계에서 뺀다 — 어긋남은 세 단계로 센다
  const 단계 = [
    { 단계: '근거대기', 판정: 판(파트칸('근거대기')) },
    { 단계: '논리펼치기', 판정: 판(파트칸('풀기')) },
    { 단계: '답표현하기', 판정: 판([조건['① 서술 형식'], { 결과: 표.분량 === false ? 'X' : 'O' }, 조건['③ 결론'], { 결과: 표.완결 ? 'O' : 'X' }]) },
  ];
  const 어긋남 = 단계.filter((s) => s.판정 === 'X').length;
  return { 조각, 조건, 단계, 어긋남, 등급: 어긋남 === 0 ? 4 : 어긋남 === 1 ? 3 : 어긋남 === 2 ? 2 : 1, 선택: null, 상대: [], 학생묶음: null, 유형: '대응형' };
}
