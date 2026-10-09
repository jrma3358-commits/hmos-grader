// 봉인 데이터 파일의 스키마 — 값은 여기에 없다.
//
// 이 파일이 정하는 것: "어떤 칸이 필요한가"(구조)
// 이 파일이 정하지 않는 것: 어떤 표지가 어떤 색을 켜는가(값) — 그것은 봉인 파일에만 있다.
//
// 원전: `봉인/기술백서초안.hwp` §4-1(논리스위치 사전)·§4-2(5색 사고 유도등)·§4-3(문제 구조)·
//       §4-5(디지털 사유 매트릭스, 수학 기호 매핑)
// 불변: BUILD_PLAN §4 원칙 4 — 봉인 값은 로컬에만 둔다. 소스에 평문으로 박지 않는다.

import type { Color, SwitchKind } from '../types.ts';

/** 아직 오종래 판정이 없는 칸. 코드가 대신 정하지 않는다 — null로 둔다. */
export type Undecided<T> = T | null;

/** 백서 §4-1 논리스위치 사전의 한 행 */
export interface SealedSwitch {
  /** 스위치 식별자 (백서 §4-1의 번호 표기 그대로) */
  id: string;
  /**
   * 표지의 종류. 경로 그래프에서 자리가 갈린다 —
   * '조사·어미'는 **노드**(실체를 끌고 나와 색을 켜는 자리),
   * '연결어'·'부사'는 **간선**(노드와 노드 사이의 관계).
   * 미결이면 null — 코드가 대신 정하지 않고 미결로 보고한다.
   */
  kind: Undecided<SwitchKind>;
  /** 이 스위치가 붙잡는 조사·어미 표층형 묶음. 한 음절이 아니라 '묶음'으로 적는다 */
  markers: string[];
  /** 백서 §4-1 '사유의 의지' 칸 */
  intent: string;
  /** 이 스위치가 켜는 유도등. 미결이면 null */
  color: Undecided<Color>;
  /** 백서 §4-1 '디지털 행동 지침(Action)' 칸. 연산층 몫 — 인식 엔진은 읽기만 한다 */
  action?: string;
}

/** 백서 §4-2 5색 사고 유도등의 한 등 */
export interface SealedLight {
  color: Color;
  /** 그 등을 켜는 조사·어미 표층형 */
  markers: string[];
  /** 백서 §4-2가 적은 그 등의 역할 */
  role: string;
}

/** 백서 §4-5 디지털 사유 매트릭스의 한 코드 */
export interface SealedMatrixCode {
  code: string;
  name: string;
  /** 이 코드를 켜는 조사·어미 표층형 */
  triggers: string[];
  /** 트리거가 걸리는 유도등. 미결이면 null */
  color: Undecided<Color>;
  /** 연산 로직 서술 */
  logic: string;
  /** 연산 우선순위 계층 (백서 §4-5 계층도). 미결이면 null */
  layer: Undecided<number>;
}

/** 백서 §4-5 [사고흐름 → 색 → 매트릭스 code → 수학 기호 → 언어 조사] 한 행 */
export interface SealedSymbolRow {
  flow: string;
  color: Undecided<Color>;
  codes: string[];
  symbol: string;
  markers: string[];
}

/**
 * 백서 §4-3 문제 구조.
 * 닫힌 목록이 아니다 — 백서는 "이 문제 구조와 **그 조합**"이라 적는다(BUILD_PLAN §6-3).
 * 그래서 id는 숫자가 아니라 문자열이고, 색 조합의 개수를 제한하지 않는다.
 */
export interface SealedForm {
  id: string;
  /** 이 형식을 이루는 색의 배열 (순서 의미 있음) */
  colors: Color[];
  name: string;
}

/**
 * 표지를 문장에 적용하는 방식. 이것도 값이다 — 코드가 정하지 않는다.
 * (백서는 같은 음절을 길이만 달리해 다른 등에 건다: "~가" / "~가 되도록" / "~가 있다")
 */
export interface SealedApplyRules {
  /** 긴 표지를 먼저 맞출 것인가. 미결이면 null */
  longestMatchFirst: Undecided<boolean>;
  /** 길이로 갈리지 않는 충돌의 우선순위 (스위치·코드 id 순서). 비어 있으면 미결 */
  precedence: string[];
  /**
   * 급소 수렴을 셀 때 간선 종류별 무게. null이면 균등(관계 간선 1, 인접 0).
   *
   * 급소 **규칙**은 구조라 코드에 있다(`v2/pivot.ts`, 구현명세 §2-4).
   * 여기 있는 것은 그 규칙이 쓰는 **값**뿐이다 — 구현명세 §5가 봉인으로 묶은 "가중치".
   * 키는 간선 종류('연결어'·'부사'·'adjacent').
   */
  convergenceWeights?: Undecided<Record<string, number>>;
}

/** 오종래 판정 대기 표지. color는 판정 전까지 null이어야 한다 */
export interface SealedPending {
  marker: string;
  color: Undecided<Color>;
  /** 어느 표끼리 갈리는지 (예: "§4-1 ↔ §4-2 ↔ §4-3") */
  note: string;
}

/** 봉인 파일 전체 */
export interface SealedTable {
  /** 스키마 판 번호 — 구조가 바뀌면 올린다 */
  version: number;
  /** 이 값들이 어느 원전의 어느 절에서 왔는지 */
  source: { document: string; sections: string[] };
  /** 백서 §4-1 */
  switches: SealedSwitch[];
  /** 백서 §4-2 */
  lights: SealedLight[];
  /** 백서 §4-5 (코드) */
  matrix: SealedMatrixCode[];
  /** 백서 §4-5 (기호 매핑) */
  symbols: SealedSymbolRow[];
  /** 백서 §4-3 */
  forms: SealedForm[];
  apply: SealedApplyRules;
  pending: SealedPending[];
}

/**
 * 급소(K) 규칙은 이 파일에 없다 — **구조라서 코드에 있다.**
 *
 * 정본: `HMOS_인식엔진_v2_구현명세.md` §2-4 (2026-09-18 오종래 판정).
 *   급소 = 간선이 가장 많이 수렴하는 B 노드(회오리 중심). 최심점 ≠ 급소.
 * 구현: `src/fq/v2/pivot.ts`
 *
 * 봉인 파일이 급소에 대해 갖는 것은 `apply.convergenceWeights`(값)뿐이다.
 * (백서에는 급소 서술이 없다 — 그래서 한때 비워 두었고, 정본이 서면서 채웠다. BUILD_PLAN §6-11)
 */
export type 급소규칙_정본은_구현명세_2_4 = never;
