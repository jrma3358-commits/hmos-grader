// q3 경우의 수 (오종래 2026-10-17, 안 A 확정) — 모범답안 줄 조각으로 채점
//   ① 같은 것이 있는 순열(÷2!) · ② 「1/2!×3P2=3」 「4!=24」 식 검증 · ③ 「3×24=72」 계산 검증 · ④ 끝 값 72

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2 } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { count_arrangements, evaluate, is_math_item, verify_complement, parse_counting_item, resolve_subject, verify_case_split, verify_case_split_line, verify_counting_factor, verify_counting_line, 중복미처리오류, wrote_same_permutation } from '../src/rubric/multipath.ts';
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

// q3 학생 2 (오종래 2026-10-17) — 양 끝 2×2=4 (같은 것 a,a 미처리, 맞는 값 3) · 가운데 4×3×2×1=24 맞음 · 끝 값 96
const 학생2 = '양끝이 모음을 나열하는 경우의 수는\n2×2=4(가지)\n이 때, 1 사이사이에 4개의 원자를 나열하면\n4×3×2×1=24(가지)\n\n∴ 4×24=96(가지)';

describe('양 끝 모음 경우의 수 오류 — 중복 미처리 (q3 학생 2)', () => {
  it('「4×3×2×1=24」 — 계승을 풀어 쓴 곱도 경우의 수 식 · 「2×2」는 아니다', () => {
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', 학생2).결과, 'O');
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', '2×2=4').결과, '판정불가');
  });
  it('결론 「4×24=96」에서 24를 뺀 4가 양 끝 학생 값 — 모범 값 3과 다르고 ÷2! 없음 → 오류 이름', () => {
    const v = verify_counting_factor('양 끝 모음 나열: 1/2! × 3P2 = 3', 학생2, [24], 문항정보);
    assert.equal(v.결과, 'X');
    assert.equal(v.오류, '양 끝 모음 경우의 수 오류 — 중복 미처리');
    assert.equal(v.시도[0].식, '2*2=4');
    assert.equal(중복미처리오류('나머지 4개 나열: 4!=24'), '나머지 4개 경우의 수 오류 — 중복 미처리');
  });
  it('채점 — ① X · ② 양 끝 X (오류 이름) · ② 가운데 O · ③ O · ④ X', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
    const r = grade(학생2, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 결과 = Object.values(r.파트별).flatMap((p) => p.조각별.map((x) => x.결과));
    assert.deepEqual(결과, ['X', 'X', 'O', 'O', 'X']);
    assert.match(r.파트별.세우기.조각별[0].판단근거, /^양 끝 모음 경우의 수 오류 — 중복 미처리/);
  });
});

// q3 학생 7 (오종래 2026-10-17, B안) — 양 끝 2 (중복 미처리, 맞는 값 3) · 나머지 3×2×1=6 (4장인데 3장만, 맞는 값 4!=24) · 끝 값 12
const 학생7 = '모음을 양끝에 나열하면 2(가지)\n나머지 자음을 나열하면 3×2×1=6(가지)\n\n∴ 2×6=12(가지)';

describe('두 줄 모두 틀림 — 중복 미처리 · 개수 오류 (q3 학생 7)', () => {
  const 자리 = (i: number) => ({ 줄값들: [3, 24], i });
  it('결론 「2×6」 — 줄 차례대로: 양 끝 2 · 나머지 6', () => {
    const a = verify_counting_factor('양 끝 모음 나열: 1/2! × 3P2 = 3', 학생7, [24], 문항정보, 자리(0));
    assert.equal(a.결과, 'X');
    assert.equal(a.오류, '양 끝 모음 경우의 수 오류 — 중복 미처리');
    const b = verify_counting_factor('나머지 4개 나열: 4!=24', 학생7, [3], 문항정보, 자리(1));
    assert.equal(b.결과, 'X');
    assert.equal(b.오류, '나머지 4개 경우의 수 오류 — 개수 오류');
    assert.equal(b.시도[0].식, '3*2*1=6');
  });
  it('자리가 없으면 예전처럼 판정불가', () => {
    assert.equal(verify_counting_factor('나머지 4개 나열: 4!=24', 학생7, [3], 문항정보).결과, '판정불가');
  });
  it('채점 — ① X · ② 양 끝 X (중복 미처리) · ② 나머지 X (개수 오류) · ③ O · ④ X', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
    const r = grade(학생7, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 결과 = Object.values(r.파트별).flatMap((p) => p.조각별.map((x) => x.결과));
    assert.deepEqual(결과, ['X', 'X', 'X', 'O', 'X']);
    assert.match(r.파트별.세우기.조각별[0].판단근거, /^양 끝 모음 경우의 수 오류 — 중복 미처리/);
    assert.match(r.파트별.세우기.조각별[1].판단근거, /^나머지 4개 경우의 수 오류 — 개수 오류/);
  });
});

