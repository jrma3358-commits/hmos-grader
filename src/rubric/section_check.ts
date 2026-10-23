// 구간 정합성 측정 — 인문 분류형 논제의 학생 답을 네비게이션 경로 4구간 입구 · 출구에 대본다 (오종래 2026-10-23 설계 확정).
// 글자 대조가 아니다: 문장마다 부른 단락(기호 · 그 단락만의 개념) · 축 극성(대립 축 어휘, 「아니라」 밀침) · 기능표지(대비 · 결론 · 양보)를 인식해
// 구간마다 통과(O/X)를 정한다. Claude는 쓰지 않는다. 낱말 목록은 봉인(sealed/section_words.ts · group.ts · 표지사전 「논리펼치기」).
// 답구하기 배점은 처방전_규칙 10-2 일방통행 어긋남 등급 — 네 구간 판정에서 센다.
import { designatedLabels } from '../fq/v2/passage.ts';
import { 축점수 } from './sealed/group.ts';
import { 같은뜻, 깎는평가어, 결론더함, 근거자리, 꼬리, 묶음표지, 불용어, 비판표지, 선택표지, 양보표지, 역접더함, 판단서술 } from './sealed/section_words.ts';
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

export interface 칸판정 { 결과: 'O' | 'X'; 근거: string }

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
}

/** 분류형 루브릭인가 — 역할 조각(묶음 · 상대비판)이 있다 */
export const is_sectioned = (루브릭: 조각[]) => 루브릭.some((c) => c.역할 === '묶음');

const 문장들of = (글: string) => 글.replace(/\s*\n\s*/g, ' ').split(/(?<=[.?!。])\s+/).map((s) => s.trim()).filter(Boolean);

/** 낱말 → 어간 (꼬리 떼기) → 같은 뜻 대표 */
function 어간(w: string): string {
  let s = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  for (let 바뀜 = true; 바뀜; ) {
    바뀜 = false;
    for (const t of 꼬리) if (s.length > t.length + 1 && s.endsWith(t)) { s = s.slice(0, -t.length); 바뀜 = true; break; }
  }
  const 묶음 = 같은뜻.find((g) => g.some((x) => x === s || (x.length >= 2 && s.startsWith(x))));
  return 묶음 ? 묶음[0] : s;
}
function 개념들(글: string): Set<string> {
  const 원 = 글.replace(/[[(<][가-하][\])>]/g, ' ');
  const 여러낱말 = 같은뜻.flatMap((g) => g.filter((x) => x.includes(' ') && 원.includes(x)).map(() => g[0]));
  return new Set([...여러낱말, ...원.split(/[\s,.?!·'"‘’“”「」()]+/).map(어간).filter((w) => w.length >= 2 && !불용어.has(w))]);
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
  const 단락조각 = 루브릭.filter((c) => c.파트 === '근거대기' && c.제시문);
  const 기호들 = 단락조각.map((c) => c.제시문!.단락);
  const 부류: 부류판정 | null = 루브릭.find((c) => c.역할 === '묶음')?.부류 ?? null;
  const 쪽of = (x: string) => (!부류 ? 0 : 부류.부류[0].단락.includes(x) ? 1 : 부류.부류[1].단락.includes(x) ? -1 : 0);
  const 극성 = (s: string) => (부류 ? 축점수(s, 부류.축) : 0);
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
  const 판 = (xs: { 결과: string }[]) => (xs.some((x) => x.결과 !== 'O') ? 'X' : 'O') as 'O' | 'X';
  const 파트칸 = (p: string) => 루브릭.filter((c) => c.파트 === p && 조각[c.id]).map((c) => 조각[c.id]);
  const 단계 = [
    { 단계: '근거대기', 판정: 판(파트칸('근거대기')) },
    { 단계: '세우기', 판정: 판(파트칸('세우기')) },
    { 단계: '논리펼치기', 판정: 판([...파트칸('풀기'), 조건['① 근거 추출'], { 결과: 표.기능표지 ? 'O' : 'X' }, 조건['③ 매듭']]) },
    { 단계: '답표현하기', 판정: 판([조건['① 서술 형식'], { 결과: 표.분량 === false ? 'X' : 'O' }, 조건['③ 결론'], { 결과: 표.완결 ? 'O' : 'X' }]) },
  ];
  const 어긋남 = 단계.filter((s) => s.판정 === 'X').length;
  return { 조각, 조건, 단계, 어긋남, 등급: 어긋남 === 0 ? 4 : 어긋남 === 1 ? 3 : 어긋남 === 2 ? 2 : 1, 선택, 상대, 학생묶음 };
}
