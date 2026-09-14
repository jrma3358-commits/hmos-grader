// 논리스위치 사전 — ENGINE_LOGIC.md STEP 6 "매핑 원칙" / HMOS_CORE_SPEC.md §3.1
// 조사·어미에 한정하지 않는다. 연결어·부사도 동등한 5색 신호다.
// (논리스위치 14 가중치는 봉인 — 여기에는 공개된 표층 패턴만 둔다)

import type { Color, SwitchKind } from './types.ts';

export interface SwitchRule {
  id: string;
  kind: SwitchKind;
  pattern: RegExp;
  candidates: Color[];
}

/** 절 끝에서 찾는 스위치. 위에서부터 먼저 맞는 것이 절의 종결 스위치가 된다. */
export const END_RULES: SwitchRule[] = [
  {
    id: 'Q.명령',
    kind: '조사·어미',
    pattern:
      /(구하시오|구하여라|구하라|구하고|서술하시오|서술하고|서술하라|쓰시오|쓰고|쓰라|고르시오|고르고|설명하시오|설명하고|논하시오|나타내시오|보이시오|증명하시오)$/,
    candidates: ['Q'],
  },
  { id: 'Q.의문', kind: '조사·어미', pattern: /(인가|은|는)\?$/, candidates: ['Q'] },
  {
    id: 'D.정의',
    kind: '조사·어미',
    pattern: /(라\s*하자|라\s*할\s*때|라\s*정의할\s*때|로\s*정의한다|로\s*정의하자|로\s*나타낼\s*때|라\s*한다)$/,
    candidates: ['D'],
  },
  { id: 'B.대하여', kind: '조사·어미', pattern: /에\s*(대하여|대해)$/, candidates: ['B'] },
  {
    id: 'C.조건',
    kind: '조사·어미',
    pattern: /(때|이면|하면|되면|되도록|경우)$/,
    candidates: ['C'],
  },
  // 서술문(~이다, ~있다)은 상황(P)일 수도, 제약(C)일 수도 있다 → 7형식으로 확정
  { id: 'C|P.서술', kind: '조사·어미', pattern: /다$/, candidates: ['C', 'P'] },
];

/** 절 앞에서 찾는 스위치 (주로 연결어) */
export const START_RULES: SwitchRule[] = [
  {
    id: 'P.무대',
    kind: '조사·어미',
    pattern: /^(그림과\s*같이|다음과\s*같이|아래와\s*같이|표와\s*같이|좌표평면\s*위에)(?:[,\s]|$)/,
    candidates: ['P'],
  },
  { id: 'C.단서', kind: '연결어', pattern: /^(단|그러나|하지만|다만|단지)(?:[,\s]|$)/, candidates: ['C'] },
  { id: 'D.환언', kind: '연결어', pattern: /^(즉|다시\s*말하면|여기서)(?:[,\s]|$)/, candidates: ['D'] },
  // "이때" → P(상황) 또는 C(특정 시점 제약)
  { id: 'P|C.이때', kind: '연결어', pattern: /^(이때|이\s*경우)(?:[,\s]|$)/, candidates: ['P', 'C'] },
  { id: 'Q.귀결', kind: '연결어', pattern: /^(따라서|그러므로|이를\s*이용하여)(?:[,\s]|$)/, candidates: ['Q'] },
];

/** 절 어디에서나 찾는 제약 부사 */
export const ADVERB_RULE: SwitchRule = {
  id: 'C.부사',
  kind: '부사',
  pattern: /(반드시|오직|항상|절대로|관계없이|최대한|최소한|처음으로|가장|오로지)/,
  candidates: ['C'],
};

/** 절 경계: 이 토큰 뒤에서 절이 끊긴다 */
export const CLAUSE_BOUNDARY =
  /(때|대하여|대해|하자|이면|하면|되면|되도록|구하고|서술하고|쓰고|고르고|설명하고)(?=[\s,]|$)|(?<=[가-힣]),|[.!?](?=\s|$)/g;

/** 목적어(~을/를)를 받아 대상을 조작하는 동사 — "B를 나열할 때"는 제약이 아니라 대상 소환이다 */
export const OPERATION_VERB = /(나열|배열|세우|세울|뽑|선택|택하|택할|나누|나눌|만들|만드|늘어놓|배치|분배)/;

/** Q 목적어 안에서 C를 품는 관형 수식어 끝 */
export const MODIFIER_END = /(는|인|된|때의)$/;

/** Q 목적어 수식어 중 C가 아니라 Q 자체의 과정을 가리키는 것 */
export const Q_PROCESS_MODIFIER = /^(구하는|구한|찾는|계산하는|결정하는)$/;

export const Q_VERB_BASE: [RegExp, string][] = [
  [/^구하/, '구하시오'],
  [/^서술/, '서술하시오'],
  [/^쓰/, '쓰시오'],
  [/^고르/, '고르시오'],
  [/^설명/, '설명하시오'],
  [/^논하/, '논하시오'],
  [/^나타내/, '나타내시오'],
  [/^보이/, '보이시오'],
  [/^증명/, '증명하시오'],
];

/** C가 B의 원소에 부과하는 범주 */
export const CATEGORIES: { name: string; test: (item: string) => boolean }[] = [
  { name: '모음', test: (x) => /^[aeiou]$/i.test(x) },
  { name: '자음', test: (x) => /^[b-df-hj-np-tv-z]$/i.test(x) },
  { name: '짝수', test: (x) => /^\d+$/.test(x) && Number(x) % 2 === 0 },
  { name: '홀수', test: (x) => /^\d+$/.test(x) && Number(x) % 2 === 1 },
];

/** C가 지정하는 자리 */
export const SLOT_WORDS: { pattern: RegExp; name: string; positions: ('first' | 'last')[] }[] = [
  { pattern: /양\s*끝/, name: '양 끝', positions: ['first', 'last'] },
  { pattern: /(맨\s*앞|첫\s*번째|처음)/, name: '맨 앞', positions: ['first'] },
  { pattern: /(맨\s*뒤|마지막)/, name: '맨 뒤', positions: ['last'] },
];
