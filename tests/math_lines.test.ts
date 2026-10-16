// q5 수리 서술형 규칙 (오종래 2026-10-16)
//   (a) 「~고」 Q 뒤 물음의 「풀이 과정」은 작성 지시 — 「~고」 앞 B가 급소, ④ 대상·① 조각에서 빠진다 (「풀이 과정」류만)
//   (b) 수리 모범답안 줄: 「~하면」 ① · 등식 ② · 「∴」 ④ 모범 값 · 풀기 없음 (세우기=풀기). 줄 조각은 교사 판정
//   (c) ④ 모범 값과 학생 답 값을 직접 대조 — 불일치면 X

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2 } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { 봉인4b_게이트 } from '../src/rubric/sealed/g1.ts';
import { answer_values, classify_math_lines, solve_segments, student_answer_line } from '../src/rubric/solve_lines.ts';
import type { 조각 } from '../src/rubric/types.ts';

const q5 = '이차방정식 x²+2x-3=0의 두 근을 구하고, 풀이 과정을 서술하시오. [5점]';
const 모범 = '(x+3)(x-1)=0\n∴ x=1 또는 x=-3';
const 학생 = '근의 공식을 이용하면 x = (-b ± √(b²-ac)) / a 이므로\nx = (-1 ± √(1+3)) / 2 , x = (-1 ± 2) / 2\n∴ x = 1/2 또는 x = -3/2';

describe('(a) 「~고」 앞 B 급소 — 「풀이 과정」류', () => {
  it('q5 급소 = 「두 근」 B, 급소 하나', () => {
    const a = recognizeV2Analysis(q5);
    assert.ok(a.pivot.ok);
    assert.match(a.pivot.pivot.node.entity, /두 근$/);
    assert.equal(a.pivot.pivots, undefined);
  });
  it('「A를 구하고, B를 구하시오」 두 답 물음은 그대로 급소 둘', () => {
    const a = recognizeV2Analysis('a_n을 구하고, a_5의 값을 구하시오.');
    assert.ok(a.pivot.ok);
    assert.equal(a.pivot.pivots?.length, 2);
  });
});

describe('(b) 수리 모범답안 줄 나누기', () => {
  it('등식 줄 → 세우기 · ∴ 줄 → 답 · 「~하면」 줄 → 근거대기', () => {
    const r = classify_math_lines('근의 공식을 이용하면\n(x+3)(x-1)=0\n∴ x=1 또는 x=-3');
    assert.deepEqual(r.근거대기, ['근의 공식을 이용하면']);
    assert.deepEqual(r.세우기, ['(x+3)(x-1)=0']);
    assert.deepEqual(r.답?.값, ['x=-3', 'x=1']);
  });
  it('q5 조각 — ② 등식 줄 하나 · ④ 「두 근」 하나(모범 값) · ③ 없음 · 「풀이 과정」 조각 없음', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(q5));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범) }, '수리');
    assert.deepEqual(cs.map((c) => c.id), ['세우기-1', '답구하기-1']);
    assert.equal(cs[0].줄글, '(x+3)(x-1)=0');
    assert.match(cs[1].node!.entity, /두 근$/);
    assert.deepEqual(cs[1].모범답?.값, ['x=-3', 'x=1']);
  });
});

