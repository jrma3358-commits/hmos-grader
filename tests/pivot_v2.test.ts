// 급소(K) = 최수렴 B — 구현명세 §2-4를 기준으로 한 테스트.
// 기대값은 엔진 출력이 아니라 **명세**에서 온다. 봉인 값은 쓰지 않는다(그래프를 손으로 세운다).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, convergenceOf, deepest_node, find_pivot, PivotError } from '../src/fq/index.ts';
import type { PathEdge, PathGraph, PathNode } from '../src/fq/v2/graph.ts';
import type { Color } from '../src/fq/types.ts';

let seq = 0;
const node = (id: string, color: Color | null, entity = id): PathNode => ({
  id,
  surface: '·',
  switchId: `SW-${id}`,
  index: seq++,
  color,
  entity,
});
const edge = (from: string, to: string, kind: PathEdge['kind'] = '연결어'): PathEdge => ({
  from,
  to,
  surface: kind === 'adjacent' ? null : '·',
  kind,
  index: seq++,
});
const graph = (nodes: PathNode[], edges: PathEdge[]): PathGraph => ({
  question: '(손으로 세운 그래프)',
  nodes,
  edges,
  combination: [...new Set(nodes.map((n) => n.color).filter((c): c is Color => !!c))],
  undecided: [],
});

describe('급소 = 간선이 가장 많이 수렴하는 B (구현명세 §2-4)', () => {
  it('수렴이 가장 많은 B가 급소다', () => {
    // B1 ← C1, B1 ← C2  (B1으로 둘이 수렴) / B2 ← C3 (하나)
    const g = graph(
      [node('B1', 'B'), node('B2', 'B'), node('C1', 'C'), node('C2', 'C'), node('C3', 'C')],
      [edge('C1', 'B1'), edge('C2', 'B1'), edge('C3', 'B2')],
    );
    const pivot = find_pivot(g);
    assert.equal(pivot.node.id, 'B1');
    assert.equal(pivot.reason, '최수렴 B');
    assert.equal(pivot.convergence, 2);
  });

  it('★ 최심점 ≠ 급소 — 가장 깊은 노드가 급소를 정하지 않는다', () => {
    // 경로의 마지막(최심점)은 B2지만, 수렴은 앞쪽 B1에 몰려 있다
    const g = graph(
      [node('B1', 'B'), node('C1', 'C'), node('C2', 'C'), node('B2', 'B')],
      [edge('C1', 'B1'), edge('C2', 'B1'), edge('B1', 'B2')],
    );
    assert.equal(deepest_node(g)?.id, 'B2', '최심점은 마지막 노드');
    const pivot = find_pivot(g);
    assert.equal(pivot.node.id, 'B1', '급소는 최심점이 아니라 최수렴 B');
    assert.equal(pivot.sameAsDeepest, false);
  });

  it('급소는 B에서만 고른다 — C·Q로 수렴이 몰려도 옮겨가지 않는다', () => {
    const g = graph(
      [node('B1', 'B'), node('C1', 'C'), node('Q1', 'Q'), node('P1', 'P'), node('D1', 'D')],
      [edge('B1', 'C1'), edge('P1', 'C1'), edge('D1', 'C1'), edge('C1', 'Q1'), edge('P1', 'B1')],
    );
    assert.equal(convergenceOf(g, g.nodes[1]!), 3, 'C1이 수렴은 가장 많다');
    assert.equal(find_pivot(g).node.id, 'B1', '그래도 급소는 B');
  });

  it('둘로 수렴하면 문제 설계 오류로 플래그한다', () => {
    const g = graph(
      [node('B1', 'B'), node('B2', 'B'), node('C1', 'C'), node('C2', 'C')],
      [edge('C1', 'B1'), edge('C2', 'B2')],
    );
    const r = analyze_pivot(g);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.flag, 'MULTIPLE_CONVERGENCE');
    assert.deepEqual(r.ok === false && r.candidates.map((c) => c.id), ['B1', 'B2']);
    assert.throws(() => find_pivot(g), (e: unknown) => e instanceof PivotError && e.flag === 'MULTIPLE_CONVERGENCE');
  });

  it('B가 없으면 추측하지 않는다 — NO_B 플래그 (Q→B 추출은 §2-3, 아직 안 섬)', () => {
    const g = graph([node('C1', 'C'), node('Q1', 'Q')], [edge('C1', 'Q1')]);
    const r = analyze_pivot(g);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.flag, 'NO_B');
  });

  it('인접(표지 없는 이음)은 수렴으로 세지 않는다 — 관계 간선만', () => {
    const g = graph(
      [node('B1', 'B'), node('B2', 'B')],
      [edge('B1', 'B2', 'adjacent'), edge('B1', 'B2', 'adjacent')],
    );
    assert.equal(convergenceOf(g, g.nodes[1]!), 0);
    // 둘 다 0 → 동점 → 설계 오류 플래그
    assert.equal(analyze_pivot(g).ok, false);
  });

  it('수렴 무게는 봉인 파일이 덮어쓸 수 있다 (규칙은 구조, 값은 봉인)', () => {
    const g = graph(
      [node('B1', 'B'), node('B2', 'B'), node('C1', 'C')],
      [edge('C1', 'B1'), edge('B1', 'B2', 'adjacent'), edge('C1', 'B2', 'adjacent')],
    );
    assert.equal(find_pivot(g).node.id, 'B1', '기본값: 인접 0 → B1(관계 간선 1개)');

    const table = {
      apply: { longestMatchFirst: true, precedence: [], convergenceWeights: { adjacent: 5 } },
    } as never;
    assert.equal(find_pivot(g, table).node.id, 'B2', '인접에 무게를 주면 B2(인접 2개 = 10)');
  });
});
