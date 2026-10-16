// 수리 서술형 다경로 검증 (오종래 2026-10-16) — ② 세우기를 엔진이 수학적으로 검증
//   인수분해 · 완전제곱식 · 근의 공식 · 근의 공식 2 — 검증되면 O(🔆), 꼴은 있는데 틀리면 X, 아는 꼴이 없으면 판정불가

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { grade } from '../src/rubric/g1.ts';
import { evaluate, parse_poly, parse_quadratic, roots, verify_multipath } from '../src/rubric/multipath.ts';
import type { 조각 } from '../src/rubric/types.ts';

const 원 = { a: 1, b: 2, c: -3 };
const q5 = {
  학생0: '근의 공식을 이용하면 x = (-b ± √(b²-ac)) / a 이므로\nx = (-1 ± √(1+3)) / 2 , x = (-1 ± 2) / 2\n∴ x = 1/2 또는 x = -3/2',
  학생1: 'x²+2x-3=0의 좌변을 인수분해하면\n(x+3)(x-1)=0, x+3=0 또는 x-1=0\n∴ x=-3 또는 x=1',
  학생3: 'x²+2x-3=0 에서\n(x²+2x+1)-1-3=0\n(x+1)²=4, x+1=±√4\n∴ x=-1±2, x=1 또는 x=-3',
  학생4: "x²+2x-3=0에서 x의 계수 2는 짝수이므로\nax²+2b'x+c=0의 근의 공식\nx = (-b'±√(b'²-ac)) / a\n를 이용하면\nx = (-1±√(1-1×(-3))) / 1 = -1±2\n∴ x=1 또는 x=-3",
  학생5: 'x²+2x-3=0에서\nx = (-2±√(4-4×3)) / 2 = (-2±√(-8)) / 2',
  학생6: '근의 공식을 이용하면 x²+2x-3=0에서\nx = (-2±√(2²-4×1×(-3))) / 2×1\n= (-2±√16) / 2\n= (-2±4) / 2\n∴ x=1 또는 x=-3',
};

describe('원식 · 계산기', () => {
  it('문항에서 수 계수 이차방정식을 뽑는다 — 문자 계수면 없음', () => {
    assert.deepEqual(parse_quadratic('이차방정식 x²+2x-3=0의 두 근을 구하고'), 원);
    assert.equal(parse_quadratic('이차함수 y=x²+x+k와 직선 y=-x+1이'), null);
    assert.deepEqual(parse_poly('2x-1'), [-1, 2, 0]);
    assert.deepEqual(roots(원), [-3, 1]);
  });
  it('산술만 계산한다 — 문자가 있으면 null, 음수 제곱근은 NaN', () => {
    assert.equal(evaluate('(-2+√(2²-4×1×(-3)))/2×1'), 1);
    assert.equal(evaluate('(-b+√(b²-4ac))/2a'), null);
    assert.ok(Number.isNaN(evaluate('√(-8)')));
  });
});

describe('다경로 검증 — q5 학생들', () => {
  const 판정 = (답: string) => { const r = verify_multipath(답, 원); return [r.결과, r.경로 ?? null]; };
  it('인수분해 · 완전제곱식 · 근의 공식 · 근의 공식 2 → O', () => {
    assert.deepEqual(판정(q5.학생1), ['O', '인수분해']);
    assert.deepEqual(판정(q5.학생3), ['O', '완전제곱식']);
    assert.deepEqual(판정(q5.학생4), ['O', '근의 공식 2']);
    assert.deepEqual(판정(q5.학생6), ['O', '근의 공식']);
  });
  it('경로 꼴은 있는데 틀리면 X — 잘못된 공식 · 부호 오류', () => {
    assert.equal(판정(q5.학생0)[0], 'X');
    assert.equal(판정(q5.학생5)[0], 'X');
    assert.equal(판정('(x+3)(x+1)=0\n∴ x=-3 또는 x=-1')[0], 'X');
    assert.equal(판정('(x+1)²=2')[0], 'X');
  });
  it('아는 경로 꼴이 없으면 판정불가', () => {
    assert.equal(판정('x=1 또는 x=-3 을 대입하면 성립한다\n∴ x=1 또는 x=-3')[0], '판정불가');
  });
  it('최고차 계수가 있어도 비례로 본다 — 2(x+3)(x-1)=0', () => {
    assert.equal(판정('2(x+3)(x-1)=0')[0], 'O');
  });
});

describe('G1 — ② 세우기 줄 조각에 원식이 있으면 엔진 판정 (🔆)', () => {
  const k = { 실체: '두 근', node: { id: 'n1', entity: '두 근', color: 'B', surface: '', switchId: '', index: 0 } } as any;
  const 세우기 = (원식?: typeof 원): 조각 => ({ id: '세우기-1', 파트: '세우기', 요소: 'c', 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: null, 모범조각: '', 배점: 3, 줄글: '(x+3)(x-1)=0', ...(원식 ? { 원식 } : {}) });
  it('학생 6 — O 확정 + 🔆 다경로', () => {
    const r = grade(q5.학생6, [세우기(원)], '', k, '수리').파트별.세우기.조각별[0];
    assert.equal(r.결과, 'O');
    assert.equal(r.다경로, '근의 공식');
    assert.match(r.판단근거, /^🔆 다경로/);
  });
  it('학생 0 — X', () => {
    assert.equal(grade(q5.학생0, [세우기(원)], '', k, '수리').파트별.세우기.조각별[0].결과, 'X');
  });
  it('원식이 없으면(q4 문자 계수) 그대로 교사 판정', () => {
    assert.equal(grade(q5.학생6, [세우기()], '', k, '수리').파트별.세우기.조각별[0].결과, '판정불가');
  });
});