describe('(c) ④ 값 직접 대조', () => {
  const 조각of = (c: Partial<조각> & Pick<조각, 'id' | '파트' | '배점'>): 조각 => ({
    요소: null, 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', ...c,
  });
  const 루브릭 = [
    조각of({ id: '세우기-1', 파트: '세우기', 요소: 'c', 배점: 3, 줄글: '(x+3)(x-1)=0' }),
    조각of({ id: '답구하기-1', 파트: '답구하기', 배점: 2, 모범답: { 줄: '∴ x=1 또는 x=-3', 값: ['x=-3', 'x=1'] } }),
  ];
  const k = { 실체: '두 근', node: { id: 'n1', entity: '두 근', color: 'B', surface: '', switchId: '', index: 0 } } as any;

  it('값은 띄어쓰기·순서·분수 표기를 무시한다', () => {
    assert.deepEqual(answer_values('∴ x = -3 또는 x = 1'), ['x=-3', 'x=1']);
    assert.deepEqual(answer_values('∴ x = 2/4'), ['x=0.5']);
    assert.equal(student_answer_line(학생), '∴ x = 1/2 또는 x = -3/2');
  });
  it('q5 학생 — ④ 불일치 X · ② 교사 판정 · 0점', () => {
    const r = grade(학생, 루브릭, '', k, '수리');
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'X');
    assert.equal(r.파트별.세우기.조각별[0].결과, '판정불가');
    assert.equal(r.부분점수, 0);
    // ± 등식 풀기 규칙(2026-10-16) 뒤 — 이 학생은 「x = (-1 ± 2) / 2」 등 ± 등식을 써서 학생 풀기가 있다 → 정상 흐름, ② 상한 없음
    //   (그 전에는 풀기 없음 → ④ X가 ② 세우기에 상한 1)
    assert.equal(r.풀기있음, true);
    assert.equal(r.파트별.세우기.상한, null);
    assert.equal(r.파트별.풀기.상한, 0);
  });
  it('풀기 없는 수리 — 교사가 ②를 O로 매겨도 ④ X면 ②는 상한 1점', () => {
    const 상한 = 봉인4b_게이트(
      [
        { 조각id: '세우기-1', 파트: '세우기', 요소: 'c', 결과: 'O', 배점: 3, 득점: 3, 판단근거: '' },
        { 조각id: '답구하기-1', 파트: '답구하기', 요소: 'k', 결과: 'X', 배점: 2, 득점: 0, 판단근거: '' },
      ],
      { 근거대기: 0, 세우기: 3, 풀기: 0, 답구하기: 2 },
      '수리',
    );
    assert.deepEqual(상한, { 세우기: 1 });
  });
  it('값이 맞으면 ④ O', () => {
    const r = grade('(x+3)(x-1)=0\n∴ x=-3 또는 x=1', 루브릭, '', k, '수리');
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'O');
    assert.equal(r.파트별.답구하기.파트점수, 2);
  });
});

// 학생 1 (오종래 2026-10-16) — 풀기 조각이 명시적으로 있으면 엔진이 잡는다 (인수분해 문항이라도), 있으면 게이트 정상 흐름
describe('풀기 조각 인식 — 「또는」으로 이은 등식', () => {
  const 학생1 = 'x²+2x-3=0의 좌변을 인수분해하면\n(x+3)(x-1)=0, x+3=0 또는 x-1=0\n∴ x=-3 또는 x=1';
  const 조각of = (c: Partial<조각> & Pick<조각, 'id' | '파트' | '배점'>): 조각 => ({
    요소: null, 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', ...c,
  });
  const k = { 실체: '두 근', node: { id: 'n1', entity: '두 근', color: 'B', surface: '', switchId: '', index: 0 } } as any;
  const q5루브릭 = [
    조각of({ id: '세우기-1', 파트: '세우기', 요소: 'c', 배점: 3, 줄글: '(x+3)(x-1)=0' }),
    조각of({ id: '답구하기-1', 파트: '답구하기', 배점: 2, 모범답: { 줄: '∴ x=1 또는 x=-3', 값: ['x=-3', 'x=1'] } }),
  ];

  it('한 줄 안 쉼표 마디에서 풀기를 가른다 — 세우기 마디는 ②로', () => {
    assert.deepEqual(solve_segments(학생1), ['x+3=0 또는 x-1=0']);
    const r = classify_math_lines('(x+3)(x-1)=0, x+3=0 또는 x-1=0\n∴ x=-3 또는 x=1');
    assert.deepEqual(r.세우기, ['(x+3)(x-1)=0']);
    assert.deepEqual(r.풀기, ['x+3=0 또는 x-1=0']);
    assert.deepEqual(classify_math_lines(모범).풀기, []);
  });
  it('모범답안에 풀기 마디가 있으면 ③ 풀기 조각', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(q5));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines('(x+3)(x-1)=0\nx+3=0 또는 x-1=0\n∴ x=1 또는 x=-3') }, '수리');
    assert.deepEqual(cs.map((c) => c.id), ['세우기-1', '풀기-1', '답구하기-1']);
    assert.equal(cs[1].풀기글, 'x+3=0 또는 x-1=0');
  });
  it('학생 1 — ④ O, 학생 풀기 인식, 게이트 정상 흐름', () => {
    const r = grade(학생1, q5루브릭, '', k, '수리');
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'O');
    assert.deepEqual(r.학생풀기, ['x+3=0 또는 x-1=0']);
    assert.equal(r.풀기있음, true);
  });
  it('학생 풀기가 있으면 ④ X여도 ② 상한 없음 (④→③), 없으면 ④→②', () => {
    const 틀린풀기 = '(x+3)(x-1)=0, x+3=0 또는 x-1=0\n∴ x=3 또는 x=-1';
    assert.equal(grade(틀린풀기, q5루브릭, '', k, '수리').파트별.세우기.상한, null);
    assert.equal(grade('(x+3)(x-1)=0\n∴ x=3 또는 x=-1', q5루브릭, '', k, '수리').파트별.세우기.상한, 1);
  });
});

