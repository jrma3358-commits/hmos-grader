// HMOS f(Q) 엔진 타입 — ENGINE_LOGIC.md PHASE 2 / HMOS_CORE_SPEC.md §3~§5

export type Color = 'B' | 'C' | 'P' | 'D' | 'Q';
export type SwitchKind = '조사·어미' | '연결어' | '부사';

/** STEP 1 출력: 논리스위치 하나 */
export interface LogicSwitch {
  surface: string;
  kind: SwitchKind;
  /** 문장 내 위치 (정규화된 질문 기준) */
  index: number;
  /** 이 스위치가 가리킬 수 있는 색. 2개 이상이면 애매 → STEP 3·4에서 확정 */
  candidates: Color[];
  /** lexicon 규칙 id (추적용) */
  rule: string;
  position: 'start' | 'end' | 'inner';
}

/** 절(clause) — 논리스위치가 분기하는 단위 */
export interface Clause {
  text: string;
  index: number;
}

export interface ScannedClause {
  clause: Clause;
  switches: LogicSwitch[];
}

/** STEP 2 출력: 색 태그가 붙은 요소 */
export interface ColorElement {
  candidates: Color[];
  /** STEP 3·4 이후 확정된 색 */
  color?: Color;
  /** 마커를 걷어낸 내용 */
  content: string;
  clause: Clause;
  switches: LogicSwitch[];
  /** Q 요소 전용: 요구 동사 (구하시오/서술하시오 ...) */
  qVerb?: string;
  /** B/C 애매 절에서 조작 동사(나열·배열 ...)의 목적어 */
  object?: string;
  /** object 뒤의 서술부 — 조작 동사 판별용 */
  predicate?: string;
}

export type RelationType = '제약' | '무대 선행' | '재규정' | '조작 소환';

export interface Relation {
  from: Color;
  to: Color;
  type: RelationType;
  evidence: string;
}

/** STEP 3 출력 */
export interface ContextAnalysis {
  elements: ColorElement[];
  relations: Relation[];
  notes: string[];
}

export type FormId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** STEP 4 출력 — 7형식 정본 (논문2 §4) */
export interface SevenForm {
  id: FormId;
  pattern: string;
  name: string;
  logicSwitch: 'OFF' | 'ON';
  label: string;
}

export type AnswerFormat = '수치' | '식' | '범위' | '서술';

/** STEP 5 출력 — 확정된 5색 구조 */
export interface FiveColors {
  B?: string;
  C?: string;
  P?: string;
  D?: string;
  Q: string;
  qVerbs: string[];
}

export interface CoreDetail {
  /** B에서 읽은 원소 목록 (a,a,b,c,d,e 등) */
  items?: string[];
  /** 중복 원소와 개수 */
  duplicates: { item: string; count: number }[];
  /** C가 B에 부과한 범주 (모음/자음/짝수/홀수) */
  category?: { name: string; members: string[] };
  /** C가 지정한 자리 (양 끝 → [0, n-1]) */
  slots?: { name: string; positions: ('first' | 'last')[] };
  answerFormats: AnswerFormat[];
  layers: { surface: Color[]; deep: Color[] };
}

export interface CoreColors {
  colors: FiveColors;
  detail: CoreDetail;
  elements: ColorElement[];
}

/** STEP 6 출력 */
export interface Pivot {
  text: string;
  color: Exclude<Color, 'Q'> | 'Q';
  /** 어느 규칙으로 K를 잡았는가 (추적용) */
  rule: string;
}

export interface RegressionPath {
  inbound: Color[];
  outbound: Color[];
  /** 아웃바운드에서 단축된 확정요소 (D·P) */
  shortened: Color[];
  notation: string;
}

export interface ThetaEstimate {
  formats: AnswerFormat[];
  value?: number;
  cases?: { slots: string; count: number }[];
  derivation?: string;
}

export type FQErrorType = 'INVALID_QUESTION';

export interface FQError {
  ok: false;
  error: { type: FQErrorType; stage: string; message: string; recoverable: boolean };
}

/** f(Q) 출력: { B, C, P, D, Q, form, K, path } + 추적 정보 */
export interface FQResult extends FiveColors {
  ok: true;
  question: string;
  switches: LogicSwitch[];
  context: ContextAnalysis;
  form: SevenForm;
  detail: CoreDetail;
  K: Pivot;
  path: RegressionPath;
  theta: ThetaEstimate;
}
