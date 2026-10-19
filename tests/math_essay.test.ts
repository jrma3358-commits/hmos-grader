// 수리논술 C-2 인식 규칙 [오종래 2026-10-19 확정] — 제약 C · 「각각」 조각 조합 · 이어달리기 · 제약 연결
// 표본: 부산대 수리논술 문항2 (2026-10-19 검증)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { constraint_links, math_constraints, piece_structure, relay_constraint } from '../src/thesis/math_essay.ts';

const 공통발문 = '[문항 2] 다음 제시문을 이용하여 아래 논제의 풀이 과정과 답을 논리적으로 서술하시오.\n구간 [0, 2π]에서 정의된 연속함수 f(x)가 구간 (0, 2π)에서 미분가능하고 다음 조건을 만족시킨다.';
const 제시문 = [
  { id: 'I', 텍스트: '함수 f(x)가 실수 a에 대하여 다음 세 조건을 모두 만족시킬 때, 함수 f(x)는 x=a에서 연속이라고 한다.' },
  { id: 'II', 텍스트: "함수 f(x)가 어떤 열린구간에서 미분가능할 때, f'(x)>0이면 증가한다." },
  { id: '가', 텍스트: 'f(0)=2, f(2π)=1' },
  { id: '나', 텍스트: "1≤k≤8인 각각의 정수 k에 대하여\n(i) f'(x)=0 (k-1)/4π < x < k/4π\n(ii) f'(x)=sin2x (k-1)/4π < x < k/4π 중 하나만 성립한다." },
];

describe('수리논술 C-2 — 제약 C (규칙 2·3)', () => {
  it('공통 발문 첫 줄(발문)을 뺀 설정 → 제시문 [I][II] → 조건 (가)(나) 순서로 모두 C', () => {
    const c = math_constraints(공통발문, 제시문);
    assert.deepEqual(c.map((x) => [x.종류, x.출처]), [['설정', '설정'], ['제시문', 'I'], ['제시문', 'II'], ['조건', '가'], ['조건', '나']]);
    assert.ok(c.every((x) => x.색 === 'C'));
    assert.match(c[0].실체, /^구간 \[0, 2π\]에서 정의된 연속함수 f\(x\)/);
  });

  it('자음 기호 (ㄱ)(ㄴ)은 제시문 C, 한글 (가)는 조건 C [가톨릭대 2026-10-19]', () => {
    const c = math_constraints('문항·2 다음 제시문을 읽고 답하시오.', [{ id: 'ㄱ', 텍스트: '다항함수 f(x)에 대하여 g(x)는 다음과 같다.' }, { id: '가', 텍스트: 'f(0)=1' }]);
    assert.deepEqual(c.map((x) => [x.종류, x.출처]), [['제시문', 'ㄱ'], ['조건', '가']]);
  });

  it('발문 한 줄뿐이면 설정 C는 없다', () => {
    assert.equal(math_constraints('[문항 2] 다음 물음에 답하시오.', []).length, 0);
  });
});

describe('「각각」 조각 조합 (규칙 5)', () => {
  it('k마다 (i)·(ii) 중 하나씩 — 조각을 조합해 f(x) 완성', () => {
    const g = piece_structure(제시문[3].텍스트);
    assert.deepEqual(g, { 구조: '조각조합', 변수: 'k', 범위: '1≤k≤8', 조각: ["f'(x)=0 (k-1)/4π < x < k/4π", "f'(x)=sin2x (k-1)/4π < x < k/4π"], 완성: 'f(x)' });
  });

  it('「각각」·「중 하나」·(i)(ii) 가 다 있어야 — 아니면 null', () => {
    assert.equal(piece_structure('f(0)=2, f(2π)=1'), null);
    assert.equal(piece_structure('각각의 k에 대하여 (i) a (ii) b'), null);
  });

  it('조건 (나)의 제약 C에 구조가 붙는다', () => {
    assert.equal(math_constraints(공통발문, 제시문).find((x) => x.출처 === '나')?.구조?.완성, 'f(x)');
  });
});

describe('이어달리기 · 제약 연결 (규칙 4)', () => {
  it('앞 소문항 급소 B → 이 소문항 제약 C (이어받기)', () => {
    assert.deepEqual(relay_constraint('2-1', ['함수 f(x)']), [{ 색: 'C', 종류: '이어받기', 출처: '2-1', 실체: '함수 f(x)', 텍스트: '(2-1) 결과 「함수 f(x)」' }]);
  });

  it('노드에 제약의 함수 꼴이 나오면 얹힌다 — (2-2) f(x)≥f(t) ← (2-1) 결과 f(x)', () => {
    const 제약 = [...math_constraints(공통발문, 제시문), ...relay_constraint('2-1', ['함수 f(x)'])];
    const l = constraint_links(['0≤t≤2π', 'f(x)≥f(t)', '함수 g(t)'], 제약);
    assert.ok(l.some((x) => x.종류 === '이어받기' && x.말 === 'f(x)'));
  });

  it('(2-3) h(t)=g(t)sint ← (2-2) 결과 g(t)', () => {
    const l = constraint_links(['구간 [0, 2π]', '함수 h(t)=g(t)sint', '∫₀²π h(t)dt의 값'], relay_constraint('2-2', ['함수 g(t)']));
    assert.deepEqual(l, [{ 출처: '2-2', 종류: '이어받기', 말: 'g(t)' }]);
  });

  it('제약 함수가 노드에 없으면 얹히지 않는다', () => {
    assert.deepEqual(constraint_links(['자유무역'], relay_constraint('1-1', ['함수 g(t)'])), []);
  });
});
