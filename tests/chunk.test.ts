// C·논술 급소 덩어리 — Q는 형식, 급소는 Q 앞 B+C (오종래 2026-10-13). 노드는 손으로 세운다 — 봉인 값은 쓰지 않는다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Color } from '../src/fq/types.ts';
import type { PathNode } from '../src/fq/v2/graph.ts';
import { essay_pivot_chunks } from '../src/thesis/chunk.ts';
import { evaluate_pivot, recognizeV2Analysis } from '../src/fq/index.ts';

/** 길 순서 = 배열 순서 */
const 길 = (...spec: [string, Color, string][]): { nodes: PathNode[] } => ({
  nodes: spec.map(([id, color, entity], index) => ({ id, surface: '·', switchId: `SW-${id}`, index, color, entity })),
});
const 요약 = (g: { nodes: PathNode[] }) => essay_pivot_chunks(g).map((d) => [d.B.id, d.C.map((n) => n.id), d.Q.map((n) => n.id), d.실체]);

describe('essay_pivot_chunks', () => {
  it('B 앞에 붙은 C와 B~Q 사이의 C가 덩어리다 — (1-1) 「긍정적 영향을 경제주체별로 설명하시오」', () => {
    const g = 길(['n1', 'B', '자유무역이 국가의 경제에 미치'], ['n2', 'C', '긍정적'], ['n3', 'B', '영향'], ['n4', 'C', '경제주체별로'], ['n6', 'Q', '설명하시오']);
    assert.deepEqual(요약(g), [['n3', ['n2', 'n4'], ['n6'], '긍정적 · 영향 · 경제주체별로']]);
  });

  it('C가 없으면 B만 — (1-2) 「대응조치는 무엇인지 설명하시오」, B 없는 구간의 Q는 앞 덩어리의 형식 표지', () => {
    const g = 길(['n1', 'B', '으로 인한 손실'], ['n2', 'B', 'B국이 시행한 대응조치'], ['n3', 'Q', '무엇'], ['n4', 'Q', '설명하시오']);
    assert.deepEqual(요약(g), [['n2', [], ['n3', 'n4'], 'B국이 시행한 대응조치']]);
  });

  it('Q마다 덩어리 — (2-1) 「구조적 약점을 제시하고, 이유를 설명하시오」', () => {
    const g = 길(['n2', 'B', '국제무역 환경'], ['n4', 'C', '겪'], ['n5', 'B', '구조적 약점'], ['n6', 'Q', '제시하고'], ['n8', 'B', ', 국내 물가 상승의 이유'], ['n9', 'Q', '설명하시오']);
    assert.deepEqual(요약(g), [
      ['n5', ['n4'], ['n6'], '겪 · 구조적 약점'],
      ['n8', [], ['n9'], '국내 물가 상승의 이유'],
    ]);
  });

  it('「측면에서」 바로 앞 B는 관점 — 구간의 다른 B가 덩어리의 B (오종래 2026-10-13)', () => {
    const g = 길(['n0', 'B', 'B국이 시행한 대응조치'], ['n1', 'B', 'B국 기업'], ['n2', 'C', '측면에서'], ['n3', 'Q', '설명하시오']);
    g.nodes[2].surface = '측면에서';
    assert.deepEqual(요약(g), [['n0', ['n2'], ['n3'], 'B국이 시행한 대응조치 · 측면에서']]);
  });

  it('관점 앞 B밖에 없으면 그 B를 그대로 쓴다', () => {
    const g = 길(['n1', 'B', '기업'], ['n2', 'C', '측면에서'], ['n3', 'Q', '설명하시오']);
    g.nodes[1].surface = '측면에서';
    assert.deepEqual(요약(g).map((d) => d[0]), ['n1']);
  });

  it('소유격 수식 B(「의」 뒤가 P)는 덩어리의 B가 아니다 — 「각 조치가 B국 기업의 경쟁력과 …」 (오종래 2026-10-13)', () => {
    const g = 길(['n0', 'B', '각 조치'], ['n1', 'B', 'B국 기업'], ['n2', 'P', '경쟁력'], ['n3', 'Q', '작용하'], ['n4', 'Q', '설명하시오']);
    g.nodes[1].surface = '의';
    assert.deepEqual(요약(g).map((d) => d[0]), ['n0']);
  });

  it('간접의문 절의 주어가 덩어리의 B — 「그 조치가 … 목적을 이루는 데 기여하는지 설명하시오」 (오종래 2026-10-13)', () => {
    const g = 길(['n0', 'B', '그 조치'], ['n1', 'C', '경쟁력 강화라'], ['n2', 'B', '목적'], ['n3', 'Q', '이루는 데 기여하'], ['n4', 'Q', '설명하시오']);
    g.nodes[0].surface = '가';
    g.nodes[3].surface = '는지';
    assert.deepEqual(요약(g).map((d) => d[0]), ['n0']);
  });

  it('B 앞 C는 사이에 다른 색이 끼면 끊긴다', () => {
    const g = 길(['c1', 'C', '조건'], ['p', 'P', '무대'], ['b', 'B', '실체'], ['q', 'Q', '논하시오']);
    assert.deepEqual(요약(g), [['b', [], ['q'], '실체']]);
  });

  it('Q 앞에 B가 없으면 덩어리가 서지 않는다', () => {
    assert.deepEqual(요약(길(['p', 'P', '[가]'], ['c', 'C', '참고하여'], ['q', 'Q', '답하시오'])), []);
  });
});

