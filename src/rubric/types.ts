// 루브릭 모듈의 자료구조 — 정본: 봉인/HMOS_루브릭_구현명세-3.md §1·§2
import type { Color } from '../fq/types.ts';
import type { PathNode } from '../fq/v2/graph.ts';

export type 파트 = '근거대기' | '세우기' | '풀기' | '답구하기';
export type 요소 = Lowercase<Color> | 'k';
export type 수행질 = '정확성';

/** 급소 — v2 pivot에서 온다. 이 모듈은 다시 계산하지 않는다 (§1 주의) */
export interface 급소K {
  /** 질문이 요구하는 실체 = pivot.node.entity */
  실체: string;
  node: PathNode;
}

/** 5색 인식 결과 — v2 출력을 그대로 받는다 */
export interface 인식결과 {
  /** form.colors (문장 순서) */
  조합: Color[];
  /** graph.nodes — ①②에서 «호출된 객체»로 센다 (§3 F2) */
  nodes: PathNode[];
}

/** F1 산출 (f1.ts project_parts) */
export type 파트별물음 = Record<파트, string>;

/** 조각 (§2) */
export interface 조각 {
  id: string;
  파트: 파트;
  요소: 요소 | null;
  수행질: 수행질 | null;
  확인물음: string;
  충족조건: string;
  is_중심: boolean;
  /** 이 조각을 낸 인식 노드 (①②). 노드에서 오지 않는 조각(③④ 등)은 null */
  node: PathNode | null;
  배점: number;
  모범조각: string;
}

/** F2 출력 — 충족조건(F4)·배점(F5)·모범조각(F6)은 뒤 단계가 채운다 */
export type 조각뼈대 = Omit<조각, '충족조건' | '배점' | '모범조각'>;

export type 계열 = '수리' | '인문사회국어';

/**
 * 문항유형 — 1차 필터(문항분석 명세서-2 §2·§3)의 절차를 가르는 축. 계열(수리/인문사회국어)과 별개다.
 * [오종래 2026-09-30] 단독문제 → 서술형 절차(§2)
 *                     계단식 단계형 → 소문항마다 따로 서술형 절차(§2)
 *                     인문사회논술 → 논술형 절차(§3)
 */
export type 문항유형 = '단독문제' | '계단식 단계형' | '인문사회논술';

/** F5 출력 — 배점이 붙은 조각 */
export type 배점조각 = 조각뼈대 & { 배점: number };
