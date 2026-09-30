// 조립 — F1~F6·문항평가를 한 흐름으로 불러 넷(루브릭·채점기준·부분채점기준·모범답안)과 문항평가를 한 번에 낸다 (구현명세 §4).
// 여기에는 규칙이 없다. 봉인이 빈 단계는 SealedError를 그대로 올린다 — 어디서 멈췄는지가 곧 다음에 채울 봉인이다.
import { is_approved, type 승인된문항 } from '../filter/confirm.ts';
import { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PivotFailure } from '../fq/v2/pivot.ts';
import { derive_pieces, f2_input_from_v2 } from './f2.ts';
import { judge_element } from './f3.ts';
import { specify_condition } from './f4.ts';
import { allocate_points } from './f5.ts';
import { spread_piece } from './f6.ts';
import { evaluate_item, type 삐걱신호 } from './item_eval.ts';
import type { 계열, 조각, 파트 } from './types.ts';

/** 파트 순서 (구현명세 §3 F6) — 모범답안을 이 순서로 엮는다. ⑤표현은 파트가 아니다 */
const 파트순서: 파트[] = ['근거대기', '세우기', '풀기', '답구하기'];

export interface 부분채점기준 {
  조각수: number;
  배점합: number;
  /** 조각마다의 배점 (반올림 나머지가 마지막 조각에 얹혀 조각끼리 다를 수 있다) */
  조각배점: number[];
}

export interface 루브릭생성결과 {
  ok: true;
  루브릭: 조각[];
  채점기준: { id: string; 충족조건: string; is_이분: true }[];
  부분채점기준: Record<파트, 부분채점기준>;
  모범답안: string;
  문항평가: { 신호: 삐걱신호; 경고: string[] };
}

/**
 * 루브릭생성(승인된문항, 계열, 총배점) → 넷 + 문항평가  (구현명세 §4)
 * 교사가 선생 확인 창에서 ①로 승인한 문항만 받는다 (문항분석 명세서-2 §6).
 * 급소가 서지 않았으면(NO_B·MULTIPLE_CONVERGENCE) 생성하지 않고 그대로 돌려준다 — 교사가 거르기를 ①로 뒤집었어도.
 * @throws Error 승인되지 않은 문항이거나, 아직 루브릭 경로가 없는 문항유형(계단식 단계형·인문사회논술)일 때
 * @throws SealedError 봉인이 빈 단계에서
 */
export function generate_rubric(문항: 승인된문항, 계열: 계열, 총배점: number): 루브릭생성결과 | PivotFailure {
  if (!is_approved(문항)) {
    throw new Error('루브릭창은 교사가 선생 확인 창에서 ①로 승인한 문항만 받습니다 (문항분석 명세서-2 §6).');
  }
  if (문항.입력.유형 !== '단독문제') {
    throw new Error(
      `«${문항.입력.유형}»의 루브릭 경로는 아직 없습니다 — 계단식은 소문항 배점 분배, 논술형은 루브릭 구성이 정해져야 합니다.`,
    );
  }
  const 입력 = f2_input_from_v2(recognizeV2Analysis(문항.입력.텍스트)); // F1 포함
  if (!입력.ok) return 입력;
  const { 물음, k, 인식 } = 입력;

  const 뼈대들 = derive_pieces(물음, k, 인식).map((c) => ({ ...c, 요소: judge_element(c, 계열) })); // F2·F3
  const 조건 = new Map(뼈대들.map((c) => [c.id, specify_condition(c, 계열)])); // F4
  const 모범 = new Map(뼈대들.map((c) => [c.id, spread_piece(c, k, 계열)])); // F6
  const 배점 = allocate_points(뼈대들, 총배점, 계열); // F5
  const 문항평가 = evaluate_item(뼈대들, 배점.미배정);

  const 루브릭: 조각[] = 배점.조각들.map((c) => ({ ...c, 충족조건: 조건.get(c.id)!, 모범조각: 모범.get(c.id)! }));
  const 파트순 = 파트순서.flatMap((p) => 루브릭.filter((c) => c.파트 === p));

  return {
    ok: true,
    루브릭,
    채점기준: 루브릭.map((c) => ({ id: c.id, 충족조건: c.충족조건, is_이분: true })),
    부분채점기준: Object.fromEntries(
      파트순서.map((p) => {
        const 안 = 루브릭.filter((c) => c.파트 === p);
        return [p, { 조각수: 안.length, 배점합: 배점.파트배점[p], 조각배점: 안.map((c) => c.배점) }];
      }),
    ) as Record<파트, 부분채점기준>,
    모범답안: 파트순.map((c) => c.모범조각).join('\n'),
    문항평가,
  };
}