// 인문논술 C-1a 서술 방향 제외 [오종래 2026-10-20 확정] — 서술형 B 규칙 확장. 급소는 서술 방향 앞 실체 명사 (숭실대 인문논술 다수결)
describe('서술 방향 제외 급소 덩어리 (C-1a · 2026-10-20)', () => {
  const t = '오늘날 민주주의 사회는 다수결 원칙을 일반적인 의사결정 방식으로 채택하고 있다. 그 이유를 아래에 제시된 두 가지 의사결정 형태를 논박하는 방식으로 설명하시오.';
  it('서술형 선택이면 급소 「그 이유」 · 덩어리도 「그 이유」 (「논박하는 방식으로」 ✕)', () => {
    const a = recognizeV2Analysis(t, { 서술형: true });
    assert.ok(a.pivot.ok);
    assert.equal(a.pivot.pivot.node.entity, '그 이유');
    assert.deepEqual(essay_pivot_chunks(a.graph, a.pivot).map((d) => d.실체), ['그 이유']);
  });
  it('선택이 없으면 예전대로 서술형태 급소', () => {
    const a = recognizeV2Analysis(t);
    assert.ok(a.pivot.ok);
    assert.equal(a.pivot.pivot.reason, '서술형태');
  });
});

// 「민주주의」 어절 예외 · 「그 이유」 평가 [오종래 2026-10-20 확정] (숭실대 인문논술 다수결)
describe('「민주주의」 어절 예외 · 지시 관형사 + 실체 명사 (2026-10-20)', () => {
  const t = '오늘날 민주주의 사회는 다수결 원칙을 일반적인 의사결정 방식으로 채택하고 있다. 그 이유를 아래에 제시된 두 가지 의사결정 형태를 논박하는 방식으로 설명하시오.';
  it('「민주주의」 안의 「의」는 기능표지가 아니다 — 「민주주」 조각이 서지 않는다', () => {
    const a = recognizeV2Analysis(t, { 서술형: true });
    assert.ok(!a.graph.nodes.some((n) => /민주주$/.test(n.entity.trim())));
    assert.ok(a.graph.nodes.some((n) => n.entity.includes('민주주의')));
  });
  it('「민주주의를」 — 붙은 조사는 그대로 건다', () => {
    const a = recognizeV2Analysis('민주주의를 설명하시오.');
    assert.deepEqual(a.graph.nodes.map((n) => `${n.color}:${n.entity}`), ['B:민주주의', 'Q:설명하시오']);
  });
  it('「그 이유」 급소는 지시어가 아니다 — 평가 통과', () => {
    const a = recognizeV2Analysis(t, { 서술형: true });
    const ev = evaluate_pivot(a.pivot, a.graph);
    assert.ok(ev.ok);
    assert.equal(ev.items[0].coherence.deictic, false);
    assert.equal(ev.items[0].verdict, '통과');
  });
});
