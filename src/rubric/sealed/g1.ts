// [봉인⑥] 학생 답을 조각 하나에 대보는 규칙 · [봉인④-b] 게이트(선행 X → 후행 상한) — 오종래가 채운다.
// 판정 기준은 «급소 도달»이지 «모범답안 일치»가 아니다 (구현명세 F5-note). 모범조각은 참고로만 볼 수 있다.
// ④-b는 구현명세 §3½의 «게이트(봉인④/규칙)» 자리다 — 어느 파트가 X면 어느 파트에 얼마의 상한을 거는지.
// [오종래 2026-09-30] 봉인⑥ 조각 O/X는 파트별 따로:
//   ① 근거대기 · ② 세우기 · ③ 풀기 = 답 인식 노드 중 entity가 조각 실체와 같은 것이 있으면 O
//   ③ 풀기는 짝 세우기(같은 노드)가 X면 자동 X — 게이트를 봉인⑥ 안에서 처리
//   ④ 답구하기 = GJ(봉인⑤⑥)로 답 급소 ↔ 질문 급소
import type { PathNode } from '../../fq/v2/graph.ts';
import type { 조각결과 } from '../g1.ts';
import { judge_pivot_match } from '../gj.ts';
import type { 계열, 급소K, 조각, 파트 } from '../types.ts';

export interface 조각대조 {
  결과: 'O' | 'X' | '판정불가';
  /** 자취에 남는 판단 근거 */
  근거: string;
}

/** 조각대조에 쓰는 것 — g1.ts가 채워 넘긴다 */
export interface 대조맥락 {
  /** 학생 답을 입구 로직에 태운 인식 노드 */
  답노드: PathNode[];
  질문급소: 급소K;
  계열: 계열;
  루브릭: 조각[];
  /** 앞서 판정된 조각 (세우기가 풀기보다 먼저 온다) */
  앞결과: ReadonlyMap<string, 조각대조>;
}

/** ①②③ — 답 노드 중 entity가 조각 실체와 같은 것이 있는가 */
function 실체대조(조각: 조각, 답노드: PathNode[]): 조각대조 {
  if (조각.node === null) return { 결과: '판정불가', 근거: '조각에 인식 노드가 없습니다.' };
  const 실체 = 조각.node.entity.trim();
  const hit = 답노드.some((n) => n.entity.trim() === 실체);
  return { 결과: hit ? 'O' : 'X', 근거: `답 인식 노드에 "${실체}" ${hit ? '있음' : '없음'}` };
}

export function 봉인6_조각대조(학생답: string, 조각: 조각, 맥락: 대조맥락): 조각대조 {
  switch (조각.파트) {
    case '근거대기':
    case '세우기':
      return 실체대조(조각, 맥락.답노드);
    case '풀기': {
      const 짝 = 맥락.루브릭.find((c) => c.파트 === '세우기' && c.node !== null && c.node.id === 조각.node?.id);
      const 짝결과 = 짝 && 맥락.앞결과.get(짝.id);
      if (짝결과?.결과 === 'X') return { 결과: 'X', 근거: `짝 세우기 ${짝!.id}가 X → 풀기 X` };
      return 실체대조(조각, 맥락.답노드);
    }
    case '답구하기': {
      const gj = judge_pivot_match(학생답, 맥락.질문급소, 맥락.계열);
      if (gj.결과 === '판정불가') return { 결과: '판정불가', 근거: `답에서 급소가 서지 않음 (${gj.실패.flag})` };
      return {
        결과: gj.결과,
        근거: `답 급소 "${gj.답급소.node.entity}" ↔ 질문 급소 "${맥락.질문급소.node.entity}" (${gj.경계}) → ${gj.결과}`,
      };
    }
  }
}

// [오종래 2026-09-30] 봉인④-b 게이트:
//   답구하기 X → 풀기 상한 · 풀기 X → 세우기 상한 · 세우기 X → 근거대기 상한 (한 칸씩, 번지지 않는다)
//   파트 X = 그 파트 조각 중 X가 하나라도 있음. 판정불가는 상한을 걸지 않는다.
//   상한 = 상한을 받는 파트 배점합의 1/3 (소수 첫째 자리 반올림, ④-a와 같은 자릿수)
const 게이트: readonly [X파트: 파트, 상한파트: 파트][] = [
  ['답구하기', '풀기'],
  ['풀기', '세우기'],
  ['세우기', '근거대기'],
];

const 상한비 = 1 / 3;

/** 파트 → 파트점수 상한. 적지 않은 파트는 상한 없음 */
export function 봉인4b_게이트(
  조각별: 조각결과[],
  파트배점: Record<파트, number>,
): Partial<Record<파트, number>> {
  const 상한: Partial<Record<파트, number>> = {};
  for (const [X파트, 상한파트] of 게이트) {
    if (조각별.some((r) => r.파트 === X파트 && r.결과 === 'X')) {
      상한[상한파트] = Math.round(파트배점[상한파트] * 상한비 * 10) / 10;
    }
  }
  return 상한;
}
