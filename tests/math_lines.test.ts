// q5 수리 서술형 규칙 (오종래 2026-10-16)
//   (a) 「~고」 Q 뒤 물음의 「풀이 과정」은 작성 지시 — 「~고」 앞 B가 급소, ④ 대상·① 조각에서 빠진다 (「풀이 과정」류만)
//   (b) 수리 모범답안 줄: 「~하면」 ① · 등식 ② · 「∴」 ④ 모범 값 · 풀기 없음 (세우기=풀기). 줄 조각은 교사 판정
//   (c) ④ 모범 값과 학생 답 값을 직접 대조 — 불일치면 X

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2 } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { answer_values, classify_math_lines, student_answer_line } from '../src/rubric/solve_lines.ts';
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
  });
  it('값이 맞으면 ④ O', () => {
    const r = grade('(x+3)(x-1)=0\n∴ x=-3 또는 x=1', 루브릭, '', k, '수리');
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'O');
    assert.equal(r.파트별.답구하기.파트점수, 2);
  });
});
