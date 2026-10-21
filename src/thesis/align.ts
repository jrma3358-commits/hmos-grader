// C·논술 4단계 — 논제 급소 ↔ 제시문 단락 급소 연결 (엔진).
//
// HMOS 절대 원칙 (오종래 2026-10-13): 제시문에서 논제 급소와 닿는 급소를 엔진이 추출하고, 엔진이 대조한다.
//   AI는 엔진이 잡은 연결을 문장으로 구성할 뿐이다. 엔진이 못 잡은 것은 AI로 채우지 않는다.
//
// 단락 급소는 엔진의 connectPassage가 세운다 (제시문 급소 규칙 — 논제가 방향, 서두·말미 B, keyword 포함).
// 소문항마다 따로 잇는다. 참조 범위는 소문항이 들고 온 참조(공통 발문에서 물려받은 것)다.
//
// [오종래 2026-10-13] 사족 = 논제가 요구하는 실체의 근거가 제시문에 없는 것.
//   논제 급소가 제시문 어느 단락 급소와도 연결되지 않으면 사족 (단락 단위).
//   연결선 = 그 논제 급소(노드)를 열쇠로 세워진 단락 급소. 논제의 다른 B를 열쇠로 선 단락 급소는 그 급소의 연결이 아니다.
//   급소가 서지 않은 소문항은 사족을 가리지 않는다 (급소불명확은 ⑬ ③의 몫).
// [오종래 2026-10-13] 논술 논제 급소 = Q 앞 B+C 덩어리 (thesis/chunk.ts). 제시문과는 덩어리의 B(실체)로 잇는다 — C는 방향·범위다.
// [오종래 2026-10-15 안 A] 논제가 기호로 직접 짚은 단락(지정)도 그 덩어리의 연결이다 — 사족이 아니다. 단락 급소 실체는 없다(자리 「지정」).

import type { V2Analysis } from '../fq/pipeline.ts';
import { essay_pivot_chunks } from './chunk.ts';
import { math_symbols } from './math_essay.ts';
import { connectPassage, passageLabels, type PassageConnection, type PassageRecognition } from '../fq/v2/passage.ts';
import type { 사족노드 } from '../filter/sealed/items.ts';

/** 제시문 라벨 — 한 글자 기호(가·나·ㄱ…)와 로마 숫자(I·II…). 화면이 머리 기호에서 떼어 id로 넘긴다 */
const 라벨id = /^(?:[가-하ㄱ-ㅎ]|I{1,3}|IV|VI{0,3}|IX|X)$/;

/**
 * 라벨 없는 단일 제시문 [오종래 2026-10-20 확정] — 〈제시문〉·<제시문> 머리 뒤에 [가][나] 같은 라벨 없이 한 덩어리로 이어지는 본문은
 * 통째로 배경(P)이다. 단락 급소·수렴 경로를 세우지 않고 논제 급소와 잇지 않는다 (사족 진단도 없다). 라벨 있는 제시문은 기존대로 단락마다.
 * 제시문이 꼭 하나이고 라벨이 없으면 그 본문, 아니면 null
 */
export function background_passage(제시문: readonly { id: string; 텍스트: string }[]): string | null {
  if (제시문.length !== 1 || 라벨id.test(제시문[0].id)) return null;
  const 글 = 제시문[0].텍스트.trim();
  return 글 || null;
}

/**
 * 〈보기〉 별도 배경 블록 [오종래 2026-10-20 확정] — 〈보기〉·<보기> 머리 블록(화면이 id 「보기」로 넘긴다)은 〈제시문〉과 동급인 별도 배경(P)이다.
 * 제시문 정합·수렴 경로·관계·루브릭 연결에 넣지 않는다. 제시문 목록 → { 보기, 제시문(나머지) }
 */
export function box_passages<T extends { id: string; 텍스트: string }>(제시문: readonly T[]): { 보기: T[]; 제시문: T[] } {
  return { 보기: 제시문.filter((p) => p.id === '보기'), 제시문: 제시문.filter((p) => p.id !== '보기') };
}

/**
 * 각주·주의사항 줄 떼기 [오종래 2026-10-20 확정] (숭실대 경상계열 스마트폰) — 제시문 분석(단락 급소·수렴 경로·메시지·루브릭 연결)에 넣지 않는다.
 *   「※」로 시작하는 줄 (「※ 양(+)의 상관 관계: …」) · 「〈주의사항…〉」「<주의사항…>」 줄
 */
export function strip_passage_notes(텍스트: string): string {
  return 텍스트
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((줄) => !/^[ \t　]*※/.test(줄) && !/^[ \t　]*[〈<][ \t]*주의사항/.test(줄))
    .join('\n')
    .trim();
}