// q3 학생 3 (오종래 2026-10-17, 진단 확정) — 여사건을 「양 끝 모두 자음」으로 잡음: 360-72=288 (정답 72)
//   4!/2!=12는 맞다 — 양 끝이 자음이면 a 두 장이 모두 가운데에 있다
const 학생3 = '전체 경우의 수: 6!/2!=6×5×4×3=360(가지)\n\n양끝에 모두 자음이 오는 경우:\n3×2=6(가지)이고, 사이사이 나머지를 나열하는 경우의 수:\n4!/2!=4×3=12\n\n즉, 6×12=72\n\n따라서, 양 끝에 모음이 오는 경우의 수:\n360-72=288(가지)';

describe('여사건 경로 (q3 학생 3)', () => {
  it('나열 수 — 전체 360 · 양 끝 모음 72 · 양 끝 자음 72', () => {
    const 원소 = 문항정보.원소;
    const 모음 = (x: string) => x === 'a' || x === 'e';
    assert.equal(count_arrangements(원소), 360);
    assert.equal(count_arrangements(원소, (a) => 모음(a[0]) && 모음(a.at(-1)!)), 72);
    assert.equal(count_arrangements(원소, (a) => !모음(a[0]) && !모음(a.at(-1)!)), 72);
  });
  it('360-72=288 — 뺀 값이 양 끝 모두 자음 → X · 오류 이름', () => {
    const v = verify_complement(학생3, 문항정보, 72);
    assert.equal(v.결과, 'X');
    assert.equal(v.오류, '양 끝 모두 자음만 뺌 — 여사건 계산 오류');
  });
  it('360-288=72 — 맞는 여사건이면 O · 다른 뺀 값은 오류 이름 없이 X · 전체 줄이 없으면 판정불가', () => {
    assert.equal(verify_complement('전체: 6!/2!=360\n양 끝 중 자음이 있는 경우: 288\n∴ 360-288=72', 문항정보, 72).결과, 'O');
    const w = verify_complement('전체: 6!/2!=360\n∴ 360-100=260', 문항정보, 72);
    assert.equal(w.결과, 'X');
    assert.equal(w.오류, undefined);
    assert.equal(verify_complement('360-72=288', 문항정보, 72).결과, '판정불가');
  });
  it('채점 — ① O(÷2! 있음) · ② 둘 X (오류 이름) · ③ O · ④ X', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
    const r = grade(학생3, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 결과 = Object.values(r.파트별).flatMap((p) => p.조각별.map((x) => x.결과));
    assert.deepEqual(결과, ['O', 'X', 'X', 'O', 'X']);
    for (const x of r.파트별.세우기.조각별) assert.match(x.판단근거, /^양 끝 모두 자음만 뺌 — 여사건 계산 오류/);
  });
});

// q3 학생 4 (오종래 2026-10-17) — 양 끝 모음 조합을 (i)(ii)(iii)으로 나열 · 경우마다 「→ 4!」 · ∴ 3×4!=72 (경우 나누기 변형)
const 학생4 = '(i)  a,(b,c,d,e),a → 4!\n(ii) a,(a,b,c,d),e → 4!\n(iii) e,(a,b,c,d),a → 4!\n\n∴ 3×4! = 3×24 = 72(가지)';

