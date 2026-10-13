// C·논술 논제 → 공통 발문 + 소문항 (조립설명서 C·논술 9단계, 2단계 논제 인식의 입구).
//
// [오종래 2026-10-13] 소문항마다 따로 인식한다 — (1-1)·(1-2)를 한 그래프에 그리지 않는다.
// [오종래 2026-10-13] 공통 발문(「제시문 [가], [나], [다]를 참고하여 다음의 물음에 답하시오.」)은 떼어 내고 C-F를 판정한다.
//   공통 발문은 인식에 넣지 않는다. 참조 제시문 범위만 소문항에 물려준다.
//
// 이 파일이 하지 않는 것:
//   - 인식 (recognizeV2Analysis가 한다)
//   - 계단식 단계형(A·B)의 소문항 분리 — 그건 [봉인⑦]이다. 여기는 C 논제만 본다

import { designatedLabels, PASSAGE_REFERENCE } from '../fq/v2/passage.ts';

export interface 소문항 {
  /** 「1-1」 같은 번호. 번호 없는 논제 하나면 null */
  번호: string | null;
  /** 인식에 넣을 글 — 번호와 공통 발문을 뗀 소문항 본문 */
  텍스트: string;
  /** 이 소문항이 딸린 문항의 공통 발문 (없으면 빈 문자열) */
  공통발문: string;
  /** 참조 제시문 기호 — 소문항 자신의 참조가 먼저, 없으면 공통 발문의 참조. 둘 다 없으면 빈 배열 (= 모든 제시문) */
  참조: string[];
}

/** 소문항 번호 「(1-1)」 — 글 머리, 줄 머리, 또는 문장 끝(. ? ! 。) 뒤 */
const ITEM = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*\((\d+-\d+)\)[ \t]*/g;
/** 문항 머리 「[문항 1]」·「문제 1」 — 공통 발문이 여기서 새로 시작한다 */
const HEAD = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*(?:\[문항\s*\d+\]|문제\s*\d+)/g;

function 참조of(text: string): string[] {
  const last = [...text.matchAll(PASSAGE_REFERENCE)].at(-1);
  return last ? designatedLabels(last[1]) : [];
}

/**
 * 논제 → 소문항들. 「(N-M)」 번호가 없으면 논제 전체가 소문항 하나다 (번호 null, 공통 발문 없음).
 * 공통 발문 = 문항 머리(또는 글 처음)부터 그 문항의 첫 소문항 번호 앞까지.
 */
export function split_thesis(논제: string): 소문항[] {
  const text = 논제.replace(/\r\n?/g, '\n');
  const items = [...text.matchAll(ITEM)];
  if (!items.length) {
    const t = text.trim();
    return t ? [{ 번호: null, 텍스트: t, 공통발문: '', 참조: 참조of(t) }] : [];
  }
  const heads = [...text.matchAll(HEAD)].map((m) => m.index!);

  return items.map((m, k) => {
    const start = m.index! + m[0].length;
    const nextItem = items[k + 1]?.index ?? text.length;
    // 다음 소문항 앞에 문항 머리가 있으면 거기서 끊는다 (다음 문항의 공통 발문)
    const nextHead = heads.find((h) => h >= start && h < nextItem);
    const body = text.slice(start, nextHead ?? nextItem).trim();

    // 공통 발문 — 이 소문항 앞의 마지막 문항 머리(없으면 글 처음)부터, 그 뒤 첫 소문항 번호 앞까지
    const head = heads.filter((h) => h <= m.index!).at(-1) ?? 0;
    const first = items.find((x) => x.index! >= head)!;
    const 공통발문 = text.slice(head, first.index!).trim();

    const 자기참조 = 참조of(body);
    return { 번호: m[1], 텍스트: body, 공통발문, 참조: 자기참조.length ? 자기참조 : 참조of(공통발문) };
  });
}
