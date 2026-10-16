// q6 엔진 규칙 6가지 (오종래 2026-10-16) — 근과 계수의 관계 문항
//   ① 「∴」 없어도 마지막 줄 끝 수를 답으로 대조 · ② 「=」로 시작하는 계산 줄은 풀기
//   ③ α+β · αβ 값을 원식 계수(-b/a · c/a)로 검증 · ④ 식 변형(α³+β³=…)은 수를 넣어 양변 검증
//   ⑤ 정의 조건(「두 근을 α, β라 할 때」)은 ①에서 뺀다 · ⑥ 「~이므로」로 끝나는 등식 줄은 세우기가 아니다

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2 } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { evaluate, verify_calculation, verify_identity, verify_setup, verify_vieta } from '../src/rubric/multipath.ts';
import { classify_math_lines, final_value, solve_segments } from '../src/rubric/solve_lines.ts';
import type { 조각 } from '../src/rubric/types.ts';

const 원 = { a: 1, b: 1, c: -2 };
const 모범 = 'x²+x-2=0의 두 근이 α, β이므로\n이차방정식 근과 계수의 관계로부터\nα+β=-1, αβ=-2\n대하여, 구하는 값은\nα³+β³=(α+β)³-3αβ(α+β)\n= (-1)³-3×(-2)×(-1)\n= -1-6=-7';

describe('줄 나누기 ① ② ⑥', () => {
  const r = classify_math_lines(모범);
  it('「~이므로」 등식 줄은 미분류, 「=」로 시작하는 줄은 풀기', () => {
    assert.ok(r.미분류.includes('x²+x-2=0의 두 근이 α, β이므로'));
    assert.deepEqual(r.세우기, ['α+β=-1, αβ=-2', 'α³+β³=(α+β)³-3αβ(α+β)']);
    assert.deepEqual(r.풀기, ['= (-1)³-3×(-2)×(-1)', '= -1-6=-7']);
    assert.deepEqual(solve_segments('= -1-6=-7'), ['= -1-6=-7']);
  });
  it('「∴」가 없으면 마지막 「=」 줄 끝 수가 답', () => {
    assert.deepEqual(r.답, { 줄: '= -1-6=-7', 값: ['-7'], 끝값: true });
    assert.equal(final_value('α³+β³=-7'), '-7');
    assert.equal(final_value('x=a+b'), null);
    assert.equal(classify_math_lines('(x+3)(x-1)=0\n∴ x=1 또는 x=-3').답?.끝값, undefined);
  });
});

describe('③ 근과 계수의 관계 · ④ 식 변형', () => {
  it('α+β=-1 · αβ=-2는 맞고, 하나라도 틀리면 X', () => {
    assert.equal(verify_vieta('α+β=-1, αβ=-2', 원).결과, 'O');
    assert.equal(verify_vieta('α+β=1, αβ=-2', 원).결과, 'X');
    assert.equal(verify_vieta('α³+β³=-7', 원).결과, '판정불가');
  });
  it('α³+β³=(α+β)³-3αβ(α+β)는 항등식, 계수가 틀리면 X', () => {
    assert.equal(verify_identity('α³+β³=(α+β)³-3αβ(α+β)').결과, 'O');
    assert.equal(verify_identity('α³+β³=(α+β)³-αβ(α+β)').결과, 'X');
    assert.equal(verify_identity('α+β=-1').결과, '판정불가');
    assert.equal(evaluate('(-1)³-3×(-2)×(-1)'), -7);
  });
  it('모범 줄 꼴로 검증을 고른다 — 근과 계수 줄 · 식 변형 줄 · 풀이 경로', () => {
    assert.equal(verify_setup('α+β=-1, αβ=-2', 'α+β=-1, αβ=-2', 원).경로, '근과 계수의 관계');
    assert.equal(verify_setup('α³+β³=(α+β)³-3αβ(α+β)', 'α³+β³=(α+β)³-3αβ(α+β)', 원).경로, '식 변형');
    assert.equal(verify_setup('(x+2)(x-1)=0', '(x+2)(x-1)=0', 원).경로, '인수분해');
  });
});

