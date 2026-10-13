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

import type { V2Analysis } from '../fq/pipeline.ts';
import type { Pivot } from '../fq/v2/pivot.ts';
import { connectPassage, passageLabels, type PassageConnection, type PassageRecognition } from '../fq/v2/passage.ts';
import type { 사족노드 } from '../filter/sealed/items.ts';

/** 2단계 산출 — 소문항 하나 (엔진) */
export interface 인식소문항 {
  번호: string | null;
  참조: string[];
  인식: V2Analysis;
}

export interface 단락연결 {
  /** 제시문 기호 (기호 없는 단락이면 단락 순번 「#1」) */
  단락: string;
  /** 단락 급소 실체 */
  단락급소: string;
  자리: '서두' | '말미';
}

/** 논제 급소 하나의 연결 */
export interface 급소연결 {
  소문항: string | null;
  급소: string;
  /** 논제 급소 노드 id */
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
const 급소들 = (a: V2Analysis): Pivot[] => (a.pivot.ok ? (a.pivot.pivots ?? [a.pivot.pivot]) : []);

/** 4단계 엔진 — 논제 급소마다 이어진 단락 급소, 이어진 단락이 없는 급소는 사족 */
export function align_passage(소문항들: 인식소문항[], passage: PassageRecognition): 정합엔진 {
  const labels = passageLabels(passage.paragraphs);
  const 이름 = (i: number) => labels[i] ?? `#${i + 1}`;
  const 연결: 급소연결[] = [];
  const 원본: 정합엔진['소문항'] = [];

  for (const s of 소문항들) {
    const c = connectPassage(s.인식, passage, s.참조);
    원본.push({ 번호: s.번호, 연결: c });
    for (const p of 급소들(s.인식)) {
      const 단락: 단락연결[] = [];
      c.pivots.forEach((pv, i) => {
        if (pv && pv.questionNode === p.node.id) 단락.push({ 단락: 이름(i), 단락급소: clean(pv.entity), 자리: pv.place });
      });
      연결.push({ 소문항: s.번호, 급소: clean(p.keyword ?? p.node.entity), 노드: p.node.id, 단락 });
    }
  }

  const 사족 = 연결.filter((x) => !x.단락.length).map((x) => ({ 소문항: x.소문항, 급소: x.급소 }));
  return { 연결, 사족, 소문항: 원본 };
}
