// q7 엔진 규칙 5가지 (오종래 2026-10-16) — 나머지 정리 · 답이 둘인 문항
//   ① a와 R 두 값 함께 비교 · ② 조건 f(2)=1은 나머지 정리로 판정 · ③ 「f(2)=4+4+a=1」은 a에 값을 넣어 검증
//   ④ 「R=f(-1)=1-2-7=-8」 수 계산 줄은 풀기 · ⑤ 「~로 놓으면」은 ① 근거대기

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2 } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { parse_polynomial_conditions, remainder_points, substitution_sign_error, verify_definition, verify_remainder_chain, wrote_remainder } from '../src/rubric/multipath.ts';
import { classify_math_lines, line_answer_values, solve_segments } from '../src/rubric/solve_lines.ts';
import { verify_answer_values } from '../src/rubric/teacher_input.ts';

const 문항 = '다항식 x²+2x+a를 x-2로 나누었을 때 나머지가 1이었다.\n상수 a의 값과 주어진 다항식을 x+1로 나누었을 때의 나머지 R을 구하고\n풀이 과정을 서술하시오.';
const 모범 = 'f(x)=x²+2x+a로 놓으면\nf(2)=1, 즉 f(2)=4+4+a=1\n∴ a=-7\n\n이때 f(x)=x²+2x-7이므로\nR=f(-1)=1-2-7=-8';
const 원 = parse_polynomial_conditions(문항)!;

describe('다항식 · 나머지 조건', () => {
  it('다항식 x²+2x+a · 조건 f(2)=1, f(-1)=? · 상수 참값 a=-7', () => {
    assert.equal(원.식, 'x²+2x+a');
    assert.deepEqual(원.조건, [{ 근: 2, 나머지: 1 }, { 근: -1, 나머지: null }]);
    assert.equal(원.참값, -7);
  });
});

describe('줄 나누기 ① ④ ⑤', () => {
  const r = classify_math_lines(모범, 문항);
  it('「~로 놓으면」 ① · 수 계산 줄 풀기 · 답 값 a와 R', () => {
    assert.deepEqual(r.근거대기, ['f(x)=x²+2x+a로 놓으면']);
    assert.deepEqual(r.세우기, ['f(2)=1, 즉 f(2)=4+4+a=1']);
    assert.deepEqual(r.풀기, ['R=f(-1)=1-2-7=-8']);
    assert.deepEqual(r.답?.값, ['R=-8', 'a=-7']);
    assert.deepEqual(solve_segments('R=f(-1)=1-2-7=-8'), ['R=f(-1)=1-2-7=-8']);
  });
  it('문항에 없는 문자(D)로 시작하는 줄은 답이 아니다', () => {
    assert.equal(classify_math_lines('D=16\n∴ x=1', '이차방정식 x²-1=0').답?.값.join(','), 'x=1');
  });
  it('정답 검증도 두 값으로 — 「a=-7, R=-8」 일치, 하나 틀리면 불일치', () => {
    assert.equal(verify_answer_values('a=-7, R=-8', r.답)?.결과, '일치');
    assert.equal(verify_answer_values('a=-7, R=-6', r.답)?.결과, '불일치');
  });
});

describe('② ③ 나머지 정리 검증', () => {
  it('f(2)=1 · f(-1) 썼는가', () => {
    assert.equal(wrote_remainder(모범, 원.조건[0]), true);
    assert.equal(wrote_remainder(모범, 원.조건[1]), true);
    assert.equal(wrote_remainder('f(2)=3', 원.조건[0]), false);
  });
  it('「f(2)=4+4+a=1」 · 「R=f(-1)=1-2-7=-8」 맞음, 「f(2)=4+2+a」 · 「…=-6」 틀림', () => {
    assert.equal(verify_remainder_chain(모범, 원).결과, 'O');
    assert.equal(verify_remainder_chain('f(2)=4+2+a=1', 원).결과, 'X');
    assert.equal(verify_remainder_chain('R=f(-1)=1-2-7=-6', 원).결과, 'X');
  });
  it('f(x) 정의 — 상수째 · 참값을 넣은 꼴 모두 맞음', () => {
    assert.equal(verify_definition('f(x)=x²+2x+a', 원).결과, 'O');
    assert.equal(verify_definition('f(x)=x²+2x-7', 원).결과, 'O');
    assert.equal(verify_definition('f(x)=x²+2x+1', 원).결과, 'X');
  });
});

