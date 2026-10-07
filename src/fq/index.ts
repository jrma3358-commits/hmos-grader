// HMOS f(Q) — ENGINE_LOGIC.md PHASE 2 인식 파이프라인
// 질문 Q → 논리스위치 → 색매칭 → 문맥파악 → 7형식 → 핵심 5색 → G → K
// 출력 경계: 경로·형식·K 인식까지. θ* 최종값은 계산하지 않는다

import {
  analyzeContext,
  classify7Form,
  detectLogicSwitches,
  extractCoreColors,
  isValidQuestion,
  matchColors,
  normalize,
} from './pipeline.ts';
import { regress, validateGraph } from './pivot.ts';
import type { FQError, FQOptions, FQResult } from './types.ts';

export function fQ(question: string, options: FQOptions = {}): FQResult | FQError {
  for (const m of options.methods ?? []) {
    const problem = validateGraph(m.G);
    if (problem) {
      return {
        ok: false,
        error: { type: 'INVALID_GRAPH', stage: 'PHASE 2 / STEP 6 풀이법 G', message: `${m.name}: ${problem}`, recoverable: true },
      };
    }
  }

  const q = normalize(question);
  const scanned = detectLogicSwitches(q); // STEP 1: 논리스위치 파악

  if (!isValidQuestion(scanned)) {
    return {
      ok: false,
      error: {
        type: 'INVALID_QUESTION',
        stage: 'PHASE 2 / 질문 무결 게이트',
        message: 'Q(질문·목적지) 스위치가 없습니다 — ~을 구하시오, ~을 서술하시오 등',
        recoverable: false,
      },
    };
  }

  const colorsTmp = matchColors(scanned); // STEP 2: 색매칭 (1차)
  const context = analyzeContext(colorsTmp); // STEP 3: 문맥파악
  const { form, elements, notes } = classify7Form(context); // STEP 4: 7형식 결정
  const core = extractCoreColors(elements, context); // STEP 5: 핵심 5색 추출
  const methods = regress(core, options.methods); // STEP 6: 풀이법별 G → K·경로

  return {
    ok: true,
    question: q,
    switches: scanned.flatMap((s) => s.switches),
    context: { ...context, elements, notes: [...context.notes, ...notes] },
    ...core.colors,
    form,
    detail: core.detail,
    K: methods[0].K,
    path: methods[0].path,
    methods,
  };
}

export type * from './types.ts';

// v2 — 봉인 표지표 기반 인식 (구조 골격). 봉인 파일이 없으면 SealedError로 멈춘다
export { recognizeV2, recognizeV2Analysis, recognizeV2Path, type V2Recognition } from './pipeline.ts';
export { build_path_graph, describeCombination, type FormCombination, type PathGraph } from './v2/graph.ts';
export { split_units } from './v2/units.ts';
export {
  connectPassage,
  recognizePassage,
  type PassageConnection,
  type PassageLink,
  type PassageParagraph,
  type ParagraphPivot,
  type PassageRecognition,
} from './v2/passage.ts';
export {
  generateQuestions,
  type CandidatePattern,
  type ExcludedEntry,
  type Generation,
  type PoolEntry,
  type QuestionCandidate,
  type QuestionVerdict,
  type Verdict,
} from './v2/generate.ts';
export {
  analyze_pivot,
  convergenceOf,
  deepest_node,
  find_pivot,
  PivotError,
  type Pivot,
  type PivotAnalysis,
  type PivotFlag,
} from './v2/pivot.ts';
export { confirmType, detectType, type QuestionType, type TypeConfirmation, type TypeDetection } from './detectType.ts';
export { isSealedAvailable, markerTable, SealedError, sealedPath, undecided } from './lexicon.ts';
export type { SealedTable } from './sealed/schema.ts';
