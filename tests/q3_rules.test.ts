// q3 경우의 수 (오종래 2026-10-17, 안 A 확정) — 모범답안 줄 조각으로 채점
//   ① 같은 것이 있는 순열(÷2!) · ② 「1/2!×3P2=3」 「4!=24」 식 검증 · ③ 「3×24=72」 계산 검증 · ④ 끝 값 72

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2 } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { evaluate, is_math_item, parse_counting_item, resolve_subject, verify_case_split, verify_case_split_line, verify_counting_line, wrote_same_permutation } from '../src/rubric/multipath.ts';
import { classify_math_lines, final_value } from '../src/rubric/solve_lines.ts';

const 문항 = 'a,a,b,c,d,e가 쓰인 6장 카드를 일렬로 나열할 때\n양 끝이 모음이 오는 경우의 수를 구하고 풀이 과정을 서술하시오.';
const 모범 = '양 끝 모음 나열: 1/2! × 3P2 = 3\n나머지 4개 나열: 4!=24\n∴ 3×24=72(가지)';
const 문항정보 = parse_counting_item(문항)!;

describe('계산기 — 계승 · 순열 · 조합', () => {
  it('「4!」=24 · 「3P2」=6 · 「5C2」=10 · 「1/2!×3P2」=3 (계승이 나눗셈보다 먼저)', () => {
    assert.equal(evaluate('4!'), 24);
    assert.equal(evaluate('3P2'), 6);
    assert.equal(evaluate('5C2'), 10);
    assert.equal(evaluate('1/2! × 3P2'), 3);
    assert.equal(evaluate('3×24'), 72);
  });
});

describe('경우의 수 문항', () => {
  it('수학 문항 — 「자동」이면 수리', () => {
    assert.equal(is_math_item(문항), true);
    assert.equal(resolve_subject('자동', 문항), '수리');
  });
  it('나열 대상 a,a,b,c,d,e — 같은 것 a 2개', () => {
    assert.deepEqual(문항정보.원소, ['a', 'a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(문항정보.중복, [{ 원소: 'a', 개수: 2 }]);
  });
  it('줄 나누기 — 세우기 두 줄 · 「∴ 3×24=72(가지)」 계산은 풀기, 끝 값 72가 답', () => {
    const r = classify_math_lines(모범, 문항);
    assert.deepEqual(r.세우기, ['양 끝 모음 나열: 1/2! × 3P2 = 3', '나머지 4개 나열: 4!=24']);
    assert.deepEqual(r.풀기, ['3×24=72']);
    assert.deepEqual(r.답, { 줄: '∴ 3×24=72(가지)', 값: ['72'], 끝값: true });
    assert.equal(final_value('∴ 3×24=72(가지)'), '72');
  });
});

describe('① ÷2! · ② 식 검증', () => {
  it('같은 것이 있는 순열 — 「1/2!」 「÷2!」 있음, 없으면 X', () => {
    assert.equal(wrote_same_permutation(모범, 문항정보), true);
    assert.equal(wrote_same_permutation('3P2÷2!=3', 문항정보), true);
    assert.equal(wrote_same_permutation('3P2=6\n4!=24', 문항정보), false);
  });
  it('「1/2!×3P2=3」 맞음 · 「3P2=6」(÷2! 빠짐) · 「4!=12」 X · 식 없으면 판정불가', () => {
    assert.equal(verify_counting_line('양 끝 모음 나열: 1/2! × 3P2 = 3', 모범).결과, 'O');
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', 모범).결과, 'O');
    assert.equal(verify_counting_line('양 끝 모음 나열: 1/2! × 3P2 = 3', '3P2=6\n4!=24').결과, 'X');
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', '4!=12').결과, 'X');
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', '3×24=72').결과, '판정불가');
  });
});

describe('q3 모범답안 자기 채점 (안 A)', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
  assert.ok(입력.ok);
  const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
  it('문항 노드 조각 없음 — ① ÷2! 하나 · ② 줄 둘 · ③ 계산 하나 · ④ 하나', () => {
    assert.deepEqual(cs.map((c) => c.id), ['근거대기-1', '세우기-1', '세우기-2', '풀기-1', '답구하기-1']);
    assert.ok(cs.every((c) => c.파트 === '답구하기' || c.node === null));
  });
  it('모든 조각 O', () => {
    const r = grade(모범, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 결과 = Object.values(r.파트별).flatMap((p) => p.조각별.map((x) => x.결과));
    assert.ok(결과.every((x) => x === 'O'), 결과.join(','));
  });
  it('÷2!을 빠뜨리고 72를 쓴 답 — ① X · ② X', () => {
    const r = grade('양 끝: 3P2=6\n나머지: 4!=24\n∴ 6×12=72', cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    assert.equal(r.파트별.근거대기.조각별[0].결과, 'X');
    assert.equal(r.파트별.세우기.조각별[0].결과, 'X');
  });
});

// q3 학생 1 (오종래 2026-10-17, (가) 확정) — ÷2! 대신 같은 것(a,a)을 경우로 나누어 센다
const 학생1 = 'i) 양끝에 모음 a,a가 나열되는 경우\n→ 4!=24(가지)\n\nii) 양끝에 모음 a,e가 나열되는 경우\na,e 단 e,a의 2가지 경우이므로\n→ 2!×4!=48(가지)\n\n따라서, 24+48=72(가지)';

describe('경우 나누기 경로 (q3 학생 1)', () => {
  it('경우 값 24 · 48, 합 24+48=72 — 모범 끝 값 72와 같으면 O', () => {
    const v = verify_case_split(학생1, 72);
    assert.equal(v.결과, 'O');
    assert.deepEqual(v.경우값, [24, 48]);
  });
  it('합이 모범 끝 값과 다르면 X · 경우 식 계산이 틀리면 X · 표지가 하나뿐이면 판정불가', () => {
    assert.equal(verify_case_split('i) → 4!=24\nii) → 4!=24\n∴ 24+24=48', 72).결과, 'X');
    assert.equal(verify_case_split('i) → 4!=24\nii) → 2!×4!=46\n∴ 24+46=70', 72).결과, 'X');
    assert.equal(verify_case_split('i) → 4!=24\n∴ 24', 72).결과, '판정불가');
    assert.equal(verify_case_split('(1) → 4!=24\n(2) → 2!×4!=48\n24+48=72', 72).결과, 'O');
    assert.equal(verify_case_split('① → 4!=24\n② → 2!×4!=48\n48+24=72', 72).결과, 'O');
  });
  it('세우기 줄 「1/2!×3P2=3」 — 24÷24 + 48÷24 = 1+2 = 3', () => {
    assert.equal(verify_case_split_line('양 끝 모음 나열: 1/2! × 3P2 = 3', 학생1, 72).결과, 'O');
  });
  it('「→ 4!=24」 — 화살표를 떼고 읽는다', () => {
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', 학생1).결과, 'O');
  });
  it('채점 — ① 🔆 · ② 🔆 · ② 같은 경로 · ③ · ④ 모두 O', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
    const r = grade(학생1, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 조각 = Object.values(r.파트별).flatMap((p) => p.조각별);
    assert.ok(조각.every((x) => x.결과 === 'O'), 조각.map((x) => `${x.결과} ${x.판단근거}`).join('\n'));
    assert.match(r.파트별.근거대기.조각별[0].판단근거, /🔆.*경우로 나누어 처리/);
    assert.match(r.파트별.세우기.조각별[0].판단근거, /🔆 다경로 — 경우 나누기/);
    assert.match(r.파트별.세우기.조각별[1].판단근거, /모범답안과 같은 경로/);
  });
});
