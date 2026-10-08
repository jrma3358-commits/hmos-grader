// 문항 평가 — 서술 정합성(설계 8~10)·대안(11~13) (오종래 2026-10-08, 서술형문항 3·4·5)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluate_pivot, type PathGraph, type PivotAnalysis } from '../src/fq/index.ts';
import type { PathNode } from '../src/fq/v2/graph.ts';
import type { Color } from '../src/fq/types.ts';

// 손으로 세운 그래프 — 표지는 봉인 값이 아니다. index는 question 안 표지 자리다
function graphOf(question: string, cells: [Color, string, string][]): PathGraph {
  let from = 0;
  const nodes: PathNode[] = cells.map(([color, entity, surface], i) => {
    const index = question.indexOf(surface, question.indexOf(entity, from) + entity.length);
    from = index + surface.length;
    return { id: `n${i}`, surface, switchId: 'T', index, color, entity };
  });
  return { question, nodes, edges: [], combination: [], undecided: [] };
}
const at = (g: PathGraph, id: string, reason: '최수렴 B' | 'Q 직전 B' | '서술형태' = 'Q 직전 B', keyword?: string): PivotAnalysis => {
  const node = g.nodes.find((n) => n.id === id)!;
  return { ok: true, pivot: { node, reason, keyword: keyword ?? node.entity.trim().replace(/^[\s,]+/, ''), convergence: 0, sameAsDeepest: false } };
};

describe('서술 정합성 — Q 연결 · P에만 있음 · 지시대상', () => {
  it('Q 직전 B는 Q 연결 ✅, 사이에 B가 끼면 ⚠️ (서술형태 급소 뒤 B)', () => {
    const g = graphOf('명제는 반례를 들고 그 이유를 설명하시오', [
      ['B', '명제', '는'],
      ['C', '반례를 들고', '반례를 들고'],
      ['B', '그 이유', '를'],
      ['Q', '설명하시오', '설명하시오'],
    ]);
    const ev = evaluate_pivot(at(g, 'n1', '서술형태', '반례'), g);
    assert.ok(ev.ok);
    assert.deepEqual(ev.items[0].coherence, { linked: false, passageOnly: false, deictic: false, ok: false });
  });

  it('keyword가 P 실체에만 있으면 P에만 있음', () => {
    const g = graphOf('곡선과 변곡점을 설명하시오', [
      ['P', '곡선', '과'],
      ['B', '변곡점', '을'],
      ['Q', '설명하시오', '설명하시오'],
    ]);
    const ev = evaluate_pivot(at(g, 'n1', 'Q 직전 B', '곡선'), g);
    assert.ok(ev.ok && ev.items[0].coherence.passageOnly);
  });

  it('keyword 첫 어절이 지시어면 지시대상 불명확 — 대안 불가로 막는다', () => {
    const g = graphOf('이름을 쓰고, 그 이유를 설명하시오', [
      ['B', '이름', '을'],
      ['Q', '쓰고', '쓰고'],
      ['B', ', 그 이유', '를'],
      ['Q', '설명하시오', '설명하시오'],
    ]);
    const ev = evaluate_pivot(at(g, 'n2'), g);
    assert.ok(ev.ok);
    assert.equal(ev.items[0].coherence.deictic, true);
    assert.equal(ev.items[0].blocked, '지시대상 불명확');
    assert.deepEqual(ev.items[0].alternatives, []);
  });
});

describe('실체·결론 — 통과 · 보완 권장 · 수정 필요', () => {
  const g = graphOf('명제는 반례를 들고 이름을 쓰고, 그 과정을 설명하시오', [
    ['B', '명제', '는'],
    ['C', '반례를 들고', '반례를 들고'],
    ['B', '이름', '을'],
    ['Q', '쓰고', '쓰고'],
    ['B', '그 과정', '을'],
    ['Q', '설명하시오', '설명하시오'],
  ]);
  const one = (a: PivotAnalysis) => {
    const ev = evaluate_pivot(a, g);
    assert.ok(ev.ok);
    return [ev.items[0].substance, ev.items[0].verdict];
  };

  it('실체✅+정합✅ → 통과', () => assert.deepEqual(one(at(g, 'n2')), [true, '통과']));
  it('실체✅+정합⚠️ → 보완 권장 (서술형태 급소 뒤 B)', () => assert.deepEqual(one(at(g, 'n1', '서술형태', '반례')), [true, '보완 권장']));
  it('형식어 keyword는 실체❌ → 수정 필요', () => assert.deepEqual(one(at(g, 'n4', 'Q 직전 B', '과정')), [false, '수정 필요']));
});

describe('대안 — 형식어 → 실체', () => {
  it('같은 Q 절 앞의 실체 B를 꺼내 「X의 값을 구하고, 그 과정을」', () => {
    const q = '물음에 답하시오.\na_2를 이용하여 a_3을 구하는 과정을 설명하시오.';
    const g = graphOf(q, [
      ['Q', '답하시오', '답하시오'],
      ['B', 'a_2', '를'],
      ['C', '이용하여', '이용하여'],
      ['B', 'a_3', '을'],
      ['B', '과정', '을'],
      ['Q', '설명하시오', '설명하시오'],
    ]);
    const ev = evaluate_pivot(at(g, 'n4'), g);
    assert.ok(ev.ok);
    assert.equal(ev.items[0].coherence.ok, true);
    assert.deepEqual(
      ev.items[0].alternatives.map((a) => [a.rule, a.from, a.to]),
      [['형식어→실체', 'a_3을 구하는 과정을', 'a_3의 값을 구하고, 그 과정을']],
    );
    assert.equal(ev.items[0].alternatives[0].question, '물음에 답하시오.\na_2를 이용하여 a_3의 값을 구하고, 그 과정을 설명하시오.');
  });

  it('형식어가 아니면 대안 없음 · 앞 Q를 넘어 실체를 찾지 않는다', () => {
    const g = graphOf('값을 구하고 과정을 설명하시오', [
      ['B', '값', '을'],
      ['Q', '구하고', '구하고'],
      ['B', '과정', '을'],
      ['Q', '설명하시오', '설명하시오'],
    ]);
    const ev = evaluate_pivot(at(g, 'n2'), g);
    assert.ok(ev.ok);
    assert.deepEqual(ev.items[0].alternatives, []);
    const ev2 = evaluate_pivot(at(g, 'n0'), g);
    assert.ok(ev2.ok);
    assert.deepEqual(ev2.items[0].alternatives, []);
  });

  it('꺼낸 실체에 수식 기호(등호·부등호)가 있으면 대안 불가', () => {
    const g = graphOf('a_n과 a_{n+1}=2a_n+1이 성립함을 설명하시오', [
      ['P', 'a_n', '과'],
      ['B', 'a_{n+1}=2a_n+1', '이'],
      ['B', '성립함', '을'],
      ['Q', '설명하시오', '설명하시오'],
    ]);
    const ev = evaluate_pivot(at(g, 'n2'), g);
    assert.ok(ev.ok);
    assert.equal(ev.items[0].blocked, '실체에 수식 기호');
    assert.deepEqual(ev.items[0].alternatives, []);
  });

  it('급소 플래그면 평가하지 않는다', () => {
    const g = graphOf('끝', []);
    assert.deepEqual(evaluate_pivot({ ok: false, flag: 'NO_B', candidates: [], message: '' }, g), { ok: false, flag: 'NO_B' });
  });
});
