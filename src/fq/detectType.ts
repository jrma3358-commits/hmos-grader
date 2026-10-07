// 문항 유형 감지 — 두 단계.
//   1단계 detectType(text)                     — 겉모습(선택지·제시문 기호·수식·조건·요구어)만 본다
//   2단계 confirmType(text, analysis, passage) — v2 인식 결과(5색 노드 · 제시문 단락 라벨)로 확정한다. 다르면 2단계가 이긴다
//
// [오종래 2026-10-08] 1단계 감지 우선순위
//   1. 소문항 번호 → 단계형 (다른 유형과 함께 온다 — 상위 유형 + subType 단계형)
//   2. 선택지 → 객관식
//   3. 수식 + [가][나] 제시문 → 수리논술
//   4. [가][나][다] 제시문 → 논술형
//   5. 수식 + 조건 + 서술 표지 → 수학서술형 / 수식 + 조건 + 주관 표지(서술 표지 없음) → 수학주관식
//   6. 서술 표지(DECLARATIVE)가 어디든 있음 → 서술형
//   7. 서술 표지 없이 주관 표지(DEMAND)만 있음 → 주관식
//   8. 나머지 → 단답형
//   [오종래 2026-10-08] 서술형은 표지만 본다 — 요구어 앞 서술문(기호 없는 제시문) 조건은 없앴다
//
// [오종래 2026-10-08] 2단계 확정 기준 (위에서부터)
//   1. 객관식은 덮어쓰지 않는다 — 객관식 유지
//   2. B에 수식 + 제시문 라벨 2개 이상 → 수리논술
//   3. B에 수식 + C에 부등식 조건 → 서술 표지면 수학서술형, 주관 표지만이면 수학주관식
//   4. 제시문 라벨 2개 이상 → 논술형
//   5. 단계형은 subType으로만 (1단계 것을 그대로 잇는다)
//   어느 것에도 안 걸리면 1단계 유형 그대로
//
// 이 파일이 하지 않는 것:
//   - 급소를 정하는 일 (유형은 겉모습이다 — 급소는 v2 엔진이 정한다)
//   - 봉인 표지사전을 읽는 일 (1단계는 봉인 없이 돈다. 2단계는 이미 나온 인식 결과만 받는다)

import type { V2Analysis } from './pipeline.ts';
import type { Color } from './types.ts';
import type { PassageRecognition } from './v2/passage.ts';

export type QuestionType =
  | '객관식'
  | '단답형'
  | '주관식'
  | '수학주관식'
  | '수학서술형'
  | '서술형'
  | '단계형'
  | '논술형'
  | '수리논술';

export interface TypeDetection {
  type: QuestionType;
  /** 소문항 번호 구조 — 상위 유형과 함께 온다 */
  subType?: '단계형';
  /** 0~1 */
  confidence: number;
  /** 감지 근거 */
  flags: string[];
}

export interface TypeConfirmation extends TypeDetection {
  /** 1단계 결과 그대로 */
  surface: TypeDetection;
  /** 2단계가 1단계 유형을 바꿨는가 */
  overridden: boolean;
}

/** 제시문 기호 — [가] · <가> · (가). 단락 머리가 아니어도 센다 (「제시문 [가], [나]를 참고하여」) */
const PASSAGE_LABEL = /[[<(]([가-하])[\]>)]/g;
/** 소문항 번호 — 줄 머리의 (1) · (1-1) · 1) */
const SUB_NUMBER = /(?:^|\n)\s*\((\d+(?:-\d+)?)\)|(?:^|\n)\s*(\d+)\)/g;
/** 원문자 번호 */
const CIRCLED = /[①-⑳]/g;
/** 보기 ㄱ. ㄴ. ㄷ. */
const BOGI = /(?:^|\s)([ㄱ-ㅎ])\s*[.)]/g;
/** 수식 — 함수 기호 · 적분·근호·시그마·π · f(x) 꼴 · 등식 */
const MATH = [
  { re: /\b(?:sin|cos|tan|log|ln|lim)\b/, flag: '수식:삼각·로그·극한' },
  { re: /[∫√∑π]/, flag: '수식:∫√∑π' },
  { re: /\b[a-zA-Z]\s*\(\s*[a-zA-Z]\s*\)/, flag: '수식:f(x)' },
  { re: /[a-zA-Z0-9)]\s*=\s*[-a-zA-Z0-9(]/, flag: '수식:등식' },
];
/** 조건 — 부등호 (제시문 기호 <가>는 미리 지운다) */
const CONDITION = /[<>≤≥≦≧]/;
/** 서술형 표지 [오종래 2026-10-08] — 문항 어디든 하나라도 있으면 서술형 */
const DECLARATIVE = [
  '서술하시오', '서술하여라', '서술하라',
  '쓰시오', '써라', '쓰라',
  '설명하시오', '설명하여라', '설명하라',
  '논하시오', '논하여라', '논하라',
  '이유를', '근거를', '과정을',
];
/** 주관식 표지 [오종래 2026-10-08] — 서술형 표지 없이 이것만 있으면 주관식 */
const DEMAND = ['구하시오', '구하여라', '구하라', '구하면', '값은', '얼마인가'];

const distinct = (xs: string[]) => [...new Set(xs)];

/** 문항 텍스트에 든 서술·주관 표지 */
function answerMarkers(text: string): { declarative: string[]; demand: string[] } {
  return { declarative: DECLARATIVE.filter((m) => text.includes(m)), demand: DEMAND.filter((m) => text.includes(m)) };
}

