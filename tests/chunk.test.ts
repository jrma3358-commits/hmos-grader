// C·논술 급소 덩어리 — Q는 형식, 급소는 Q 앞 B+C (오종래 2026-10-13). 노드는 손으로 세운다 — 봉인 값은 쓰지 않는다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Color } from '../src/fq/types.ts';
import type { PathNode } from '../src/fq/v2/graph.ts';
import { essay_pivot_chunks } from '../src/thesis/chunk.ts';

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

  it('B 앞 C는 사이에 다른 색이 끼면 끊긴다', () => {
    const g = 길(['c1', 'C', '조건'], ['p', 'P', '무대'], ['b', 'B', '실체'], ['q', 'Q', '논하시오']);
    assert.deepEqual(요약(g), [['b', [], ['q'], '실체']]);
  });

  it('Q 앞에 B가 없으면 덩어리가 서지 않는다', () => {
    assert.deepEqual(요약(길(['p', 'P', '[가]'], ['c', 'C', '참고하여'], ['q', 'Q', '답하시오'])), []);
  });
});