describe('경우 나누기 변형 — 나열 · 「→ 4!」 · 「3×4!」 (q3 학생 4)', () => {
  it('경우 값 24 · 24 · 24, 합 줄 「3×4!=3×24=72」 — O', () => {
    const v = verify_case_split(학생4, 72, 문항정보);
    assert.equal(v.결과, 'O');
    assert.deepEqual(v.경우값, [24, 24, 24]);
  });
  it('나열한 카드가 원소와 다르거나 · 가운데 나열 수가 경우 값과 다르면 X', () => {
    assert.equal(verify_case_split('(i) a,(b,c,d,d),a → 4!\n(ii) a,(a,b,c,d),e → 4!\n(iii) e,(a,b,c,d),a → 4!\n∴ 3×4!=72', 72, 문항정보).결과, 'X');
    assert.equal(verify_case_split('(i) b,(a,a,c,d),e → 4!\n(ii) a,(a,b,c,d),e → 4!\n(iii) e,(a,b,c,d),a → 4!\n∴ 3×4!=72', 72, 문항정보).결과, 'X');
  });
  it('「∴」 줄은 마지막 경우에 들지 않는다 — 학생 1 결과 그대로', () => {
    assert.deepEqual(verify_case_split(학생1, 72, 문항정보).경우값, [24, 48]);
  });
  it('채점 — 모든 조각 O (① 🔆 · ② 둘 🔆 경우 나누기)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
    const r = grade(학생4, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 조각 = Object.values(r.파트별).flatMap((p) => p.조각별);
    assert.ok(조각.every((x) => x.결과 === 'O'), 조각.map((x) => `${x.결과} ${x.판단근거}`).join('\n'));
    assert.match(r.파트별.근거대기.조각별[0].판단근거, /🔆.*경우로 나누어 처리/);
    for (const x of r.파트별.세우기.조각별) assert.match(x.판단근거, /🔆 다경로 — 경우 나누기/);
  });
});

// q3 학생 6 (오종래 2026-10-17) — 양 끝 2!=2 (같은 것 a,a 미처리, 맞는 값 3) · 나머지 4!=24 맞음 · 끝 값 48
const 학생6 = '모음은 a,e 2가지로 2!=2(가지)\n나머지 4개를 나열하면 4!=24(가지)\n\n∴ 2×24=48(가지)';

describe('양 끝 모음 경우의 수 오류 — 중복 미처리 (q3 학생 6)', () => {
  it('「:」 없이 글 뒤에 온 식 — 「나머지 4개를 나열하면 4!=24」를 읽는다', () => {
    assert.equal(verify_counting_line('나머지 4개 나열: 4!=24', 학생6).결과, 'O');
  });
  it('결론 「2×24=48」에서 24를 뺀 2 (「2!=2」) — 오류 이름', () => {
    const v = verify_counting_factor('양 끝 모음 나열: 1/2! × 3P2 = 3', 학생6, [24], 문항정보);
    assert.equal(v.결과, 'X');
    assert.equal(v.오류, '양 끝 모음 경우의 수 오류 — 중복 미처리');
    assert.equal(v.시도[0].식, '2!=2');
  });
  it('채점 — ① X · ② 양 끝 X (오류 이름) · ② 가운데 O · ③ O · ④ X', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(문항));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사줄: classify_math_lines(모범, 문항), 경우의수: 문항정보 }, '수리');
    const r = grade(학생6, cs.map((c) => ({ ...c, 충족조건: '', 모범조각: '', 배점: 1 })) as any, '', 입력.k, '수리');
    const 결과 = Object.values(r.파트별).flatMap((p) => p.조각별.map((x) => x.결과));
    assert.deepEqual(결과, ['X', 'X', 'O', 'O', 'X']);
    assert.match(r.파트별.세우기.조각별[0].판단근거, /^양 끝 모음 경우의 수 오류 — 중복 미처리/);
  });
});
