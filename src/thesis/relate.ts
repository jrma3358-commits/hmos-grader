// C·논술 6단계 — 제시문 단락 급소의 관계 → 6유형 → 기존 논제와 비교 (엔진, [봉인⑭]).
//
// HMOS 절대 원칙 (오종래 2026-10-13): 엔진이 잡고 AI는 문장만 쓴다. 엔진이 못 잡은 관계는 AI로 채우지 않는다.
// [오종래 2026-10-14] 6단계 순서:
//   ① 3단계 단락 급소를 단락 둘씩 비교·대조  ② 관계 판정: 유사/대비/보완/병렬
//   ③ 관계별 실체 추출  ④ 관계 → 6유형 (논제 문장은 Claude)  ⑤ 기존 논제와 비교 → 추가/보완
//   보완은 5단계 정교화로 넘긴다 (오종래 2026-10-14).
// [봉인⑭ 초안 — 오종래 확정 전] ②의 조건·④의 대응표는 조립설명서 6단계 절의 초안이다.
//   [오종래 2026-10-14] ② 대비 = 논제 B 종류가 같으면 (같은 열쇠 기준을 바꿈) — 같은종류()
// 입력은 2·3·4단계 엔진 결과뿐이다 (align_passage 산출 + recognizePassage 산출).

import { contains, passageLabels, type PassageRecognition } from '../fq/v2/passage.ts';
import type { Color } from '../fq/types.ts';
import type { 정합엔진 } from './align.ts';

export type 관계유형 = '유사' | '대비' | '보완' | '병렬';
export type 논제유형 = '비교·대비' | '공통원리' | '근거·주장' | '대안제시' | '선택·응용' | '인연·비판';

/** ① 비교 단위 — 4단계가 세운 단락 급소 하나 */
export interface 급소단락 {
  /** 제시문 기호 (기호 없으면 「#순번」) */
  단락: string;
  /** paragraphs의 자리 */
  자리: number;
  급소: string;
  /** 닿은 논제 열쇠 (connectPassage key) */
  열쇠: string;
  /** 이 급소를 세운 소문항들 */
  소문항: (string | null)[];
}

export type 관계실체 =
  | { 관계: '유사'; 공통: string[] }
  | { 관계: '대비'; 기준: string; 차이: [string, string] }
  | { 관계: '보완'; 빈곳: string; 채움: { 단락: string; 색: Color; 실체: string }[] }
  | { 관계: '병렬'; 나열: [string, string] };

export interface 단락관계 {
  앞: 급소단락;
  뒤: 급소단락;
  실체: 관계실체;
  /** ④ 관계 → 6유형 */
  유형: 논제유형[];
  /** ⑤ 기존 논제와 비교 */
  판단: '추가' | '보완' | '덮음';
  /** 보완·덮음이면 그 소문항 */
  소문항?: string | null;
  근거: string;
}

/** [봉인⑭ ④ 초안] 관계 → 6유형 */
export const 관계유형표: Record<관계유형, 논제유형[]> = {
  대비: ['비교·대비', '선택·응용', '인연·비판'],
  유사: ['공통원리'],
  보완: ['근거·주장', '대안제시'],
  병렬: ['비교·대비', '공통원리'],
};

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');

/** ① 4단계 연결에서 급소 단락을 모은다 — 같은 단락·같은 실체는 하나 */
export function 급소단락들(정합: 정합엔진, passage: PassageRecognition): 급소단락[] {
  const labels = passageLabels(passage.paragraphs);
  const out: 급소단락[] = [];
  for (const s of 정합.소문항) {
    s.연결.pivots.forEach((pv, i) => {
      if (!pv) return;
      const 급소 = clean(pv.entity);
      const same = out.find((x) => x.자리 === i && x.급소 === 급소);
      if (same) {
        if (!same.소문항.includes(s.번호)) same.소문항.push(s.번호);
        return;
      }
      out.push({ 단락: labels[i] ?? `#${i + 1}`, 자리: i, 급소, 열쇠: pv.key, 소문항: [s.번호] });
    });
  }
  return out.sort((a, b) => a.자리 - b.자리);
}

/**
 * 논제 B 종류가 같은가 [오종래 2026-10-14] — 같은 논제 B이거나, 첫 어절(주체 자리)을 뺀 어절이 하나라도 같다
 * (「B국이 시행한 대응조치」·「D국이 시행한 정책」 → 「시행한」). 같으면 기준(같은 B, 또는 같은 어절)을, 아니면 undefined.
 */
export function 같은종류(가: string, 나: string): string | undefined {
  if (가 === 나) return 가;
  const 뒤어절 = (s: string) => clean(s).split(/\s+/).slice(1);
  const 나어절 = 뒤어절(나);
  const 같은 = 뒤어절(가).filter((w) => 나어절.includes(w));
  return 같은.length ? 같은.join(' ') : undefined;
}

