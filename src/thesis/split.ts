// C·논술 논제 → 공통 발문 + 소문항 (조립설명서 C·논술 9단계, 2단계 논제 인식의 입구).
//
// [오종래 2026-10-13] 소문항마다 따로 인식한다 — (1-1)·(1-2)를 한 그래프에 그리지 않는다.
// [오종래 2026-10-13] 공통 발문(「제시문 [가], [나], [다]를 참고하여 다음의 물음에 답하시오.」)은 떼어 내고 C-F를 판정한다.
//   공통 발문은 인식에 넣지 않는다. 참조 제시문 범위만 소문항에 물려준다.
// [오종래 2026-10-14] 계단 「(1)(2)(3)」도 따로 인식한다 — 5단계 ② 서술복잡의 처방(소문항 계단)으로 나눈 논제를
//   한 소문항으로 읽으면 B가 다시 셋 이상이 되어 서술복잡이 그대로 남는다. 계단 번호는 「1」, 소문항 안이면 「2-1-1」.
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
/**
 * 계단 번호 「(1)」 — 글 머리, 줄 머리, 문장 끝 뒤 (소문항 본문 안에서 찾으므로 소문항 번호 바로 뒤도 글 머리다).
 * 문장 가운데의 「(1)의 변화」는 계단이 아니다.
 */
const STEP = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*\((\d+)\)[ \t]*/g;
/** 문항 머리 「[문항 1]」·「문제 1」 — 공통 발문이 여기서 새로 시작한다 */
const HEAD = /(?:^|(?<=\n)|(?<=[.?!。]))[ \t]*(?:\[문항\s*\d+\]|문제\s*\d+)/g;

function 참조of(text: string): string[] {
  const last = [...text.matchAll(PASSAGE_REFERENCE)].at(-1);
  return last ? designatedLabels(last[1]) : [];
}

/**
 * 소문항 하나 → 계단들. 본문에 계단 번호 「(N)」가 없으면 그대로. 있으면 계단마다 한 단위 —
 * 번호 = 「N」(소문항 번호가 있으면 「소문항-N」), 첫 계단 앞 글(계단의 발문)은 공통 발문에 잇는다,
 * 참조 = 계단 자신 → 계단 발문 → 소문항의 참조 순서.
 */
function 계단으로(u: 소문항): 소문항[] {
  const steps = [...u.텍스트.matchAll(STEP)];
  if (!steps.length) return [u];
  const 발문 = u.텍스트.slice(0, steps[0].index!).trim();
  const 공통발문 = [u.공통발문, 발문].filter(Boolean).join('\n');
  const 위참조 = 참조of(발문).length ? 참조of(발문) : u.참조;
  return steps.map((m, k) => {
    const body = u.텍스트.slice(m.index! + m[0].length, steps[k + 1]?.index ?? u.텍스트.length).trim();
    const 자기참조 = 참조of(body);
    return { 번호: u.번호 ? `${u.번호}-${m[1]}` : m[1], 텍스트: body, 공통발문, 참조: 자기참조.length ? 자기참조 : 위참조 };
  });
}

/**
 * 논제 → 소문항들. 「(N-M)」 번호가 없으면 논제 전체가 소문항 하나다 (번호 null, 공통 발문 없음).
 * 공통 발문 = 문항 머리(또는 글 처음)부터 그 문항의 첫 소문항 번호 앞까지.
 * 소문항(또는 논제 전체) 안의 계단 「(1)(2)(3)」은 계단마다 나눈다 (계단으로).
 */
export function split_thesis(논제: string): 소문항[] {
  const text = 논제.replace(/\r\n?/g, '\n');
  const items = [...text.matchAll(ITEM)];
  if (!items.length) {
    const t = text.trim();
    return t ? 계단으로({ 번호: null, 텍스트: t, 공통발문: '', 참조: 참조of(t) }) : [];
  }
  const heads = [...text.matchAll(HEAD)].map((m) => m.index!);

  return items.flatMap((m, k) => {
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
    return 계단으로({ 번호: m[1], 텍스트: body, 공통발문, 참조: 자기참조.length ? 자기참조 : 참조of(공통발문) });
  });
}
