// HMOS f(Q) 엔진 타입 — ENGINE_LOGIC.md PHASE 2 / HMOS_CORE_SPEC.md §3~§5 / 논문4

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

/** STEP 2 출력: 색 태그가 붙은 요소 — 스위치 하나가 요소 하나를 부른다 */
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
}

export type RelationType = '제약' | '무대 선행' | '재규정';

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

/** STEP 5 출력 — 확정된 5색 구조 (B·C·P·D·Q 순) */
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

// ─────────────────────────────────────────────────────────────
// STEP 6 — 논문4 정의1(의존 구조 G)·정리2(사슬)·명제4(다경로)
// ─────────────────────────────────────────────────────────────

export type NodeColor = Exclude<Color, 'Q'>;

/** G의 요소 하나 */
export interface GNode {
  /** 인코딩 표기 (B, C₁, C₂ ...) */
  id: string;
  color: NodeColor;
  content: string;
  /**
   * 아웃바운드에서 생략하는가. 기본: 확정요소(D·P)는 생략, 연산요소(B·C)는 재경유.
   * "생략될 수 있다"(정리2)이므로 풀이법 G에서 덮어쓸 수 있다 (예: 논문4 §5.4 14번의 C₁ 생략)
   */
  skipOutbound?: boolean;
}

/**
 * 의존 구조 G (논문4 정의1)
 *   사슬: θ—x₁—…—xₙ. nodes는 θ에서 가까운 순이고 마지막이 최심(급소)
 *   분기(명제 3): nodes(공통 앞부분) 뒤에서 독립 가지들로 갈라지고 merge에서 합류한다. 병합점이 급소
 */
export interface DependencyGraph {
  nodes: GNode[];
  /** 서로 의존하지 않는 가지들 — 각 가지도 θ 쪽부터 */
  branches?: GNode[][];
  /** 가지가 합류하는 병합점 (branches가 있으면 필수) */
  merge?: GNode;
}

/** K = 1패스에서 가장 깊이 닿는 요소. G가 비면(1형식) Q 자신 */
export type PivotNode = GNode | { id: 'Q'; color: 'Q'; content: string };

export interface RegressionPath {
  kind: 'chain' | 'branch';
  /** K 앞까지의 인바운드 (θ° 쪽부터, 분기면 가지 순서대로 이어 붙임) */
  inbound: string[];
  /** K 뒤의 아웃바운드 (θ* 쪽으로) */
  outbound: string[];
  /** 인바운드에만 나타나고 아웃바운드에서 생략된 요소 */
  shortened: string[];
  /** θ°→B→D→[C]→B→θ* — 대괄호가 K. 분기: θ°→(B₁ | B₂)→[×]→(B₁ | B₂)→θ* */
  notation: string;
}

/** 풀이법 M 하나와 그 G_M */
export interface MethodInput {
  name: string;
  G: DependencyGraph;
}

export interface MethodResult {
  name: string;
  /** 엔진이 조사·어미 규칙으로 추정한 G인가 (풀이법 G를 받지 않았을 때) */
  estimated: boolean;
  G: DependencyGraph;
  K: PivotNode;
  path: RegressionPath;
}

export interface FQOptions {
  /** 풀이법별 G. 주면 기본(추정) G 대신 이 G들로 K·경로를 계산한다 */
  methods?: MethodInput[];
}

/** θ* 추정 — 풀이법과 무관하게 하나 (목적지 불변, 명제4) */
export interface ThetaEstimate {
  formats: AnswerFormat[];
  value?: number;
  cases?: { slots: string; count: number }[];
  derivation?: string;
}

export type FQErrorType = 'INVALID_QUESTION' | 'INVALID_GRAPH';

export interface FQError {
  ok: false;
  error: { type: FQErrorType; stage: string; message: string; recoverable: boolean };
}

/** f(Q) 출력: { B, C, P, D, Q, form, K, path } + 풀이법별 결과 + 추적 정보 */
export interface FQResult extends FiveColors {
  ok: true;
  question: string;
  switches: LogicSwitch[];
  context: ContextAnalysis;
  form: SevenForm;
  detail: CoreDetail;
  /** methods[0]의 K */
  K: PivotNode;
  /** methods[0]의 경로 */
  path: RegressionPath;
  methods: MethodResult[];
  theta: ThetaEstimate;
}