export function detectType(text: string): TypeDetection {
  const flags: string[] = [];

  // 1. 소문항 번호
  const subNumbers = distinct([...text.matchAll(SUB_NUMBER)].map((m) => m[1] ?? m[2]));
  const circled = distinct(text.match(CIRCLED) ?? []);
  const bogi = distinct([...text.matchAll(BOGI)].map((m) => m[1]));
  // 원문자는 넷 이상이면 선택지, 둘·셋이면 소문항 번호로 본다
  const circledSteps = circled.length >= 2 && circled.length <= 3;
  const stepped = subNumbers.length >= 2 || circledSteps;
  if (subNumbers.length >= 2) flags.push(`소문항:(${subNumbers.join(')(')})`);
  if (circledSteps) flags.push(`소문항:${circled.join('')}`);

  const labels = distinct([...text.matchAll(PASSAGE_LABEL)].map((m) => m[1]));
  if (labels.length) flags.push(`제시문:${labels.map((l) => `[${l}]`).join('')}`);
  const bare = text.replace(PASSAGE_LABEL, '');
  const math = MATH.filter((m) => m.re.test(bare)).map((m) => m.flag);
  flags.push(...math);
  const condition = CONDITION.test(bare);
  if (condition) flags.push('조건:부등호');
  const { declarative, demand } = answerMarkers(text);
  flags.push(...declarative.map((m) => `서술표지:${m}`), ...demand.map((m) => `주관표지:${m}`));

  const done = (type: QuestionType, confidence: number): TypeDetection => ({
    type,
    ...(stepped ? { subType: '단계형' as const } : {}),
    confidence,
    flags,
  });

  // 2. 선택지
  if (circled.length >= 4 || bogi.length >= 2) {
    if (circled.length >= 4) flags.push(`선택지:${circled.join('')}`);
    if (bogi.length >= 2) flags.push(`보기:${bogi.join('')}`);
    return done('객관식', circled.length >= 5 ? 0.95 : 0.85);
  }
  // 3. 수식 + 제시문 기호 둘 이상
  if (math.length && labels.length >= 2) return done('수리논술', 0.9);
  // 4. 제시문 기호 둘 이상
  if (labels.length >= 2) return done('논술형', declarative.length ? 0.9 : 0.7);
  // 5. 수식 + 조건 — 표지로 서술·주관을 가른다. 표지가 없으면 아래로 내려간다
  if (math.length && condition && declarative.length) return done('수학서술형', 0.9);
  if (math.length && condition && demand.length) return done('수학주관식', 0.9);
  // 6. 서술 표지
  if (declarative.length) return done('서술형', 0.8);
  // 7. 주관 표지만
  if (demand.length) return done('주관식', 0.8);
  // 8. 나머지
  return done('단답형', 0.4);
}

/** 제시문 단락 라벨 — 가~하 글자만 (「단락N:」의 N은 뺀다) */
const LABEL_LETTER = /^[가-하]$/;

/** 노드 실체 중 색이 color인 것 — 논제와 제시문 양쪽 */
function entitiesOf(color: Color, analysis: V2Analysis, passage?: PassageRecognition): string[] {
  const nodes = [...analysis.graph.nodes, ...(passage?.graph.nodes ?? [])];
  return nodes.filter((n) => n.color === color).map((n) => n.entity);
}

/**
 * 2단계 — v2 인식 결과로 유형을 확정한다. 1단계와 다르면 2단계가 이긴다 (객관식은 예외 — 유지).
 * B 수식은 논제(analysis)의 B 노드만 본다. C 부등식은 논제와 제시문 양쪽의 C 노드를 본다.
 */
export function confirmType(text: string, analysis: V2Analysis, passage?: PassageRecognition): TypeConfirmation {
  const surface = detectType(text);
  const flags = [...surface.flags];
  const keep = (): TypeConfirmation => ({ ...surface, flags, surface, overridden: false });
  const confirm = (type: QuestionType): TypeConfirmation => ({
    type,
    ...(surface.subType ? { subType: surface.subType } : {}),
    confidence: 0.95,
    flags,
    surface,
    overridden: type !== surface.type,
  });

  // 1. 객관식 유지
  if (surface.type === '객관식') {
    flags.push('확정:객관식 유지');
    return keep();
  }

  const mathB = analysis.graph.nodes.filter((n) => n.color === 'B' && MATH.some((m) => m.re.test(n.entity))).map((n) => n.entity);
  const conditionC = entitiesOf('C', analysis, passage).filter((e) => CONDITION.test(e));
  const labels = distinct((passage?.paragraphs ?? []).map((p) => p.label ?? '').filter((l) => LABEL_LETTER.test(l)));
  flags.push(...mathB.map((e) => `확정:B수식「${e}」`));
  flags.push(...conditionC.map((e) => `확정:C부등식「${e}」`));
  if (labels.length) flags.push(`확정:단락라벨${labels.map((l) => `[${l}]`).join('')}`);

  // 2. B 수식 + 라벨 2개 이상
  if (mathB.length && labels.length >= 2) return confirm('수리논술');
  // 3. B 수식 + C 부등식 — 표지로 서술·주관을 가른다. 표지가 없으면 아래로 내려간다
  const { declarative, demand } = answerMarkers(text);
  if (mathB.length && conditionC.length && declarative.length) return confirm('수학서술형');
  if (mathB.length && conditionC.length && demand.length) return confirm('수학주관식');
  // 4. 라벨 2개 이상
  if (labels.length >= 2) return confirm('논술형');
  return keep();
}