/**
 * 병렬 자료 표 [오종래 2026-10-20 확정] (숭실대 경상계열) — 제시문 안 〈자료 N〉·<자료 N>·[자료 N] 머리로 여는 단락.
 * 제목 = 머리 뒤 「(단위…)」·줄 끝·「 - 」 앞까지 (「〈자료 1〉학생 성별 사용시간(단위: %)」 → 「학생 성별 사용시간」)
 */
const 자료머리 = /^[ \t]*[〈<\[][ \t]*자료[ \t]*(\d+)[ \t]*[〉>\]][ \t]*/;
export function data_tables(단락글: readonly string[]): { 번호: string; 제목: string; 단락: number }[] {
  return 단락글.flatMap((t, i) => {
    const m = 자료머리.exec(t);
    if (!m) return [];
    const 제목 = t.slice(m[0].length).split(/\(\s*단위|\n|\s-\s/)[0].trim();
    return [{ 번호: m[1], 제목: 제목 || `자료 ${m[1]}`, 단락: i }];
  });
}
/** 논제가 부른 자료 번호 — 「[자료 N]」「〈자료 N〉」「<자료 N>」 (부른 차례, 겹침 없이) */
export const data_calls = (글: string): string[] => [...new Set([...글.matchAll(/[〈<\[][ \t]*자료[ \t]*(\d+)[ \t]*[〉>\]]/g)].map((m) => m[1]))];

/** 2단계 산출 — 소문항 하나 (엔진) */
export interface 인식소문항 {
  번호: string | null;
  참조: string[];
  인식: V2Analysis;
  /** 「[자료 N]」 호출을 찾을 글 — 소문항 본문 + 공통 발문 (2026-10-20). 없으면 인식한 본문만 */
  호출글?: string;
  /** 앞 소논제에서 이어받아 이 소문항 노드에 얹힌 실체와 그 노드 — 4단계 열쇠에 더한다 (2026-10-21) */
  이어열쇠?: { key: string; node: string }[];
}

export interface 단락연결 {
  /** 제시문 기호 (기호 없는 단락이면 단락 순번 「#1」). 자료 표는 「가-자료1」 */
  단락: string;
  /** 단락 급소 실체 — 지정 연결이면 빈 글 (단락 급소가 서지 않았다). 자료 표는 표 제목 */
  단락급소: string;
  /** 서두·말미 = 단락 급소로 이은 것 · 지정 = 논제가 기호로 그 단락을 짚은 것 (오종래 2026-10-15) · 자료 = 논제가 부른 자료 표 (2026-10-20) */
  자리: '서두' | '말미' | '지정' | '자료';
  /** 자료 표 단락 순번 (자리 「자료」일 때만) */
  문단?: number;
  /** 급소가 아닌 논제 B로 닿은 단락이면 그 논제 B 실체 (오종래 2026-10-21) */
  논제B?: string;
  /** 앞 소논제에서 이어받은 실체로 닿은 단락이면 그 실체 (오종래 2026-10-21) */
  이어받기?: string;
}

/** 논제 급소 하나의 연결 */
export interface 급소연결 {
  소문항: string | null;
  /** 덩어리의 B 실체 */
  급소: string;
  /** 덩어리 실체 (C · B · C) */
  덩어리: string;
  /** 덩어리 B 노드 id */
  노드: string;
  단락: 단락연결[];
}

export interface 정합엔진 {
  연결: 급소연결[];
  사족: 사족노드[];
  /** 엔진 connectPassage 원본 — 소문항마다 */
  소문항: { 번호: string | null; 연결: PassageConnection }[];
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');

/** 수학 기호 겹침 — 단락 B와 논제 열쇠에 같은 수학 기호(lim·접선·f(x)·E(X) …)가 있으면 닿는다 */
const 기호겹침 = (a: string, b: string) => {
  const 열쇠 = math_symbols(b);
  return 열쇠.length > 0 && math_symbols(a).some((x) => 열쇠.includes(x));
};

/**
 * 4단계 엔진 — 논제 급소마다 이어진 단락 급소, 이어진 단락이 없는 급소는 사족.
 * 수리 형식(C-2a·C-2b)은 단락 B와 논제 열쇠를 글자 대신 수학 기호로 맞댄다 [오종래 2026-10-21 확정]. 인문논술은 글자 그대로
 */
export function align_passage(소문항들: 인식소문항[], passage: PassageRecognition, 옵션: { 수리?: boolean } = {}): 정합엔진 {
  const labels = passageLabels(passage.paragraphs);
  const 이름 = (i: number) => labels[i] ?? `#${i + 1}`;
  const 연결: 급소연결[] = [];
  const 원본: 정합엔진['소문항'] = [];
  const 자료들 = data_tables(passage.paragraphs.map((p) => p.text));

  for (const s of 소문항들) {
    const c = connectPassage(s.인식, passage, s.참조, 옵션.수리 ? 기호겹침 : undefined, s.이어열쇠 ?? []);
    const 이어실체 = new Set((s.이어열쇠 ?? []).map((k) => clean(k.key)));
    원본.push({ 번호: s.번호, 연결: c });
    const 덩어리들 = essay_pivot_chunks(s.인식.graph, s.인식.pivot);
    // 병렬 자료 표 [오종래 2026-10-20 확정] — 논제가 「[자료 N]」을 부르면 그 자료 표가 이 소문항의 제시문 B (단락 급소 = 표 제목). 소문항 덩어리마다 잇는다
    const 부른자료 = data_calls(s.호출글 ?? s.인식.question).flatMap((n) => 자료들.filter((x) => x.번호 === n))
      .map((x): 단락연결 => ({ 단락: `${이름(x.단락)}-자료${x.번호}`, 단락급소: x.제목, 자리: '자료', 문단: x.단락 }));
    const 자리of = (id: string) => s.인식.graph.nodes.find((n) => n.id === id)?.index ?? -1;
    const 급소B = new Set(덩어리들.map((d) => d.B.id));
    덩어리들.forEach((d, k) => {
      const 단락: 단락연결[] = [];
      const 끝 = 자리of(d.Q.at(-1)!.id);
      const 앞끝 = k > 0 ? 자리of(덩어리들[k - 1].Q.at(-1)!.id) : -1;
      // 덩어리 구간 — 앞 덩어리의 마지막 Q 뒤 ~ 이 덩어리의 마지막 Q. 마지막 덩어리는 그 뒤 노드까지
      const 구간안 = (at: number) => at > 앞끝 && (at <= 끝 || k === 덩어리들.length - 1);
      c.pivots.forEach((pv, i) => {
        if (pv && pv.questionNode === d.B.id) 단락.push({ 단락: 이름(i), 단락급소: clean(pv.entity), 자리: pv.place, ...(이어실체.has(pv.key) ? { 이어받기: pv.key } : {}) });
        // 논제 B 연결 [오종래 2026-10-21 확정] — 급소가 아닌 논제 B(관련 정보)로 닿은 단락도 4단계 연결이다.
        //   그 논제 B가 선 덩어리 구간의 급소에 단다 (지정 연결과 같은 구간)
        else if (pv && 이어실체.has(pv.key) && 구간안(자리of(pv.questionNode))) {
          // 이어받은 실체로 닿은 단락 (2026-10-21) — 그 실체가 얹힌 노드의 덩어리 구간에
          단락.push({ 단락: 이름(i), 단락급소: clean(pv.entity), 자리: pv.place, 이어받기: pv.key });
        } else if (pv && !급소B.has(pv.questionNode) && 구간안(자리of(pv.questionNode))) {
          const 논제B = clean(s.인식.graph.nodes.find((n) => n.id === pv.questionNode)?.entity ?? pv.key);
          단락.push({ 단락: 이름(i), 단락급소: clean(pv.entity), 자리: pv.place, 논제B });
        }
      });
      // 지정 연결 [오종래 2026-10-15 안 A] — 논제가 기호로 짚은 단락(「(나)의 ⓐ~ⓓ」「(라)의 핵심 개념과」「(가), (다)…를 활용하여」)은
      //   그 덩어리의 연결 단락이다. 덩어리 구간(앞 덩어리의 마지막 Q 뒤 ~ 이 덩어리의 마지막 Q)에 선 노드의 지정만 받는다.
      //   이미 단락 급소로 이은 단락은 그대로. 6단계는 connectPassage pivots로 단락 급소만 모으므로 지정 연결은 6단계에 들지 않는다 (ⓑ)
      for (const l of c.links) {
        if (l.kind !== '지정') continue;
        const at = 자리of(l.questionNode);
        if (at <= 앞끝 || at > 끝) continue;
        const 이름i = 이름(l.paragraph);
        if (!단락.some((x) => x.단락 === 이름i)) 단락.push({ 단락: 이름i, 단락급소: '', 자리: '지정' });
      }
      단락.push(...부른자료);
      연결.push({ 소문항: s.번호, 급소: clean(d.B.entity), 덩어리: d.실체, 노드: d.B.id, 단락 });
    });
  }

  const 사족 = 연결.filter((x) => !x.단락.length).map((x) => ({ 소문항: x.소문항, 급소: x.급소 }));
  return { 연결, 사족, 소문항: 원본 };
}