describe('q7 모범답안 자기 채점 — 조각 · 판정', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
  assert.ok(입력.ok);
  const 교사줄 = classify_math_lines(모범, 문항);
  const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄, 다항식: 원 }, '수리');
  it('「상수 a」는 ① 조각이 아니다 · 나머지 조건 · 다항식 정의 조각에 판정 자료가 붙는다', () => {
    const 근 = cs.filter((c) => c.파트 === '근거대기');
    assert.ok(!근.some((c) => /상수/.test(c.node?.entity ?? '')));
    assert.ok(근.some((c) => c.나머지조건?.근 === 2));
    assert.ok(근.some((c) => c.나머지조건?.근 === -1));
    assert.ok(근.some((c) => c.정의다항식));
    assert.ok(cs.some((c) => c.파트 === '세우기' && c.나머지다항식));
  });
  it('모범답안 — 모든 조각 O, 5점', () => {
    const 조각들 = cs.map((c, i) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 + (i === 0 ? 0 : 0) }));
    const r = grade(모범, 조각들 as any, '', 입력.k, '수리');
    const 결과 = Object.values(r.파트별).flatMap((p) => p.조각별.map((x) => x.결과));
    assert.ok(결과.every((x) => x === 'O'), 결과.join(','));
  });
});

// q7 학생 1 (2026-10-17) — f(-1) 대입 부호 오류: 「f(-1)=1+2-7=-4」 (2×(-1)을 +2로), 계산 자체는 맞다
describe('q7 학생 1 — 대입 부호 오류', () => {
  const 학생1 = 'f(x)=x²+2x+a로 놓으면 나머지정리에 의하여\nx-2로 나눈 나머지는 f(2)이므로\nf(2)=4+4+a=1, a=-7\n\n즉, f(x)=x²+2x-7이고 주어진 다항식\nf(x)를 x+1로 나눈 나머지는 나머지정리로부터\nf(-1)이므로\nf(-1)=1+2-7=-4';
  it('항 하나 부호만 다르면 이름 — 「f(-1) 대입 부호 오류 — 2×(-1)=+2로 계산」', () => {
    assert.equal(substitution_sign_error(원, -1, '1+2-7'), 'f(-1) 대입 부호 오류 — 2×(-1)=+2로 계산');
    assert.equal(substitution_sign_error(원, -1, '1-2-7'), null);
    assert.equal(substitution_sign_error(원, -1, '1+2+7'), null); // 두 항이 틀리면 이름 없음
  });
  it('조각마다 자기 c만 — f(2) 줄은 맞고 f(-1) 줄만 틀림', () => {
    assert.equal(verify_remainder_chain(학생1, 원, [2]).결과, 'O');
    assert.equal(verify_remainder_chain(학생1, 원, [-1]).결과, 'X');
    assert.deepEqual(remainder_points('R=f(-1)=1-2-7=-8'), [-1]);
  });
  it('쉼표 뒤 「a=-7」도 답 값', () => {
    assert.deepEqual(line_answer_values('f(2)=4+4+a=1, a=-7'), ['a=-7']);
  });
  it('G1 — ② O · ③ X(대입 부호 오류) · ④ X (a 맞고 R 없음) · 경고', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 다항식: 원 }, '수리');
    const r = grade(학생1, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    assert.equal(r.파트별.세우기.조각별[0].결과, 'O');
    assert.equal(r.파트별.풀기.조각별[0].결과, 'X');
    assert.match(r.파트별.풀기.조각별[0].판단근거, /^f\(-1\) 대입 부호 오류 — 2×\(-1\)=\+2로 계산/);
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'X');
    assert.ok(r.경고.includes('풀기-1: f(-1) 대입 부호 오류 — 2×(-1)=+2로 계산'));
  });
});
