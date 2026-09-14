// HMOS f(Q) — ENGINE_LOGIC.md PHASE 2 인식 파이프라인
// 질문 Q → 논리스위치 → 색매칭 → 문맥파악 → 7형식 → 핵심 5색 → K

import {
  analyzeContext,
  classify7Form,
  detectLogicSwitches,
  extractCoreColors,
  isValidQuestion,
  matchColors,
  normalize,
} from './pipeline.ts';
import { extractPivot } from './pivot.ts';
import type { FQError, FQResult } from './types.ts';

export function fQ(question: string): FQResult | FQError {
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
  const { K, path, theta } = extractPivot(core); // STEP 6: K 추출

  return {
    ok: true,
    question: q,
    switches: scanned.flatMap((s) => s.switches),
    context: { ...context, elements, notes: [...context.notes, ...notes] },
    ...core.colors,
    form,
    detail: core.detail,
    K,
    path,
    theta,
  };
}

export type * from './types.ts';
