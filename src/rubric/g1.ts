// G1 채점 — 조각별 O/X를 모아 파트점수·부분점수·자취로 엮는 구조는 여기,
// 조각을 대보는 규칙([봉인⑥])과 게이트([봉인④-b])는 sealed/g1.ts에 있다 (구현명세 §3½ G1).
// 모범답안은 증인이지 심판이 아니다 — 판정에 쓰지 않고 결과 옆에 참고로 세운다.
import { 봉인4b_게이트, 봉인6_조각대조 } from './sealed/g1.ts';
import type { 요소, 조각, 파트 } from './types.ts';

const 파트순서: 파트[] = ['근거대기', '세우기', '풀기', '답구하기'];

/** 체크리스트 한 줄 (자취) */
export interface 조각결과 {
  조각id: string;
  파트: 파트;
  요소: 요소 | null;
  결과: 'O' | 'X' | '판정불가';
  배점: number;
  /** O면 배점, X·판정불가면 0 */
  득점: number;
  판단근거: string;
}

export interface 파트결과 {
  조각별: 조각결과[];
  배점합: number;
  /** 게이트 상한을 건 뒤의 점수 */
  파트점수: number;
  /** 게이트가 건 상한. 없으면 null */
  상한: number | null;
}

export interface 채점결과 {
  파트별: Record<파트, 파트결과>;
  부분점수: number;
  만점: number;
  /** 최초 X가 난 파트 (판정불가는 세지 않는다) */
  무너진지점: 파트 | null;
  /** X난 (파트 × 요소) — 판정불가는 넣지 않는다 */
  약점: { 파트: 파트; 요소: 요소 | null }[];
  /** 판정불가로 0점 처리된 조각 id — 하나라도 있으면 이 채점은 확정이 아니다 */
  판정불가: string[];
  /** 참고 견본 — 판정에 쓰지 않았다 */
  모범답안: string;
}

/**
 * G1 채점(학생답, 루브릭, 모범답안) → 채점결과
 * @throws SealedError 봉인⑥ 또는 봉인④-b가 비어 있을 때
 */
export function grade(학생답: string, 루브릭: 조각[], 모범답안: string): 채점결과 {
  const 조각별: 조각결과[] = 루브릭.map((c) => {
    const { 결과, 근거 } = 봉인6_조각대조(학생답, c);
    return {
      조각id: c.id,
      파트: c.파트,
      요소: c.요소,
      결과,
      배점: c.배점,
      득점: 결과 === 'O' ? c.배점 : 0,
      판단근거: 근거,
    };
  });

  const 합 = (rs: 조각결과[], f: (r: 조각결과) => number) => rs.reduce((a, r) => a + f(r), 0);
  const 파트배점 = Object.fromEntries(
    파트순서.map((p) => [p, 합(조각별.filter((r) => r.파트 === p), (r) => r.배점)]),
  ) as Record<파트, number>;
  const 상한 = 봉인4b_게이트(조각별, 파트배점);

  const 파트별 = Object.fromEntries(
    파트순서.map((p) => {
      const 안 = 조각별.filter((r) => r.파트 === p);
      const 원점수 = 합(안, (r) => r.득점);
      const cap = 상한[p] ?? null;
      const 결과: 파트결과 = {
        조각별: 안,
        배점합: 파트배점[p],
        파트점수: cap === null ? 원점수 : Math.min(원점수, cap),
        상한: cap,
      };
      return [p, 결과];
    }),
  ) as Record<파트, 파트결과>;

  const X = 조각별.filter((r) => r.결과 === 'X');
  return {
    파트별,
    부분점수: 파트순서.reduce((a, p) => a + 파트별[p].파트점수, 0),
    만점: 합(조각별, (r) => r.배점),
    무너진지점: 파트순서.find((p) => X.some((r) => r.파트 === p)) ?? null,
    약점: X.map((r) => ({ 파트: r.파트, 요소: r.요소 })),
    판정불가: 조각별.filter((r) => r.결과 === '판정불가').map((r) => r.조각id),
    모범답안,
  };
}