// 학생 3 (2026-10-16) — 완전제곱식 다경로: 「x=-1±2」는 1 · -3 두 값. 인수분해 모범답안과 값이 같으면 ④ O
describe('완전제곱식 다경로 수용 — 복부호 값', () => {
  const 학생3 = 'x²+2x-3=0 에서\n(x²+2x+1)-1-3=0\n(x+1)²=4, x+1=±√4\n∴ x=-1±2, x=1 또는 x=-3';
  it('「x=-1±2」를 두 값으로 편다', () => {
    assert.deepEqual(answer_values('∴ x=-1±2'), ['x=-3', 'x=1']);
    assert.deepEqual(answer_values(student_answer_line(학생3)), ['x=-3', 'x=1']);
  });
  it('학생 3 — 인수분해 모범답안과 값 일치 → ④ O', () => {
    const k = { 실체: '두 근', node: { id: 'n1', entity: '두 근', color: 'B', surface: '', switchId: '', index: 0 } } as any;
    const 루브릭: 조각[] = [
      { id: '세우기-1', 파트: '세우기', 요소: 'c', 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', 배점: 3, 줄글: '(x+3)(x-1)=0' },
      { id: '답구하기-1', 파트: '답구하기', 요소: null, 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', 배점: 2, 모범답: { 줄: '∴ x=1 또는 x=-3', 값: ['x=-3', 'x=1'] } },
    ];
    const r = grade(학생3, 루브릭, '', k, '수리');
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'O');
    assert.equal(r.부분점수, 2);
  });
});

// 2026-10-16 — ±가 있는 등식도 풀기 조각 (「또는」 규칙에 추가). 「∴」 결론 줄은 그대로 풀기가 아니다
describe('풀기 조각 인식 — ± 등식', () => {
  const 학생3 = 'x²+2x-3=0 에서\n(x²+2x+1)-1-3=0\n(x+1)²=4, x+1=±√4\n∴ x=-1±2, x=1 또는 x=-3';
  const k = { 실체: '두 근', node: { id: 'n1', entity: '두 근', color: 'B', surface: '', switchId: '', index: 0 } } as any;
  const 루브릭: 조각[] = [
    { id: '세우기-1', 파트: '세우기', 요소: 'c', 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', 배점: 3, 줄글: '(x+3)(x-1)=0' },
    { id: '답구하기-1', 파트: '답구하기', 요소: null, 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', 배점: 2, 모범답: { 줄: '∴ x=1 또는 x=-3', 값: ['x=-3', 'x=1'] } },
  ];
  it('「x+1=±√4」 「x=-1±2」는 풀기, ± 없는 등식은 아니다', () => {
    assert.deepEqual(solve_segments(학생3), ['x+1=±√4']);
    assert.deepEqual(solve_segments('(x+1)²=4\nx=-1±2'), ['x=-1±2']);
    const r = classify_math_lines('(x+1)²=4, x+1=±√4\n∴ x=1 또는 x=-3');
    assert.deepEqual(r.세우기, ['(x+1)²=4']);
    assert.deepEqual(r.풀기, ['x+1=±√4']);
  });
  it('학생 3 — 학생 풀기 인식, 게이트 정상 흐름', () => {
    const r = grade(학생3, 루브릭, '', k, '수리');
    assert.deepEqual(r.학생풀기, ['x+1=±√4']);
    assert.equal(r.풀기있음, true);
  });
});

// 2026-10-16 — 「~하면」 「~이므로」로 끝나는 줄(마디)은 풀기가 아니다. 풀기는 등식 · 계산 결과 줄만
describe('풀기 조각 — 근거 문장 제외', () => {
  it('공식을 적은 「~이므로」 줄은 빼고 계산 결과 줄만', () => {
    assert.deepEqual(solve_segments(학생), ['x = (-1 ± √(1+3)) / 2', 'x = (-1 ± 2) / 2']);
    assert.deepEqual(solve_segments('x+3=0 또는 x-1=0 이므로\nx+1=±2 이면 되므로 x+1=±2 하면'), []);
  });
  it('모범답안의 「~이므로」 등식 줄은 풀기 조각이 아니다', () => {
    const r = classify_math_lines('(x+3)(x-1)=0, x+3=0 또는 x-1=0 이므로\n∴ x=1 또는 x=-3');
    assert.deepEqual(r.풀기, []);
  });
});