/** 단락의 노드 가운데 실체가 급소를 품은 것 — 그 단락의 급소 노드(같은 실체)는 뺀다 */
function 품은노드(passage: PassageRecognition, 자리: number, 급소: string, 자기급소: string[]) {
  return passage.paragraphs[자리].graph.nodes
    .filter((n) => n.color && !자기급소.includes(clean(n.entity)) && contains(clean(n.entity), 급소))
    .map((n) => ({ 색: n.color as Color, 실체: clean(n.entity) }));
}

/** ②③ 두 급소 단락의 관계와 실체 — 위에서부터 먼저 맞는 것 */
function 관계of(a: 급소단락, b: 급소단락, passage: PassageRecognition, 급소목록: 급소단락[]): 관계실체 {
  // 1 유사 — 같은 실체. 공통 근거 = 두 단락 B 노드 가운데 서로 품는 실체
  if (contains(a.급소, b.급소)) {
    const bs = (i: number) => passage.paragraphs[i].graph.nodes.filter((n) => n.color === 'B').map((n) => clean(n.entity));
    const 뒤B = bs(b.자리);
    const 공통 = [...new Set(bs(a.자리).filter((x) => 뒤B.some((y) => contains(x, y))))];
    return { 관계: '유사', 공통: 공통.includes(a.급소) ? 공통 : [a.급소, ...공통] };
  }
  // 2 대비 — 논제 B 종류가 같은데 실체가 다르다 (오종래 2026-10-14)
  const 기준 = 같은종류(a.열쇠, b.열쇠);
  if (기준) return { 관계: '대비', 기준, 차이: [a.급소, b.급소] };
  // 3 보완 — 한 급소를 다른 단락이 (급소 노드 밖에서) 다시 다룬다
  const 자기 = (i: number) => 급소목록.filter((x) => x.자리 === i).map((x) => x.급소);
  for (const [빈, 채] of [
    [a, b],
    [b, a],
  ] as const) {
    const 노드 = 품은노드(passage, 채.자리, 빈.급소, 자기(채.자리));
    if (노드.length) return { 관계: '보완', 빈곳: 빈.급소, 채움: 노드.map((n) => ({ 단락: 채.단락, ...n })) };
  }
  // 4 병렬
  return { 관계: '병렬', 나열: [a.급소, b.급소] };
}

/** ⑤ 기존 논제와 비교 — 4단계 연결선과 참조 범위로 */
function 판단of(a: 급소단락, b: 급소단락, 정합: 정합엔진): Pick<단락관계, '판단' | '소문항' | '근거'> {
  const 연결 = (s: 정합엔진['소문항'][number], i: number) => !!s.연결.pivots[i];
  const 범위안 = (s: 정합엔진['소문항'][number], i: number) => !s.연결.outOfScope.includes(i);
  const 덮은 = 정합.소문항.find((s) => 연결(s, a.자리) && 연결(s, b.자리));
  if (덮은) return { 판단: '덮음', 소문항: 덮은.번호, 근거: `소문항 ${덮은.번호}이 [${a.단락}]·[${b.단락}] 두 단락에 모두 연결됨` };
  for (const s of 정합.소문항) {
    for (const [있는, 없는] of [
      [a, b],
      [b, a],
    ] as const) {
      if (연결(s, 있는.자리) && 범위안(s, 없는.자리)) {
        return { 판단: '보완', 소문항: s.번호, 근거: `소문항 ${s.번호}이 [${있는.단락}]에 연결되고 [${없는.단락}]가 참조 범위 안 — 5단계로 넘김` };
      }
    }
  }
  return { 판단: '추가', 근거: `[${a.단락}]·[${b.단락}]를 함께 묻는 소문항이 없음` };
}

/**
 * [봉인⑭] 6단계 엔진 — 단락 급소 쌍마다 관계·실체·유형·추가/보완 판단.
 * 급소 단락이 둘 미만이면 빈 배열 (맞대 볼 쌍이 없다).
 */
export function 봉인14_단락관계(정합: 정합엔진, passage: PassageRecognition): 단락관계[] {
  const 목록 = 급소단락들(정합, passage);
  const out: 단락관계[] = [];
  for (let i = 0; i < 목록.length; i++) {
    for (let j = i + 1; j < 목록.length; j++) {
      const [a, b] = [목록[i], 목록[j]];
      if (a.자리 === b.자리) continue; // 단락 간만 본다
      const 실체 = 관계of(a, b, passage, 목록);
      out.push({ 앞: a, 뒤: b, 실체, 유형: 관계유형표[실체.관계], ...판단of(a, b, 정합) });
    }
  }
  return out;
}
