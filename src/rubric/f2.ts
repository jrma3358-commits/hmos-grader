// F2 조각역산 — 호출부. 규칙 본체는 sealed/f2.ts([봉인②])에 있다.
import type { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PivotFailure } from '../fq/v2/pivot.ts';
import { project_parts } from './f1.ts';
import { 봉인2_조각역산 } from './sealed/f2.ts';
import type { 계열, 근거문장, 급소K, 인식결과, 조각뼈대, 파트별물음, 요소 } from './types.ts';

type V2Analysis = ReturnType<typeof recognizeV2Analysis>;

/** v2 출력 → F2 입력 (F1 파트별물음 포함). 급소가 서지 않았으면(NO_B·MULTIPLE_CONVERGENCE) 넘기지 않고 그대로 돌려준다 */
export function f2_input_from_v2(
  v2: V2Analysis,
): { ok: true; 물음: 파트별물음; k: 급소K; 인식: 인식결과 } | PivotFailure {
  if (!v2.pivot.ok) return v2.pivot;
  const 급소of = (p: { node: 급소K['node']; keyword?: string }): 급소K => ({ 실체: p.node.entity, node: p.node, keyword: p.keyword });
  const 조합 = v2.form.colors.map((c) => c.toLowerCase() as 요소);
  return {
    ok: true,
    물음: project_parts(v2.question, 조합),
    k: 급소of(v2.pivot.pivot),
    // 급소 복수(pivots)면 전부 — 서술·논술형 ④ 답구하기가 급소마다 조각 하나로 쓴다
    인식: { 조합: v2.form.colors, nodes: v2.graph.nodes, 급소들: (v2.pivot.pivots ?? [v2.pivot.pivot]).map(급소of) },
  };
}

/** 문장으로 나눈다 — 문장 끝 부호(. ? ! 。) 뒤 공백·줄바꿈에서. 빈 문장은 버린다 */
export function split_sentences(텍스트: string): string[] {
  return 텍스트
    .split(/(?<=[.?!。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 인문논술 ② 세우기의 재료 — 소문항 급소와 엔진이 연결한 제시문 단락(정합 연결)의 문장 전부 (오종래 2026-10-14).
 * 같은 라벨의 단락이 여럿이면(같은 기호를 잇는 단락) 모두. 한 라벨에 단락 급소가 여럿 연결돼도 문장은 한 번만 센다 — 실체는 첫 연결의 단락 급소.
 * @param 단락들 제시문 단락 (라벨 = align_passage가 연결에 쓰는 이름)
 * @param 연결 이 소문항의 연결 [{단락: 라벨, 단락급소}] — 엔진 정합 산출 그대로
 */
export function link_sentences(단락들: { 라벨: string; 텍스트: string }[], 연결: { 단락: string; 단락급소: string }[]): 근거문장[] {
  const 라벨들 = [...new Set(연결.map((l) => l.단락))];
  return 라벨들.flatMap((라벨) => {
    const 단락급소 = 연결.find((l) => l.단락 === 라벨)!.단락급소;
    return 단락들
      .filter((p) => p.라벨 === 라벨)
      .flatMap((p) => split_sentences(p.텍스트))
      .map((문장) => ({ 단락: 라벨, 단락급소, 문장 }));
  });
}

/**
 * F2 조각역산(파트별물음, 급소_k, 5색인식결과, 계열?) → 조각뼈대[]  (구현명세 §3 F2)
 * 계열이 인문사회국어면 ④ 답구하기는 서술·논술형 규칙(급소 K마다 · 경로 표지)이다. 계열을 주지 않으면 수리 규칙 그대로 (1차 필터 등)
 * @throws SealedError 봉인②가 비어 있을 때
 */
export function derive_pieces(물음: 파트별물음 | null, k: 급소K, 인식: 인식결과, 계열?: 계열): 조각뼈대[] {
  return 봉인2_조각역산(물음, k, 인식, 계열);
}