describe('⑤ 정의 조건은 ①에서 뺀다', () => {
  it('q6 — 「이차방정식 …의 두 근」 · 「α, β」(라 할 때)는 ① 조각이 아니다', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis('이차방정식 x²+x-2=0의 두 근을\nα, β라 할 때 α³+β³의 값을 구하고\n풀이 과정을 서술하시오.'));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    assert.equal(cs.filter((c) => c.파트 === '근거대기').length, 0);
  });
});

describe('q6 모범답안 자기 채점', () => {
  const k = { 실체: 'α³+β³의 값', node: { id: 'n4', entity: 'α³+β³의 값', color: 'B', surface: '', switchId: '', index: 0 } } as any;
  const 조각of = (c: Partial<조각> & Pick<조각, 'id' | '파트' | '배점'>): 조각 => ({ 요소: null, 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', ...c });
  const 루브릭 = [
    조각of({ id: '세우기-1', 파트: '세우기', 요소: 'c', 배점: 1.1, 줄글: 'α+β=-1, αβ=-2', 원식: 원 }),
    조각of({ id: '세우기-2', 파트: '세우기', 요소: 'c', 배점: 1.1, 줄글: 'α³+β³=(α+β)³-3αβ(α+β)', 원식: 원 }),
    조각of({ id: '답구하기-1', 파트: '답구하기', 배점: 1.4, 모범답: { 줄: '= -1-6=-7', 값: ['-7'], 끝값: true } }),
  ];
  it('② 근과 계수 O · 식 변형 O · ④ 끝 값 -7 O', () => {
    const r = grade(모범, 루브릭, '', k, '수리');
    assert.deepEqual(r.파트별.세우기.조각별.map((x) => x.결과), ['O', 'O']);
    assert.equal(r.파트별.답구하기.조각별[0].결과, 'O');
  });
  it('끝 값이 다르면 ④ X · 「∴ α³+β³=-7」도 끝 값으로 맞음', () => {
    assert.equal(grade('α+β=-1, αβ=-2\n= -1+6=5', 루브릭, '', k, '수리').파트별.답구하기.조각별[0].결과, 'X');
    assert.equal(grade('∴ α³+β³=-7', 루브릭, '', k, '수리').파트별.답구하기.조각별[0].결과, 'O');
  });
});

// 풀기 계산 검증 (오종래 2026-10-16) — 「=」 앞뒤 값을 엔진이 계산: 맞으면 O, 틀리면 X, 문자식뿐이면 교사
describe('풀기 계산 검증', () => {
  it('「= …」 줄은 앞 줄 마지막 변과 이어 본다 — q6 모범은 모두 같아 O', () => {
    const r = verify_calculation(모범);
    assert.equal(r.결과, 'O');
    assert.deepEqual(r.짝.map((p) => [p.왼, p.오른]), [['(-1)³-3×(-2)×(-1)', '-1-6'], ['-1-6', '-7']]);
  });
  it('계산이 틀리면 X — (-1)³-3×(-2)×(-1) ≠ -1+6', () => {
    assert.equal(verify_calculation('= (-1)³-3×(-2)×(-1)\n= -1+6=5').결과, 'X');
  });
  it('문자식 · 부등식 · ± 줄뿐이면 판정불가', () => {
    assert.equal(verify_calculation('D=-4k+8>0, 4k<8 ∴ k<2').결과, '판정불가');
    assert.equal(verify_calculation('x = (-2±√16) / 2\n∴ x=1 또는 x=-3').결과, '판정불가');
  });
  it('G1 — 풀기 조각: 맞으면 O, 틀리면 X, 계산할 줄이 없으면 교사', () => {
    const k = { 실체: 'α³+β³의 값', node: { id: 'n4', entity: 'α³+β³의 값', color: 'B', surface: '', switchId: '', index: 0 } } as any;
    const 풀기: 조각 = { id: '풀기-1', 파트: '풀기', 요소: null, 수행질: '정확성', 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', 배점: 0.7, 풀기글: '= (-1)³-3×(-2)×(-1)' };
    const 결과 = (답: string) => grade(답, [풀기], '', k, '수리').파트별.풀기.조각별[0].결과;
    assert.equal(결과(모범), 'O');
    assert.equal(결과('α³+β³=(α+β)³-3αβ(α+β)\n= (-1)³-3×(-2)×(-1)\n= -1+6=5'), 'X');
    assert.equal(결과('α³+β³=(α+β)³-3αβ(α+β)'), '판정불가');
  });
});
