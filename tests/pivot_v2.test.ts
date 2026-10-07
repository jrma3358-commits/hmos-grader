// 급소(K) = 최수렴 B — 구현명세 §2-4를 기준으로 한 테스트.
// 기대값은 엔진 출력이 아니라 **명세**에서 온다. 봉인 값은 쓰지 않는다(그래프를 손으로 세운다).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, build_path_graph, convergenceOf, deepest_node, find_pivot, PivotError, split_units } from '../src/fq/index.ts';
import { markerRegex } from '../src/fq/v2/graph.ts';
import type { SealedSwitch, SealedTable } from '../src/fq/sealed/schema.ts';
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

describe('Q→B 추출 — 판단기준은 Q에 접힌 B다 (구현명세 §2-3, 오종래 2026-09-30)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 판단기준 스위치 = SJ (원래 색 C)
  const sw = (id: string, marker: string, color: Color) =>
    ({ id, kind: '조사·어미', markers: [marker], intent: '', color }) as SealedSwitch;
  const table = (foldToB?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', '@B', 'B'), sw('SJ', '@J', 'C'), sw('SQ', '@Q', 'Q')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], foldToB },
    pending: [],
  });
  // 그림 @B  기준 @J  가 @B  나 @B  고르시오 @Q
  const q = '그림@B 기준@J 가@B 나@B 고르시오@Q';

  it('판단기준 표지가 없으면 접지 않는다 — 강한 C도 없으면 Q 직전 B가 급소 (오종래 2026-10-02)', () => {
    const g = build_path_graph(q, table());
    assert.equal(g.nodes[1].color, 'C');
    assert.equal(g.nodes[1].foldedFrom, undefined);
    const r = analyze_pivot(g);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.pivot.node.entity, '나');
      assert.equal(r.pivot.reason, 'Q 직전 B');
    }
  });

  it('(가) 판단기준 노드는 B로 접히고 원래 색을 남긴다', () => {
    const g = build_path_graph(q, table(['SJ']));
    assert.equal(g.nodes[1].color, 'B');
    assert.equal(g.nodes[1].foldedFrom, 'C');
    assert.ok(g.combination.includes('B'));
  });

  it('조합은 접기 전 색으로 센다 — 접힌 판단기준의 C가 조합에 남는다 (오종래 2026-10-01)', () => {
    const g = build_path_graph('기준@J 끝@Q', table(['SJ']));
    assert.equal(g.nodes[0].color, 'B');
    assert.deepEqual(g.combination, ['C', 'Q']);
  });

  it('(나) 뒤의 노드(분기 결과·Q)가 모두 판단기준으로 수렴 → 급소', () => {
    const g = build_path_graph(q, table(['SJ']));
    const 접힘 = g.edges.filter((e) => e.kind === '접힘');
    assert.deepEqual(
      접힘.map((e) => [e.from, e.to]),
      [['n2', 'n1'], ['n3', 'n1'], ['n4', 'n1']],
    );
    const p = find_pivot(g);
    assert.equal(p.node.id, 'n1');
    assert.equal(p.node.entity, '기준');
    assert.equal(p.convergence, 3);
  });

  describe('재색칠 간선 — 화살표가 가리키는 노드는 C, 이미 B면 그대로 (오종래 2026-09-30)', () => {
    // 가짜 화살표 간선 스위치 SA(@>, 색 C). 판단기준 SJ는 여기서 원래 색 P로 둔다
    const tbl = (recolorTargets?: string[], foldToB?: string[]): SealedTable => ({
      ...table(foldToB),
      switches: [
        sw('SB', '@B', 'B'),
        sw('SD', '@D', 'D'),
        sw('SJ', '@J', 'P'),
        sw('SQ', '@Q', 'Q'),
        { id: 'SA', kind: '연결어', markers: ['@>'], intent: '', color: 'C' } as SealedSwitch,
      ],
      apply: { longestMatchFirst: true, precedence: [], foldToB, recolorTargets },
    });
    const q2 = '가@B @> 나@D @> 다@B 끝@Q';
    const byEntity = (g: PathGraph, e: string) => g.nodes.find((n) => n.entity === e)!;

    it('지정이 없으면 칠하지 않는다', () => {
      const g = build_path_graph(q2, tbl());
      assert.equal(byEntity(g, '나').color, 'D');
      assert.equal(byEntity(g, '나').recoloredFrom, undefined);
    });

    it('화살표가 가리키는 노드는 C로, 원래 색을 남긴다', () => {
      const g = build_path_graph(q2, tbl(['SA']));
      assert.equal(byEntity(g, '나').color, 'C');
      assert.equal(byEntity(g, '나').recoloredFrom, 'D');
    });

    it('이미 B인 노드는 화살표가 가리켜도 건드리지 않는다', () => {
      const g = build_path_graph(q2, tbl(['SA']));
      assert.equal(byEntity(g, '다').color, 'B');
      assert.equal(byEntity(g, '다').recoloredFrom, undefined);
    });

    it('화살표가 가리키지 않는 노드는 그대로', () => {
      const g = build_path_graph(q2, tbl(['SA']));
      assert.equal(byEntity(g, '가').color, 'B');
      assert.equal(byEntity(g, '끝').color, 'Q');
    });

    it('판단기준은 먼저 C로 칠해진 뒤 B로 접힌다', () => {
      const g = build_path_graph('그림@B @> 기준@J 가@B 끝@Q', tbl(['SA'], ['SJ']));
      const k = byEntity(g, '기준');
      assert.equal(k.recoloredFrom, 'P');
      assert.equal(k.foldedFrom, 'C');
      assert.equal(k.color, 'B');
      assert.equal(find_pivot(g).node.id, k.id);
    });
  });

  it('빈 노드 무시 — 어휘형 표지 바로 뒤, 끌고 나올 실체가 없는 표지는 노드가 되지 않는다 (오종래 2026-09-30)', () => {
    const t = table();
    t.switches.push({ id: 'SL', kind: '조사·어미', markers: ['#L'], lexical: true, intent: '', color: 'B' } as SealedSwitch);
    const g = build_path_graph('#L@J 나@B', t);
    assert.deepEqual(
      g.nodes.map((n) => n.entity),
      ['#L', '나'],
    );
    assert.equal(g.nodes.some((n) => n.entity === ''), false);
  });

  describe('어절 끝 조건 — 조사·어미 표지는 어절 끝에서만 (오종래 2026-09-30)', () => {
    const tbl = (endOfWord?: boolean) => {
      const t = table();
      t.apply.endOfWord = endOfWord;
      t.switches.push({ id: 'SL', kind: '조사·어미', markers: ['#L'], lexical: true, intent: '', color: 'B' } as SealedSwitch);
      return t;
    };
    const ents = (q: string, e?: boolean) => build_path_graph(q, tbl(e)).nodes.map((n) => n.entity);

    it('꺼져 있으면 지금처럼 어절 안에서도 건다', () => {
      assert.deepEqual(ents('물@B질 책@B 끝@Q'), ['물', '질 책', '끝']);
    });

    it('뒤가 글자면 걸지 않는다 — 어절 안', () => {
      assert.deepEqual(ents('물@B질 책@B 끝@Q', true), ['물@B질 책', '끝']);
    });

    it('뒤가 여는 괄호여도 걸지 않는다', () => {
      assert.deepEqual(ents('물@B(x) 책@B 끝@Q', true), ['물@B(x) 책', '끝']);
    });

    it('뒤가 공백·문장부호·끝이면 건다', () => {
      assert.deepEqual(ents('책@B, 끝@Q', true), ['책', ', 끝']);
      assert.deepEqual(ents('끝@Q', true), ['끝']);
    });

    it('어휘형 표지는 이 조건을 받지 않는다', () => {
      assert.deepEqual(ents('#L가 끝@Q', true), ['#L', '가 끝']);
    });

    describe('체언 뒤에서만 — 앞 음절이 용언 어간(verbStems)이면 스킵 (오종래 2026-09-30, 2026-10-01 개정)', () => {
      // 가짜 표지 '뷁'(B)을 체언 뒤 전용으로 지정, 가짜 용언 어간 '핳'
      const t = (on: boolean) => {
        const x = tbl(true);
        x.switches.push(sw('SN', '뷁', 'B'));
        x.apply.afterNounOnly = on ? ['SN'] : undefined;
        x.apply.verbStems = ['핳'];
        return x;
      };
      const ents2 = (q: string, on: boolean) => build_path_graph(q, t(on)).nodes.map((n) => n.entity);

      it('지정이 없으면 어디서나 건다', () => {
        assert.deepEqual(ents2('회전핳뷁 끝@Q', false), ['회전핳', '끝']);
      });

      it('앞 음절이 용언 어간이면 스킵', () => {
        assert.deepEqual(ents2('회전핳뷁 끝@Q', true), ['회전핳뷁 끝']);
      });

      it('받침 없는 체언 뒤에서도 건다 — 「철수는」', () => {
        assert.deepEqual(ents2('철수뷁 끝@Q', true), ['철수', '끝']);
      });

      it('앞 음절에 받침이 있으면 건다', () => {
        assert.deepEqual(ents2('책뷁 끝@Q', true), ['책', '끝']);
      });

      it('앞이 한글이 아니면 체언으로 보고 건다', () => {
        assert.deepEqual(ents2('x)뷁 끝@Q', true), ['x)', '끝']);
      });
    });

    describe('조사 연쇄 — chainHeads 표지 바로 뒤가 등록된 조사·어미 표지면 어절 끝 (오종래 2026-09-30, 2026-10-01 개정)', () => {
      // 가짜 조사 두 개: qq(C) 다음에 zz(B)가 붙는 연쇄. 연쇄를 여는 것은 SX뿐
      const chain = () => {
        const t = tbl(true);
        t.switches.push(sw('SX', 'qq', 'C'), sw('SZ', 'zz', 'B'), sw('SP', 'pp', 'P'));
        t.apply.chainHeads = ['SX'];
        return t;
      };
      const nodes = (q: string) => build_path_graph(q, chain()).nodes.map((n) => [n.color, n.entity]);

      it('chainHeads가 아닌 표지는 뒤에 조사가 붙어도 어절 안 — 「사과를」의 「과」', () => {
        assert.deepEqual(nodes('사ppzz 끝@Q'), [
          ['B', '사pp'],
          ['Q', '끝'],
        ]);
      });
      it('연쇄 머리는 자기 표층형이 실체, 끌고 나온 실체는 끝 조사의 노드로 — 「것만을」 = C「만」·B「것」 (오종래 2026-10-01)', () => {
        assert.deepEqual(nodes('것qqzz 끝@Q'), [
          ['C', 'qq'],
          ['B', '것'],
          ['Q', '끝'],
        ]);
      });

      it('뒤가 등록되지 않은 글자면 여전히 어절 안', () => {
        assert.deepEqual(nodes('것qqy 끝@Q'), [['Q', '것qqy 끝']]);
      });
    });
  });

  it('앞에 있는 노드는 판단기준으로 수렴하지 않는다', () => {
    const g = build_path_graph(q, table(['SJ']));
    assert.equal(g.edges.some((e) => e.kind === '접힘' && e.from === 'n0'), false);
  });
});

describe('자리 규칙 — LS-22·LS-23, 「은/는」의 색은 자리가 정한다 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 주제 표지 = ST(@T, 기본 B), 목적격 = SO(@O, B)
  const sw = (id: string, marker: string, color: Color) =>
    ({ id, kind: '조사·어미', markers: [marker], intent: '', color }) as SealedSwitch;
  const table = (on = true): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('ST', '~@T', 'B'), sw('SO', '~@O', 'B'), sw('SB', '~@B', 'B'), sw('SC', '~@C', 'C'), sw('SQ', '~@Q', 'Q')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: {
      longestMatchFirst: true,
      precedence: [],
      contextRules: on
        ? [
            { id: 'LS-22', targets: ['ST'], when: 'beforeObject', objectMarkers: ['~@O', '~@C'], color: 'C' },
            { id: 'LS-23', targets: ['ST'], when: 'sentenceEnd', color: 'Q' },
          ]
        : undefined,
    },
    pending: [],
  });
  const topic = (q: string, on = true) => build_path_graph(q, table(on)).nodes.find((n) => n.switchId === 'ST')!;

  it('LS-22: 뒤에 목적격 표지 + B객체가 오면 C', () => {
    const t = topic('책@T 사과@O 먹@Q');
    assert.equal(t.color, 'C');
    assert.deepEqual(t.contextRule, { id: 'LS-22', from: 'B' });
  });

  it('LS-22: 다음 노드가 B여도 목적격 표지가 아니면 그대로 B', () => {
    assert.equal(topic('책@T 사과@B 끝@Q').color, 'B');
  });

  it('LS-22: 목적격 표지여도 다음 노드가 B가 아니면 그대로 B', () => {
    assert.equal(topic('책@T 사과@C 끝@Q').color, 'B');
  });

  it('LS-23: 문장 끝이면 Q', () => {
    const t = topic('사과@B 끝@T');
    assert.equal(t.color, 'Q');
    assert.deepEqual(t.contextRule, { id: 'LS-23', from: 'B' });
    assert.equal(topic('사과@B 끝@T  ').color, 'Q');
  });

  it('LS-23: 바로 «?» 앞이면 Q', () => {
    assert.equal(topic('사과@B 끝@T?').color, 'Q');
    assert.equal(topic('사과@B 끝@T ?').color, 'Q');
  });

  it('두 조건 모두 아니면 기본값 B, 규칙 흔적 없음', () => {
    const t = topic('책@T 끝@Q');
    assert.equal(t.color, 'B');
    assert.equal(t.contextRule, undefined);
  });

  it('규칙이 지정되지 않으면 어디서나 기본값', () => {
    assert.equal(topic('책@T 사과@O 먹@Q', false).color, 'B');
    assert.equal(topic('사과@B 끝@T?', false).color, 'B');
  });
});

describe('약속된 길 — 「→」는 D, 화살표 앞 글자는 B 노드 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 화살표 = SA(@>, 연결어, D)
  const sw = (id: string, marker: string, color: Color, kind: SealedSwitch['kind'] = '조사·어미') =>
    ({ id, kind, markers: [marker], intent: '', color }) as SealedSwitch;
  const table = (on = true): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', '~@B', 'B'), sw('SJ', '~@J', 'C'), sw('SQ', '~@Q', 'Q'), sw('SA', '@>', 'D', '연결어')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], definedPaths: on ? ['SA'] : undefined },
    pending: [],
  });
  const q = '물질@B 분류한 것이다. 메테인 암모니아 @> 기준@J 끝@Q';

  it('화살표 앞, 노드가 끌고 나오지 않은 글자(마지막 문장 끝 뒤부터)가 B 노드가 된다', () => {
    const g = build_path_graph(q, table());
    assert.deepEqual(
      g.nodes.map((n) => [n.color, n.entity]),
      [
        ['B', '물질'],
        ['B', '메테인 암모니아'],
        ['C', '기준'],
        ['Q', '끝'],
      ],
    );
  });

  it('화살표 간선은 그 B 노드에서 출발하고, 자기 색 D를 조합에 켠다', () => {
    const g = build_path_graph(q, table());
    const arrow = g.edges.find((e) => e.surface === '@>')!;
    assert.equal(g.nodes.find((n) => n.id === arrow.from)!.entity, '메테인 암모니아');
    assert.equal(arrow.color, 'D');
    assert.deepEqual(g.combination, ['B', 'D', 'C', 'Q']);
  });

  it('지정이 없으면 지금처럼 — 앞 글자는 노드가 되지 않고 간선 색은 조합에 없다', () => {
    const g = build_path_graph(q, table(false));
    assert.equal(g.nodes.some((n) => n.entity.includes('메테인')), false);
    assert.deepEqual(g.combination, ['B', 'C', 'Q']);
  });
});

describe('결과 묶기 — 조건 뒤 잇따른 B는 그 조건의 결과 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 조건 = SC(@C, C), 빈칸 = SX([x]·[y]·[z], 어휘형 B)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (foldResult?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SC', ['~@C'], 'C'), sw('SD', ['~@D'], 'D'), sw('SX', ['[x]', '[y]', '[z]', '[w]'], 'B', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], foldResult },
    pending: [],
  });
  // 조건1 @C [x] [y] 끝@D 조건2 @C [z] [w]
  const q = '조건1 @C, a = [x], b = [y] 이다 끝@D 조건2 @C, a = [z], b = [w]';

  it('지정한 조건 뒤 잇따른 B만 묶고, B 아닌 노드에서 묶음이 끝난다', () => {
    const g = build_path_graph(q, table(['SC']));
    assert.deepEqual(
      g.nodes.map((n) => [n.entity, n.resultOf]),
      [
        ['조건1', undefined],
        ['[x]', 'n0'],
        ['[y]', 'n0'],
        ['이다 끝', undefined],
        ['조건2', undefined],
        ['[z]', g.nodes[4].id],
        ['[w]', g.nodes[4].id],
      ],
    );
    assert.equal(g.edges.filter((e) => e.kind === '결과').length, 4);
  });

  it('결과가 묶인 조건 노드는 B로 접히고 원래 색을 남긴다 — 결과 노드 색은 그대로', () => {
    const g = build_path_graph(q, table(['SC']));
    assert.deepEqual(g.nodes.map((n) => n.color), ['B', 'B', 'B', 'D', 'B', 'B', 'B']);
    assert.deepEqual(g.nodes.map((n) => n.foldedFrom), ['C', undefined, undefined, undefined, 'C', undefined, undefined]);
    for (const e of g.edges.filter((e) => e.kind === '결과')) {
      assert.equal(g.nodes.find((n) => n.id === e.to)!.foldedFrom, 'C');
    }
  });

  it('조합은 접기 전 색으로 센다 — 접힌 조건의 C가 조합에 남는다', () => {
    const g = build_path_graph(q, table(['SC']));
    assert.deepEqual(g.combination, ['C', 'B', 'D']);
  });

  it('조합에서 D만 반복을 허용한다 — 나머지 색은 처음 한 번만 (오종래 2026-10-02)', () => {
    const g = build_path_graph('조건1 @C, a = [x] 첫째@D 둘째@D 조건2 @C, b = [y]', table());
    assert.deepEqual(g.combination, ['C', 'B', 'D', 'D']);
  });

  it('결과가 없는 조건은 접지 않는다', () => {
    const g = build_path_graph('조건 @C 끝@D', table(['SC']));
    assert.equal(g.nodes[0].color, 'C');
    assert.equal(g.nodes[0].foldedFrom, undefined);
  });

  it('조건 하나에 결과가 묶이면 그 조건이 급소 — 결과 수만큼 수렴', () => {
    const g = build_path_graph('조건1 @C, a = [x], b = [y] 이다', table(['SC']));
    const p = find_pivot(g);
    assert.equal(p.node.entity, '조건1');
    assert.equal(p.convergence, 2);
  });

  it('지정이 없으면 묶지 않는다', () => {
    const g = build_path_graph(q, table());
    assert.equal(g.nodes.some((n) => n.resultOf !== undefined), false);
    assert.equal(g.edges.some((e) => e.kind === '결과'), false);
  });
});

describe('강한 C — 바로 다음 B가 급소 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 강한 C = SS(@S, 어휘형 C), 대상 = SB(@B, B), 판단기준 = SF(@F, C)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (strongC?: string[], foldToB?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SS', ['@S'], 'C', true), sw('SB', ['~@B'], 'B'), sw('SF', ['~@F'], 'C'), sw('SQ', ['~@Q'], 'Q')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], strongC, foldToB },
    pending: [],
  });

  it('강한 C는 C 그대로, 바로 다음 B에 연결을 적는다', () => {
    const g = build_path_graph('기준 @F 앞 @B @S 구역 @B 고른 것 @Q', table(['SS']));
    const s = g.nodes.find((n) => n.switchId === 'SS')!;
    assert.equal(s.color, 'C');
    assert.deepEqual(g.nodes.filter((n) => n.anchoredBy).map((n) => [n.entity, n.anchoredBy]), [['구역', s.id]]);
  });

  it('연결된 B가 수렴도와 상관없이 급소다', () => {
    const g = build_path_graph('앞 @B 더 @B @S 구역 @B 뒤 @B', table(['SS']));
    const p = find_pivot(g);
    assert.equal(p.node.entity, '구역');
    assert.equal(p.reason, '강한 C 연결 B');
  });

  it('강한 C 뒤에 잇따른 C(판단 기준)는 건너뛰고, 그다음 B·Q가 급소 — 범위 → 판단 기준 → 급소', () => {
    const g = build_path_graph('앞 @B @S 기준 @F 고른 것 @Q', table(['SS']));
    assert.equal(g.nodes.find((n) => n.entity === '기준')!.color, 'C');
    assert.equal(g.nodes.find((n) => n.entity === '기준')!.anchoredBy, undefined);
    const p = find_pivot(g);
    assert.equal(p.node.entity, '고른 것');
    assert.equal(p.reason, '강한 C 연결 B');
  });

  it('판단 기준 C 뒤에 B·Q가 없으면 연결하지 않는다', () => {
    const g = build_path_graph('앞 @B @S 기준 @F', table(['SS']));
    assert.equal(g.nodes.some((n) => n.anchoredBy !== undefined), false);
  });

  it('다음 노드가 Q면 B로 접어 급소로 세운다 — 원래 색은 남고 조합은 Q를 센다', () => {
    const g = build_path_graph('앞 @B @S 고른 것 @Q', table(['SS']));
    const q = g.nodes.find((n) => n.entity === '고른 것')!;
    assert.equal(q.color, 'B');
    assert.equal(q.foldedFrom, 'Q');
    assert.equal(find_pivot(g).node.entity, '고른 것');
    assert.deepEqual(g.combination, ['B', 'C', 'Q']);
  });

  it('판단기준 우선 — 판단기준 노드가 있으면 강한 C는 걸지 않는다', () => {
    const g = build_path_graph('기준 @F 앞 @B @S 구역 @B 고른 것 @Q', table(['SS'], ['SF']));
    assert.equal(g.nodes.some((n) => n.anchoredBy !== undefined), false);
    const p = find_pivot(g);
    assert.equal(p.node.entity, '기준');
    assert.equal(p.reason, '최수렴 B');
  });

  it('연결된 B가 둘이면 문제 설계 오류로 플래그한다', () => {
    const r = analyze_pivot(build_path_graph('@S 가 @B @S 나 @B', table(['SS'])));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.flag, 'MULTIPLE_CONVERGENCE');
  });

  it('지정이 없으면 연결하지 않는다', () => {
    const g = build_path_graph('@S 구역 @B', table());
    assert.equal(g.nodes.some((n) => n.anchoredBy !== undefined), false);
  });
});

describe('단독 어절 스위치 — 낱말 안에서는 걸지 않는다 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 어휘형 = SW(「표」, P), 조사 = SJ(~는, B)
  const table = (standalone?: boolean): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [
      { id: 'SW', kind: '조사·어미', markers: ['표'], intent: '', color: 'P', lexical: true, standalone },
      { id: 'SJ', kind: '조사·어미', markers: ['~는'], intent: '', color: 'B' },
    ],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [] },
    pending: [],
  });
  const ps = (q: string, t: SealedTable) => build_path_graph(q, t).nodes.filter((n) => n.switchId === 'SW').length;

  it('독립 어절이면 건다', () => assert.equal(ps('아래 표 참조', table(true)), 1));
  it('뒤에 무엇이 붙어도 건다 — 「표는」·「표가」·「표를」 (뒤 조건 없음)', () => {
    assert.equal(ps('표는 가 표가 나 표를 다', table(true)), 3);
  });
  it('앞에 한글이 붙으면 걸지 않는다 — 「대표단」·「지표」', () => assert.equal(ps('대표단 지표', table(true)), 0));
  it('standalone이 없으면 어디서나 건다', () => assert.equal(ps('대표단 지표', table()), 2));
});

describe('서술 블록 — 보기 하나가 B 객체 하나 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 머리 = SH(#1. #2., B), 안쪽 표지 = SI(@I, C)
  const sw = (id: string, markers: string[], color: Color) =>
    ({ id, kind: '조사·어미', markers, intent: '', color }) as SealedSwitch;
  const table = (statementBlocks?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SH', ['#1.', '#2.'], 'B'), sw('SI', ['~@I'], 'C')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], statementBlocks },
    pending: [],
  });
  const q = '발문 @I\n#1. 가 @I 나는 다. #2. 라 @I 마\n끝 @I';

  it('머리 뒤 서술 전체가 노드 하나 — 다음 머리·문단 경계 앞까지, 안쪽 표지는 걸지 않는다', () => {
    const g = build_path_graph(q, table(['SH']));
    assert.deepEqual(
      g.nodes.map((n) => [n.color, n.entity]),
      [
        ['C', '발문'],
        ['B', '가 @I 나는 다.'],
        ['B', '라 @I 마'],
        ['C', '끝'],
      ],
    );
  });

  it('어절 머리가 아니면 블록을 열지 않는다', () => {
    const g = build_path_graph('가#1. 나 @I', table(['SH']));
    assert.equal(g.nodes.some((n) => n.switchId === 'SH' && n.entity.includes('나')), false);
  });

  it('지정이 없으면 안쪽 표지가 따로 걸린다', () => {
    const g = build_path_graph(q, table());
    assert.equal(g.nodes.filter((n) => n.switchId === 'SI').length, 4);
  });

  it('노드 색은 머리 스위치의 색 — 케이스별 상황 설정 머리(P)면 케이스 하나가 독립 P 하나 (2026-10-02)', () => {
    const t = table(['SH', 'SP']);
    t.switches.push(sw('SP', ['%'], 'P'));
    const g = build_path_graph('발문 @I\n머리 % 가 @I 나 % 다 @I 라', t);
    assert.deepEqual(
      g.nodes.filter((n) => n.switchId === 'SP').map((n) => [n.color, n.entity]),
      [
        ['P', '가 @I 나'],
        ['P', '다 @I 라'],
      ],
    );
  });

  it('P 머리 — 케이스 머리(P)로 시작하는 문단 바로 앞 문단 전체가 P 하나 (2026-10-02)', () => {
    const t = table(['SH', 'SP']);
    t.switches.push(sw('SP', ['%'], 'P'));
    const g = build_path_graph('발문 @I\n본 @I 문 @I 끝\n% 가 @I 나 % 다', t);
    assert.deepEqual(
      g.nodes.map((n) => [n.color, n.entity]),
      [
        ['C', '발문'],
        ['P', '본 @I 문 @I 끝'],
        ['P', '가 @I 나'],
        ['P', '다'],
      ],
    );
  });

  it('P 머리 — 케이스 머리가 문단 첫머리가 아니면 열지 않는다', () => {
    const t = table(['SH', 'SP']);
    t.switches.push(sw('SP', ['%'], 'P'));
    const g = build_path_graph('발문 @I\n본 @I 끝\n<조건> % 가 @I 나', t);
    assert.equal(g.nodes.filter((n) => n.switchId === 'SI').length, 2);
  });
});

describe('제시문 블록·빈칸 수렴 — 「(가)에 대한 설명으로 옳은 것은?」 (오종래 2026-10-02)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 빈칸 = SL(@L, 어휘형 B), Q = SQ(~@Q, Q), 안쪽 표지 = SI(~@I, B), 보기 머리 = SH(#1. #2., B)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, ...(lexical ? { lexical } : {}) }) as SealedSwitch;
  const table = (passageBlocks?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SL', ['@L'], 'B', true), sw('SQ', ['~@Q'], 'Q'), sw('SI', ['~@I'], 'B'), sw('SH', ['#1.', '#2.'], 'B')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], statementBlocks: ['SH'], passageBlocks },
    pending: [],
  });
  const q = '@L 설명 @Q\n가 @I 나 @L 다 @I 라\n#1. 마 @I 바 #2. 사 @I 아';

  it('빈칸 표지가 다시 나오는 문단 전체가 B 하나 — 안쪽 표지는 걸지 않는다', () => {
    const g = build_path_graph(q, table(['SL']));
    const p = g.nodes.find((n) => n.passageOf !== undefined)!;
    assert.equal(p.color, 'B');
    assert.equal(p.entity, '가 @I 나 @L 다 @I 라');
    assert.equal(g.nodes.filter((n) => n.switchId === 'SI').length, 0);
  });

  it('제시문과 보기가 발문의 빈칸으로 수렴한다 → 급소 = 빈칸 B', () => {
    const g = build_path_graph(q, table(['SL']));
    const r = analyze_pivot(g);
    assert.ok(r.ok);
    assert.equal(r.pivot.node.entity, '@L');
    assert.equal(r.pivot.convergence, 3); // 제시문 1 + 보기 2
  });

  it('발문(Q 문단)에 빈칸이 없으면 열지 않는다', () => {
    const g = build_path_graph('설명 @Q\n가 @I 나 @L 다', table(['SL']));
    assert.equal(g.nodes.some((n) => n.passageOf !== undefined), false);
  });

  it('지정이 없으면 열지 않는다', () => {
    const g = build_path_graph(q, table());
    assert.equal(g.edges.some((e) => e.kind === '빈칸'), false);
  });

  it('보기 수렴 — 발문의 B가 하나뿐이면 보기 B가 그 B로 수렴한다 (2026-10-02)', () => {
    const g = build_path_graph('@L 설명 @Q\n#1. 마 @I 바 #2. 사 @I 아', table());
    assert.equal(g.edges.filter((e) => e.kind === '보기').length, 2);
    const r = analyze_pivot(g);
    assert.ok(r.ok);
    assert.equal(r.pivot.node.entity, '@L');
    assert.equal(r.pivot.convergence, 2);
  });

  it('보기 수렴 — 보기 머리 글자로만 된 조합 선택지는 보내지 않는다', () => {
    const g = build_path_graph('@L 설명 @Q\n#1. 마 @I 바 #2. 사 @I 아\n#1. #1, #2 #2. #2', table());
    assert.equal(g.edges.filter((e) => e.kind === '보기').length, 2);
  });

  it('보기 수렴 — 발문의 B가 둘이면 걸지 않는다', () => {
    const g = build_path_graph('@L 가 @I 설명 @Q\n#1. 마 #2. 사', table());
    assert.equal(g.edges.some((e) => e.kind === '보기'), false);
  });

  it('보기 수렴 — 빈칸 수렴이 선 그래프에는 걸지 않는다', () => {
    const g = build_path_graph(q, table(['SL']));
    assert.equal(g.edges.some((e) => e.kind === '보기'), false);
  });
});

describe('앞말 포함 어휘형 — 앞말까지 B 하나 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 어휘형 = SW(@W 구역, B), 앞 표지 = SA(@A, B), 뒤 조사 = SO(@O, B)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (withPreceding?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SW', ['@W 구역'], 'B', true), sw('SA', ['~@A'], 'B'), sw('SO', ['~@O'], 'B')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], withPreceding },
    pending: [],
  });
  const q = '드론 @A 생물 30개체 이상 @W 구역 @O 비행';

  it('앞말과 표지가 B 하나 — 뒤 조사는 노드가 되지 않는다', () => {
    const g = build_path_graph(q, table(['SW']));
    assert.deepEqual(g.nodes.map((n) => n.entity), ['드론', '생물 30개체 이상 @W 구역']);
  });

  it('지정이 없으면 표지 자신만 실체 — 앞말은 버려진다', () => {
    const g = build_path_graph(q, table());
    assert.deepEqual(g.nodes.map((n) => n.entity), ['드론', '@W 구역']);
  });
});

describe('단위 분리 — 가정 표지마다 공통 발문 + 단위 하나씩 (오종래 2026-10-01)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 가정 = SC(@C, C), 빈칸 = SX(어휘형 B)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (splitUnits?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SC', ['~@C'], 'C'), sw('SD', ['~@D'], 'D'), sw('SX', ['[x]', '[y]', '[z]'], 'B', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], splitUnits },
    pending: [],
  });
  const q = '발문 정의@D\n(2) 조건1 @C, a = [x] 이다。 조건2 @C, a = [y], b = [z] 이다。';

  it('가정 표지가 든 문장마다 단위로 자르고, 공통 발문을 각 단위 앞에 붙인다', () => {
    assert.deepEqual(split_units(q, table(['SC'])), [
      '발문 정의@D\n(2) 조건1 @C, a = [x] 이다。',
      '발문 정의@D\n조건2 @C, a = [y], b = [z] 이다。',
    ]);
  });

  it('단위마다 독립 그래프 — 다른 단위의 빈칸은 들어오지 않는다', () => {
    const [u1, u2] = split_units(q, table(['SC']));
    const bs = (u: string) => build_path_graph(u, table(['SC'])).nodes.filter((n) => n.color === 'B').map((n) => n.entity);
    assert.deepEqual(bs(u1), ['[x]']);
    assert.deepEqual(bs(u2), ['[y]', '[z]']);
  });

  it('한 문장 안에서도 표지마다 — 앞 표지와 사이의 마지막 쉼표 뒤에서 새 단위, 문장 머리는 두 단위에 공통', () => {
    assert.deepEqual(split_units('발문\n(3) x は, 조건1 @C [x] 이고, 그리고, 조건2 @C [y] 이다。', table(['SC'])), [
      '발문\n(3) x は,\n조건1 @C [x] 이고, 그리고,',
      '발문\n(3) x は,\n조건2 @C [y] 이다。',
    ]);
  });

  it('문장 머리를 떼면 조건 노드의 실체에 끌려 들어가지 않는다', () => {
    const [u1] = split_units('발문\n(3) x は, 조건1 @C [x] 이고, 조건2 @C [y] 이다。', table(['SC']));
    assert.equal(build_path_graph(u1, table(['SC'])).nodes[0].entity, '조건1');
  });

  it('문장 머리에 쉼표가 없으면 떼지 않는다', () => {
    assert.deepEqual(split_units('발문\n조건1 @C [x] 이고, 조건2 @C [y] 이다。', table(['SC'])), [
      '발문\n조건1 @C [x] 이고,',
      '발문\n조건2 @C [y] 이다。',
    ]);
  });

  it('한 문장 안 두 표지 사이에 쉼표가 없으면 한 단위', () => {
    assert.deepEqual(split_units('발문\n조건1 @C [x] 조건2 @C [y] 이다。', table(['SC'])), []);
  });

  it('단위가 하나뿐이거나 지정이 없으면 자르지 않는다', () => {
    assert.deepEqual(split_units('발문\n조건1 @C, a = [x] 이다。', table(['SC'])), []);
    assert.deepEqual(split_units(q, table()), []);
  });
});

describe('수식 묶기 — 수학 어휘 표지 뒤 식 전체가 B 하나 (오종래 2026-10-02)', () => {
  // 수학 어휘 = SM(어휘형 B), 조사 = SO(~@O, B), 간선 = SE(→, 연결어)
  const sw = (id: string, kind: SealedSwitch['kind'], markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind, markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (mathExpressions?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [
      sw('SM', '조사·어미', ['직선', '△', '∫', 'lim'], 'B', true),
      sw('SO', '조사·어미', ['~@O'], 'B'),
      sw('SE', '연결어', ['→'], 'D'),
    ],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], mathExpressions },
    pending: [],
  });
  const bs = (q: string, ids?: string[]) => build_path_graph(q, table(ids)).nodes.map((n) => n.entity);

  it('표지 뒤 식을 첫 한글 앞까지 묶는다 — 끝 공백·쉼표는 뗀다', () => {
    assert.deepEqual(bs('직선 y = 2x + 1과 △ABC, 넓이 @O', ['SM']), ['직선 y = 2x + 1', '△ABC', '넓이']);
  });

  it('식 안의 표지는 따로 걸지 않는다', () => {
    const g = build_path_graph('lim_{x→0} f(x)/x 값 @O', table(['SM']));
    assert.deepEqual(g.nodes.map((n) => n.entity), ['lim_{x→0} f(x)/x', '값']);
    assert.equal(g.edges.filter((e) => e.surface === '→').length, 0);
  });

  it('문장 끝에서 멈춘다 — 소수점은 문장 끝이 아니다', () => {
    assert.deepEqual(bs('∫ 0.5x dx. 다음 @O', ['SM']), ['∫ 0.5x dx', '다음']);
  });

  it('영문 표지는 다른 낱말 안에서 걸지 않는다', () => {
    assert.deepEqual(bs('preliminary @O', ['SM']), ['preliminary']);
  });

  it('지정이 없으면 표지 자신만 실체', () => {
    assert.deepEqual(bs('직선 y = 2x + 1과 @O', []).slice(0, 1), ['직선']);
  });
});

describe('어절 예외 — 예외 낱말과 같은 어절 안에서는 조사·어미를 걸지 않는다 (오종래 2026-10-03)', () => {
  // Q = SQ(어휘형 「~구하고」), P = SP(~도), 간선 = SE(그리고, 연결어)
  const sw = (id: string, kind: SealedSwitch['kind'], markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind, markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (wordExceptions?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [
      sw('SQ', '조사·어미', ['~구하고'], 'Q', true),
      sw('SP', '조사·어미', ['~도'], 'P'),
      sw('SE', '연결어', ['그리고'], 'D'),
    ],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], wordExceptions },
    pending: [],
  });
  const nodes = (q: string, words?: string[]) =>
    build_path_graph(q, table(words)).nodes.map((n) => `${n.color}:${n.entity}`);
  const q = '그럼에도, 불구하고 수출도 그리고 값을 구하고';

  it('예외 낱말 어절 안의 표지는 걸지 않는다 — 앞뒤 문장 부호는 떼고 본다', () => {
    const g = build_path_graph(q, table(['불구하고', '그럼에도']));
    assert.deepEqual(
      g.nodes.map((n) => [n.color, n.index]),
      [
        ['P', q.indexOf('수출도') + 2],
        ['Q', q.lastIndexOf('구하고')],
      ],
    );
  });

  it('간선 표지는 그대로 건다', () => {
    const g = build_path_graph(q, table(['불구하고', '그럼에도']));
    assert.equal(g.edges.filter((e) => e.surface === '그리고').length, 1);
  });

  it('예외 낱말 + 조사 하나인 어절은 예외 낱말 부분만 거른다 — 붙은 조사는 건다 (오종래 2026-10-06)', () => {
    // 「불구하고도」 = 예외 낱말 「불구하고」 + 조사 「도」
    assert.deepEqual(nodes('불구하고도', ['불구하고']), ['P:불구하고']);
    assert.deepEqual(nodes('불구하고도'), ['Q:구하고']);
    // 뒤가 조사 하나가 아니면 거르지 않는다
    assert.ok(nodes('불구하고말고', ['불구하고']).includes('Q:구하고'));
  });

  it('어절 일부만 같으면 거르지 않는다 · 지정이 없으면 지금처럼 건다', () => {
    assert.ok(nodes(q, ['그럼']).includes('P:그럼에'));
    assert.ok(nodes(q).includes('Q:구하고') && nodes(q).filter((n) => n === 'Q:구하고').length === 2);
  });
});

describe('수식 뒤에서만 · 문장 종결 경계 (오종래 2026-10-04)', () => {
  // 수식 = SM(어휘형 「선분」, 수식 묶기), 주격 = SS(~이·~가, 수식 뒤에서만), B = SB(~의), 간선 = SE(그리고)
  const sw = (id: string, kind: SealedSwitch['kind'], markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind, markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (apply: Partial<SealedTable['apply']> = {}): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [
      sw('SM', '조사·어미', ['선분'], 'B', true),
      sw('SS', '조사·어미', ['~이', '~가'], 'C'),
      sw('SB', '조사·어미', ['~의'], 'B'),
      sw('SE', '연결어', ['그리고'], 'D'),
    ],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, mathExpressions: ['SM'], ...apply },
    pending: [],
  });
  const surfaces = (q: string, apply?: Partial<SealedTable['apply']>) => build_path_graph(q, table(apply)).nodes.map((n) => n.surface);

  it('afterMathOnly 스위치는 한글 없는 식 바로 뒤에서만 건다', () => {
    const q = '사과 이 선분 AB 이 길이가 크다';
    assert.deepEqual(surfaces(q), ['이', '선분 AB', '가']);
    // 수식 묶기 뒤 「이」는 끌 실체가 없어 노드가 서지 않는다 (식은 이미 수식 노드)
    assert.deepEqual(surfaces(q, { afterMathOnly: ['SS'] }), ['선분 AB']);
  });

  it('수식 묶기가 아닌 식 뒤의 주격도 건다 — 붙어 있든 한 칸 띄었든', () => {
    const entities = (q: string) => build_path_graph(q, table({ afterMathOnly: ['SS'] })).nodes.map((n) => n.entity);
    assert.deepEqual(entities('등차수열 {b_n}이 크다'), ['등차수열 {b_n}']);
    assert.deepEqual(entities('함수 g(x) (x > 0) 이 크다'), ['함수 g(x) (x > 0)']);
  });

  it('문장 종결 표지는 노드 없이 경계가 되어 실체·간선을 끊는다', () => {
    const q = '점 A의 그리고 4이다. 넓이의 값';
    const g = build_path_graph(q, table({ sentenceEnds: ['이다.'] }));
    assert.deepEqual(g.nodes.map((n) => n.entity), ['점 A', '넓이']);
    assert.equal(g.edges.filter((e) => e.kind === '연결어').length, 0); // 경계 앞에 걸어 둔 간선은 넘기지 않는다
    assert.equal(build_path_graph(q, table()).edges.filter((e) => e.kind === '연결어').length, 1);
  });

  it('종결 표지 안의 글자는 다른 표지로 걸지 않는다', () => {
    assert.deepEqual(surfaces('값은 4이다. 끝', { endOfWord: false, sentenceEnds: ['이다.'] }), []);
    assert.deepEqual(surfaces('값은 4이다. 끝', { endOfWord: false }), ['이']);
  });
});

describe('받침 자모 표지 — 자모 뒤에 음절이 오면 그 받침을 가진 음절 하나 (오종래 2026-10-03)', () => {
  it('「~ㄴ지」는 받침 ㄴ 음절 + 지, 「~ㄹ지」는 받침 ㄹ 음절 + 지', () => {
    const n = markerRegex('~ㄴ지');
    assert.equal('어떤지 쓰시오'.match(n)?.[0], '떤지');
    assert.equal('있는지'.match(n)?.[0], '는지');
    assert.equal('어떻지'.match(n), null);
    assert.equal('할지'.match(markerRegex('~ㄹ지'))?.[0], '할지');
  });

  it('뒤가 음절이 아닌 자모는 글자 그대로다 (보기 머리 「ㄱ.」)', () => {
    assert.equal('ㄱ. 서술'.match(markerRegex('ㄱ.'))?.[0], 'ㄱ.');
    assert.equal('가. 서술'.match(markerRegex('ㄱ.')), null);
  });

  it('받침이 될 수 없는 자모는 던진다', () => {
    assert.throws(() => markerRegex('~ㄸ지'));
  });
});

describe('서술형태 급소 — C-F 노드 안의 핵심어 (오종래 2026-10-05)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 서술형태 = SF(어휘형 「논박@M」 + 틀 「~@M」, 앞말 끌기 「~@V」), 대상 = SB(@B), 질문 = SQ(@Q)
  const sw = (id: string, markers: string[], color: Color, lexical?: string[]) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (formPivot?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SF', ['~@M', '논박@M', '~@V'], 'C', ['논박@M']), sw('SB', ['~@B'], 'B'), sw('SQ', ['~@Q'], 'Q'), sw('SP', ['~와'], 'P')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], formPivot },
    pending: [],
  });

  it('어휘형 C-F 노드면 틀을 떼고 남은 말이 핵심어 — Q 직전 B보다 먼저다', () => {
    const t = table(['SF']);
    const g = build_path_graph('형태 @B 논박@M 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.pivot.reason, '서술형태');
    assert.equal(r.pivot.node.switchId, 'SF');
    assert.equal(r.pivot.node.color, 'C');
    assert.equal(r.pivot.keyword, '논박');
  });

  it('앞말을 끄는 C-F 노드면 끌어온 앞말이 핵심어', () => {
    const t = table(['SF']);
    const g = build_path_graph('형태 @B 관점 @V 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok && r.pivot.keyword, '관점');
  });

  it('핵심어가 지시어면 앞 명사구가 핵심어 — 병렬 P(와)는 함께 묶는다', () => {
    const t = table(['SF']);
    const g = build_path_graph('갑와 을 @B 각각 @V 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok && r.pivot.keyword, '갑와 을');
  });

  it('서술방법 표지(「비판적으로」 등) C-F는 B가 있으면 B에 밀리고, B가 없을 때만 급소 (오종래 2026-10-07)', () => {
    const t: SealedTable = {
      ...table(['SF']),
      switches: [sw('SF', ['비판적으로', '논박@M'], 'C', ['비판적으로', '논박@M']), sw('SB', ['~@B'], 'B'), sw('SQ', ['~@Q'], 'Q')],
    };
    const withB = analyze_pivot(build_path_graph('형태 @B 비판적으로 설명 @Q', t), t);
    assert.ok(withB.ok && withB.pivot.node.color === 'B' && withB.pivot.node.entity === '형태', 'B가 있으면 B');
    const noB = analyze_pivot(build_path_graph('비판적으로 설명 @Q', t), t);
    assert.ok(noB.ok && noB.pivot.reason === '서술형태', 'B가 없으면 서술형태');
    const other = analyze_pivot(build_path_graph('형태 @B 논박@M 설명 @Q', t), t);
    assert.ok(other.ok && other.pivot.reason === '서술형태', '나머지 C-F는 그대로 B보다 먼저');
  });

  it('C-F 노드가 둘이면 문제 설계 오류로 플래그', () => {
    const t = table(['SF']);
    const g = build_path_graph('형태 @B 논박@M 관점 @V 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.flag, 'MULTIPLE_CONVERGENCE');
  });

  // 서술 형태 우선 (오종래 2026-10-06) — 입장·관점 표지(apply.formPerspective)는 테스트용 「~@V」
  const withPerspective = (perspective: string[]): SealedTable => {
    const t = table(['SF']);
    return { ...t, apply: { ...t.apply, formPerspective: perspective } };
  };

  it('C-F 노드가 둘이면 입장·관점 표지 노드를 빼고 서술 형태 표지가 급소다', () => {
    const t = withPerspective(['~@V']);
    const g = build_path_graph('형태 @B 관점 @V 논박@M 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.pivot.reason, '서술형태');
    assert.equal(r.pivot.keyword, '논박');
  });

  it('뒤로 미는 표지가 여럿이어도 모두 빼고 남은 하나가 급소 — 수단 표지가 참고·관점 표지보다 먼저', () => {
    // 테스트용: 수단 「논박@M」, 참고 「참고@R」, 관점 「~@V」
    const base = withPerspective(['~@V', '참고@R']);
    const t: SealedTable = {
      ...base,
      switches: base.switches.map((s) => (s.id === 'SF' ? { ...s, markers: [...s.markers, '참고@R'], lexical: [...(s.lexical as string[]), '참고@R'] } : s)),
    };
    const g = build_path_graph('형태 @B 관점 @V 논박@M 자료 @B 참고@R 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok && r.pivot.keyword, '논박');
  });

  // 복합 Q 분리 (오종래 2026-10-06) — 「~하고,」 Q로 절이 나뉘고 절마다 C-F가 하나씩이면 절마다 급소
  const withHago = (): SealedTable => {
    const t = table(['SF']);
    return { ...t, switches: t.switches.map((s) => (s.id === 'SQ' ? { ...s, markers: [...s.markers, '~하고'] } : s)) };
  };

  it('「~하고,」로 나뉜 절마다 C-F가 하나씩이면 절마다 급소 — pivot은 마지막 절', () => {
    const t = withHago();
    const g = build_path_graph('형태 @B 논박@M 설명하고, 내용 @B 관점 @V 제안 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.pivots?.map((p) => p.keyword), ['논박', '관점']);
    assert.ok(r.pivots?.every((p) => p.reason === '서술형태'));
    assert.equal(r.pivot.keyword, '관점');
  });

  it('「~나타내고,」「~고르고,」「~쓰고,」도 절을 나눈다', () => {
    for (const end of ['나타내고', '고르고', '쓰고']) {
      const base = table(['SF']);
      const t: SealedTable = { ...base, switches: base.switches.map((s) => (s.id === 'SQ' ? { ...s, markers: [...s.markers, `~${end}`] } : s)) };
      const g = build_path_graph(`형태 @B 논박@M 답 ${end}, 내용 @B 관점 @V 제안 @Q`, t);
      const r = analyze_pivot(g, t);
      assert.deepEqual(r.ok && r.pivots?.map((p) => p.keyword), ['논박', '관점'], end);
    }
  });

  it('「~하고」 뒤에 쉼표가 없으면 나누지 않는다 — 플래그 그대로', () => {
    const t = withHago();
    const g = build_path_graph('형태 @B 논박@M 설명하고 내용 @B 관점 @V 제안 @Q', t);
    assert.equal(analyze_pivot(g, t).ok, false);
  });

  it('한 절에 C-F가 둘이면 나누지 않는다 — 플래그 그대로', () => {
    const t = withHago();
    const g = build_path_graph('형태 @B 논박@M 관점 @V 설명하고, 내용 @B 제안 @Q', t);
    assert.equal(analyze_pivot(g, t).ok, false);
  });

  it('입장·관점 표지 노드만 둘이면 플래그 그대로', () => {
    const t = withPerspective(['~@V']);
    const g = build_path_graph('형태 @B 관점 @V 입장 @V 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(!r.ok && r.flag, 'MULTIPLE_CONVERGENCE');
  });

  it('입장·관점 표지 노드 하나뿐이면 그것이 급소 — 빼지 않는다', () => {
    const t = withPerspective(['~@V']);
    const g = build_path_graph('형태 @B 관점 @V 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok && r.pivot.keyword, '관점');
  });

  it('지정이 없으면 기존 규칙 그대로 — Q 직전 B', () => {
    const t = table();
    const g = build_path_graph('형태 @B 논박@M 설명 @Q', t);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok && r.pivot.reason, 'Q 직전 B');
    assert.equal(r.ok && r.pivot.keyword, '형태', 'B 급소의 실체값 — 서술형태 핵심어가 아니다');
  });
});

describe('급소 복수 — Q마다 Q 직전 B (오종래 2026-10-05)', () => {
  it('C→Q→C→Q 직렬 물음이면 두 Q 각각의 직전 B가 급소다 — pivot은 마지막 Q의 급소', () => {
    // 덧셈정리 C(이용하여) 등식 Q(보이고) 이 C(이용하여) 문항 Q(보이시오)
    const g = graph(
      [node('B1', 'B', '덧셈정리'), node('C1', 'C'), node('B2', 'B', '등식'), node('Q1', 'Q'), node('B3', 'B', '이'), node('C2', 'C'), node('B4', 'B', '문항'), node('Q2', 'Q')],
      [],
    );
    const r = analyze_pivot(g);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.pivots?.map((p) => p.node.id), ['B2', 'B4']);
    assert.equal(r.pivot.node.id, 'B4');
    assert.ok(r.pivots?.every((p) => p.reason === 'Q 직전 B'));
  });

  it('사이에 B가 없는 Q는 앞 Q와 한 물음이다 — 「몇 개인지 구하시오」', () => {
    const g = graph([node('B1', 'B'), node('Q1', 'Q'), node('B2', 'B'), node('Q2', 'Q'), node('Q3', 'Q')], []);
    const r = analyze_pivot(g);
    assert.deepEqual(r.ok && r.pivots?.map((p) => p.node.id), ['B1', 'B2']);
  });

  it('간접의문 Q(「~인지」)는 세지 않는다 — 직접 Q만 급소 복수', () => {
    const g = graph([node('B1', 'B'), { ...node('Q1', 'Q'), surface: '인지' }, node('B2', 'B'), { ...node('Q2', 'Q'), surface: '서술하시오' }], []);
    const r = analyze_pivot(g);
    assert.equal(r.ok && r.pivots, undefined);
    assert.equal(r.ok && r.pivot.node.id, 'B2');
  });

  it('직접 Q 사이의 간접의문 Q는 건너뛴다 — 「구하고 … 몇 개인지 구하시오」', () => {
    const g = graph([node('B1', 'B'), { ...node('Q1', 'Q'), surface: '구하고' }, node('B2', 'B'), { ...node('Q2', 'Q'), surface: '인지' }, { ...node('Q3', 'Q'), surface: '구하시오' }], []);
    const r = analyze_pivot(g);
    assert.deepEqual(r.ok && r.pivots?.map((p) => p.node.id), ['B1', 'B2']);
  });

  // 문장을 주고 노드 자리를 그 문장에서 찾는다 — 작성 지시·서술어 판정은 문장을 본다
  const at = (q: string, id: string, color: Color, surface: string, from = 0): PathNode => ({ ...node(id, color), surface, index: q.indexOf(surface, from) });
  const inText = (q: string, nodes: PathNode[]): PathGraph => ({ ...graph(nodes, []), question: q });

  it('「~고 있는」 서술어는 Q로 세지 않는다 — 윤리13 「설명하고 있는」', () => {
    const q = '글에서 설명하고 있는 의미 서술하시오';
    const g = inText(q, [at(q, 'B1', 'B', '글'), at(q, 'Q1', 'Q', '설명하고'), at(q, 'B2', 'B', '의미'), at(q, 'Q2', 'Q', '서술하시오')]);
    const r = analyze_pivot(g);
    assert.equal(r.ok && r.pivots, undefined);
    assert.equal(r.ok && r.pivot.node.id, 'B2');
  });

  it('공통 발문 「답하시오」는 Q로 세지 않는다 — 논서술형1', () => {
    const q = '내용 답하시오 구성 서술하시오';
    const g = inText(q, [at(q, 'B1', 'B', '내용'), at(q, 'Q1', 'Q', '답하시오'), at(q, 'B2', 'B', '구성'), at(q, 'Q2', 'Q', '서술하시오')]);
    assert.equal(analyze_pivot(g).ok && (analyze_pivot(g) as { pivots?: unknown }).pivots, undefined);
  });

  it('<작성 방법> 블록 안의 Q는 작성 지시라 세지 않는다 — 물리13 「서술하시오」 반복', () => {
    const q = '이유 서술하시오\n<작성 방법>\n윗글 서술하고 내용 서술하시오';
    const s2 = q.indexOf('서술하시오') + 1;
    const g = inText(q, [
      at(q, 'B1', 'B', '이유'), at(q, 'Q1', 'Q', '서술하시오'),
      at(q, 'B2', 'B', '윗글'), at(q, 'Q2', 'Q', '서술하고'),
      at(q, 'B3', 'B', '내용'), at(q, 'Q3', 'Q', '서술하시오', s2),
    ]);
    const r = analyze_pivot(g);
    assert.equal(r.ok && r.pivots, undefined);
  });

  it('발문 안에 섞인 「<작성 방법>에 따라」는 블록 머리가 아니다', () => {
    const q = '조건 <작성 방법>에 따라 구하고 넓이 서술하시오';
    const g = inText(q, [at(q, 'B1', 'B', '조건'), at(q, 'Q1', 'Q', '구하고'), at(q, 'B2', 'B', '넓이'), at(q, 'Q2', 'Q', '서술하시오')]);
    const r = analyze_pivot(g);
    assert.equal(r.ok && r.pivots?.length, 2);
  });

  it('Q가 하나면 pivots는 없다', () => {
    const g = graph([node('B1', 'B'), node('C1', 'C'), node('B2', 'B'), node('Q1', 'Q')], []);
    const r = analyze_pivot(g);
    assert.equal(r.ok && r.pivots, undefined);
    assert.equal(r.ok && r.pivot.node.id, 'B2');
  });
});

describe('작성 형식 블록 — 「풀이 과정과 답을」은 급소가 아니다 (오종래 2026-10-05)', () => {
  it('「풀이 과정」(과)+「답」이 Q 앞에 서면 그 앞 B가 급소다', () => {
    const g = graph([node('B1', 'B', '일반항 a_n'), { ...node('P1', 'P', '구하는 풀이 과정'), surface: '과' }, node('B2', 'B', '답'), node('Q1', 'Q')], []);
    const r = analyze_pivot(g);
    assert.equal(r.ok && r.pivot.node.id, 'B1');
  });

  it('「풀이 과정」 없이 홀로 선 「답」은 그대로 급소 후보다', () => {
    const g = graph([node('B1', 'B', '조건'), node('C1', 'C'), node('B2', 'B', '답'), node('Q1', 'Q')], []);
    assert.equal(find_pivot(g).node.id, 'B2');
  });
});

describe('참조 제시문 — 「다음 글」 뒤 문단을 P 하나로 (오종래 2026-10-05)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. 닻 = SR(어휘형 P @R), 대상 = SB(@B), 질문 = SQ(@Q)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (referencedPassages?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SR', ['@R'], 'P', true), sw('SB', ['~@B'], 'B'), sw('SQ', ['~@Q'], 'Q')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], referencedPassages },
    pending: [],
  });
  const q = '다음@R 의미@B 서술@Q\n가@B 나@B\n라@B\n<조건>\n다@B';

  it('발문 뒤 문단들이 <…> 머리 앞까지 P 하나 — 안의 표지는 걸지 않는다', () => {
    const g = build_path_graph(q, table(['SR']));
    const ps = g.nodes.filter((n) => n.color === 'P');
    assert.deepEqual(ps.map((n) => n.entity), ['가@B 나@B\n라@B']);
    assert.equal(g.nodes.some((n) => n.entity === '가' || n.entity === '나'), false);
    assert.ok(g.nodes.some((n) => n.entity === '다'), '<조건> 뒤는 그대로');
  });

  it('닻 표지는 노드가 되지 않는다 — 발문은 그대로', () => {
    const on = build_path_graph(q, table(['SR']));
    assert.deepEqual(on.nodes.filter((n) => n.index < q.indexOf('\n')).map((n) => [n.color, n.entity]), [['B', '다음@R 의미'], ['Q', '서술']]);
  });

  it('닻 표지가 한 줄 머리(「<보기>」)로 서면 그 줄을 건너뛰고 뒤를 묶는다', () => {
    const g = build_path_graph('@R는 의미@B 서술@Q\n@R\n가@B 나@B\n<조건>\n다@B', table(['SR']));
    assert.deepEqual(g.nodes.filter((n) => n.color === 'P').map((n) => n.entity), ['가@B 나@B']);
  });

  it('발문(Q 문단)이 아니면 묶지 않는다', () => {
    const g = build_path_graph('다음@R 의미@B\n가@B 나@B', table(['SR']));
    assert.equal(g.nodes.some((n) => n.color === 'P'), false);
  });
});

describe('상자 블록 — 빈 줄로 뗀 상자를 닻 없이 P 하나로 (오종래 2026-10-06)', () => {
  // 표지는 봉인 값이 아니라 테스트용 가짜 기호다. P = SR(@R), 대상 = SB(@B), 질문 = SQ(~@Q · ~@고)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (boxPassages?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SR', ['@R'], 'P', true), sw('SB', ['~@B'], 'B'), sw('SQ', ['~@Q', '~@고'], 'Q')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], boxPassages },
    pending: [],
  });

  it('발문 뒤 Q 없는 문단이 다음 물음 문단 앞까지 P 하나 — 닻 표지 없이', () => {
    const g = build_path_graph('의미@B 서술@Q\n가@B 나@B\n(1) 다@B 서술@Q', table(['SR']));
    assert.deepEqual(g.nodes.filter((n) => n.color === 'P').map((n) => n.entity), ['가@B 나@B']);
    assert.ok(g.nodes.some((n) => n.entity === '(1) 다'), '물음 문단은 그대로');
  });

  it('연결형 Q(「~고」)만 선 문단은 상자다 — 대화 속 「구하고」', () => {
    const g = build_path_graph('의미@B 서술@Q\n가@B 구하@고 나@B\n(1) 다@B 서술@Q', table(['SR']));
    assert.deepEqual(g.nodes.filter((n) => n.color === 'P').map((n) => n.entity), ['가@B 구하@고 나@B']);
  });

  it('줄머리 「▶」 상자(학생 주장 목록)는 묶지 않는다 — 각 주장이 독립 B', () => {
    const g = build_path_graph('의미@B 서술@Q\n▶ 가@B ▶ 나@B', table(['SR']));
    assert.equal(g.nodes.some((n) => n.color === 'P'), false);
    assert.equal(g.nodes.filter((n) => n.color === 'B').length, 3);
  });

  it('boxPassages가 없으면 묶지 않는다', () => {
    const g = build_path_graph('의미@B 서술@Q\n가@B 나@B', table());
    assert.equal(g.nodes.some((n) => n.color === 'P'), false);
  });
});

describe('B 급소의 실체값 — 이름이 아니라 B가 묻는 실체 (오종래 2026-10-05)', () => {
  const pick = (entity: string) => {
    const g = graph([node('B1', 'B', entity), node('Q1', 'Q')], []);
    const p = find_pivot(g);
    return { keyword: p.keyword, name: p.name };
  };

  it('「이름 + 식·기호」면 실체값은 식·기호, 이름은 따로', () => {
    assert.deepEqual(pick('일반항 a_n'), { keyword: 'a_n', name: '일반항' });
    assert.deepEqual(pick('점 C(0, -1)'), { keyword: 'C(0, -1)', name: '점' });
  });

  it('식·기호가 따로 없으면 실체 그대로, 이름 없음', () => {
    assert.deepEqual(pick('거리'), { keyword: '거리', name: undefined });
    assert.deepEqual(pick('X = 1일 확률'), { keyword: 'X = 1일 확률', name: undefined });
    assert.deepEqual(pick('a = 3, b = 5, c = 7'), { keyword: 'a = 3, b = 5, c = 7', name: undefined });
  });

  it('실체 머리의 쉼표·공백은 뗀다 — 이름에도 남기지 않는다 (오종래 2026-10-06)', () => {
    assert.deepEqual(pick(', k'), { keyword: 'k', name: undefined });
    assert.deepEqual(pick(', 양수 a'), { keyword: 'a', name: '양수' });
  });
});

describe('명사구 연결 — 「의」는 B 경계가 아니라 실체 확장 (오종래 2026-10-06)', () => {
  // 수식 = SM(어휘형 「선분」, 수식 묶기), B = SB(~의·~을·~를), 주제 = ST(~은·~는, 종결 자리면 Q), Q = SQ(어휘형 「구하시오」)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (nounChainMarkers?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SM', ['선분'], 'B', true), sw('SB', ['~의', '~을', '~를'], 'B'), sw('ST', ['~은', '~는'], 'B'), sw('SQ', ['구하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: {
      longestMatchFirst: true,
      precedence: [],
      endOfWord: true,
      mathExpressions: ['SM'],
      contextRules: [{ id: 'CR', targets: ['ST'], when: 'sentenceEnd', color: 'Q' }],
      nounChainMarkers,
    },
    pending: [],
  });
  const entities = (q: string, list?: string[]) =>
    build_path_graph(q, table(list)).nodes.map((n) => `${n.color}:${n.entity}`);

  it('「의」가 걸려도 노드를 세우지 않고 다음 B가 명사구 전체를 끌고 나온다', () => {
    assert.deepEqual(entities('찬성 이유의 문제점을 구하시오', ['의']), ['B:찬성 이유의 문제점', 'Q:구하시오']);
    assert.deepEqual(entities('찬성 이유의 문제점을 구하시오'), ['B:찬성 이유', 'B:문제점', 'Q:구하시오']);
  });

  it('여러 글자 조사는 끝이 같아야 잇는다 — 「에서의」', () => {
    assert.deepEqual(entities('점 A에서의 접선을 구하시오', ['에서의']), ['B:점 A에서의 접선', 'Q:구하시오']);
    assert.deepEqual(entities('점 A에서의 접선을 구하시오', ['와의']), ['B:점 A에서', 'B:접선', 'Q:구하시오']);
  });

  it('수식 노드 바로 뒤의 「의」는 다음 B를 수식 노드에 이어 붙인다', () => {
    assert.deepEqual(entities('선분 AB의 길이를 구하시오', ['의']), ['B:선분 AB의 길이', 'Q:구하시오']);
    assert.deepEqual(entities('선분 AB의 길이를 구하시오'), ['B:선분 AB', 'B:길이', 'Q:구하시오']);
  });

  it('다음 노드가 B가 아니면 잇지 않는다 — 자리 규칙으로 Q가 되는 「값은?」', () => {
    assert.deepEqual(entities('실수 k의 값은?', ['의']), ['B:실수 k', 'Q:값']);
    assert.deepEqual(entities('선분 AB의 값은?', ['의']), ['B:선분 AB', 'Q:값']);
  });
});

describe('목적절 경계 — 「~기 위해」 뒤부터 실체를 잡는다 (오종래 2026-10-06)', () => {
  // B = SB(~를·~을), C = SC(~하기 위해, 스위치 표지)
  const sw = (id: string, markers: string[], color: Color) =>
    ({ id, kind: '조사·어미', markers, intent: '', color }) as SealedSwitch;
  const table = (purposeClauses?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~를', '~을'], 'B'), sw('SC', ['~하기 위해'], 'C')],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, purposeClauses },
    pending: [],
  });
  const entities = (q: string, list?: string[]) =>
    build_path_graph(q, table(list)).nodes.map((n) => `${n.color}:${n.entity}`);
  const list = ['~기 위해', '~함으로써'];

  it('목적절 뒤 쉼표·공백 다음부터 B 실체다 — 목적절은 노드가 아니다', () => {
    assert.deepEqual(entities('물가를 줄이기 위해, B국이 시행한 대응조치를', list), ['B:물가', 'B:B국이 시행한 대응조치']);
    assert.deepEqual(entities('세금을 걷음으로써 정부가 쓴 돈을', ['~음으로써']), ['B:세금', 'B:정부가 쓴 돈']);
    assert.deepEqual(entities('물가를 줄이기 위해, B국이 시행한 대응조치를'), ['B:물가', 'B:줄이기 위해, B국이 시행한 대응조치']);
  });

  it('같은 자리의 스위치 표지가 먼저다 · 어절 안이면 끊지 않는다', () => {
    assert.deepEqual(entities('계산하기 위해 쓴 식을', list), ['C:계산', 'B:쓴 식']);
    assert.deepEqual(entities('줄이기 위해서 쓴 식을', list), ['B:줄이기 위해서 쓴 식']);
  });
});

describe('부등호 조건은 판단기준이 아니라 C · 「의 값」은 실체값에서 뗀다 (오종래 2026-10-06)', () => {
  // 조건 = SC(~일 때, 판단기준), B = SB(~을), Q = SQ(어휘형 「구하시오」)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table: SealedTable = {
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SC', ['~일 때'], 'C'), sw('SB', ['~을'], 'B'), sw('SQ', ['구하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], foldToB: ['SC'] },
    pending: [],
  };

  it('실체 끝 식에 부등호가 있으면 접지 않는다 — Q 직전 B가 급소', () => {
    const g = build_path_graph('a>0, b>0일 때 상수 a, b의 값을 구하시오', table);
    assert.equal(g.nodes[0].color, 'C');
    assert.equal(g.edges.some((e) => e.kind === '접힘'), false);
    const p = find_pivot(g, table);
    assert.deepEqual([p.reason, p.keyword, p.name], ['Q 직전 B', 'a, b', '상수']);
  });

  it('부등호가 없으면 지금처럼 판단기준으로 접는다', () => {
    const g = build_path_graph('점 C(0, -1)일 때 넓이를 구하시오', table);
    assert.equal(g.nodes[0].color, 'B');
    assert.equal(find_pivot(g, table).node.id, g.nodes[0].id);
  });
});

describe('인용 명제 — 따옴표 안 「…다.」 명제 전체가 노드 하나 (오종래 2026-10-06)', () => {
  // B = SB(~가·~를), Q = SQ(어휘형 「증명하시오」)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (quotedPropositions?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~가', '~를'], 'B'), sw('SQ', ['증명하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, quotedPropositions },
    pending: [],
  });
  const entities = (q: string, list?: string[]) =>
    build_path_graph(q, table(list)).nodes.map((n) => `${n.color}:${n.entity}`);
  const q = "'부등식 sinx≥xcosx가 성립한다.'를 증명하시오";

  it('인용 안의 표지는 걸지 않고 인용 전체가 B — 뒤 조사는 끌 실체가 없어 서지 않는다', () => {
    assert.deepEqual(entities(q, ['SB']), ["B:'부등식 sinx≥xcosx가 성립한다.'", 'Q:증명하시오']);
    assert.deepEqual(entities(q), ["B:'부등식 sinx≥xcosx", "B:성립한다.'", 'Q:증명하시오']);
  });

  it('어절 안의 프라임·문장이 아닌 인용은 묶지 않는다', () => {
    assert.deepEqual(entities("f'(x)가 f'(1)를 증명하시오", ['SB']), ["B:f'(x)", "B:f'(1)", 'Q:증명하시오']);
    assert.deepEqual(entities("'정적분'가 있다를 증명하시오", ['SB']), ["B:'정적분'", 'B:있다', 'Q:증명하시오']);
  });
});

describe('단서절 — 「단,」 뒤 문장 끝까지 D 노드 하나 (오종래 2026-10-06)', () => {
  // B = SB(~을·~의), Q = SQ(어휘형 「나타내시오」「표시하시오」), 단서 = SD(어휘형 「단,」 D)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (provisoClauses?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~을', '~의'], 'B'), sw('SQ', ['나타내시오', '표시하시오'], 'Q', true), sw('SD', ['단,'], 'D', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, provisoClauses },
    pending: [],
  });
  const entities = (q: string, list?: string[]) =>
    build_path_graph(q, table(list)).nodes.map((n) => `${n.color}:${n.entity}`);
  const q = '반응을 식으로 나타내시오. 단, 각 물질의 상태도 표시하시오.';

  it('단서절 전체가 D 하나 — 안의 B·Q는 서지 않고 급소는 앞 물음의 Q 직전 B 하나', () => {
    assert.deepEqual(entities(q, ['SD']), ['B:반응', 'Q:나타내시오', 'D:단, 각 물질의 상태도 표시하시오.']);
    const t = table(['SD']);
    const r = analyze_pivot(build_path_graph(q, t), t);
    assert.equal(r.ok && r.pivot.keyword, '반응');
    assert.equal(r.ok && r.pivots, undefined);
  });

  it('「(단, …)」면 닫는 괄호까지 — 소수점은 문장 끝이 아니다', () => {
    assert.deepEqual(entities('반응을 나타내시오. (단, 0.95로 계산한다.) 끝', ['SD']), ['B:반응', 'Q:나타내시오', 'D:단, 0.95로 계산한다.']);
  });

  it('괄호 단서는 짝이 맞는 닫는 괄호까지 — 안의 괄호는 건너뛰고, 마침표가 없어도', () => {
    assert.deepEqual(
      entities('반응을 나타내시오. (단, P(|Z|≤1.96)=0.95로 계산한다.) 끝', ['SD']),
      ['B:반응', 'Q:나타내시오', 'D:단, P(|Z|≤1.96)=0.95로 계산한다.'],
    );
    assert.deepEqual(entities('반응을 나타내시오. (단, AB < AC) 각 C을 나타내시오', ['SD']), [
      'B:반응',
      'Q:나타내시오',
      'D:단, AB < AC',
      'B:각 C',
      'Q:나타내시오',
    ]);
  });

  it('말미 괄호(부연·조건·예시)도 D 하나 — 안의 B·Q는 서지 않는다 (오종래 2026-10-07)', () => {
    assert.deepEqual(entities('반응을 나타내시오. (예를 들어, 물의 상태를 표시하시오.)', ['SD']), [
      'B:반응',
      'Q:나타내시오',
      'D:예를 들어, 물의 상태를 표시하시오.',
    ]);
    assert.deepEqual(entities('반응을 나타내시오(상태를 표시하시오).', ['SD']), ['B:반응', 'Q:나타내시오', 'D:상태를 표시하시오']);
    const t = table(['SD']);
    const r = analyze_pivot(build_path_graph('반응을 나타내시오(상태를 표시하시오).', t), t);
    assert.ok(r.ok && r.pivot.node.entity === '반응', '괄호 안 B는 급소가 되지 않는다');
  });

  it('말미가 아닌 괄호 · 한글 없는 괄호 · 지정이 없으면 묶지 않는다', () => {
    assert.ok(!entities('g(x)의 상태를 나타내시오', ['SD']).some((e) => e.startsWith('D:')), '문장 중간 괄호');
    assert.ok(!entities('반응을 나타내시오. (10^100)', ['SD']).some((e) => e.startsWith('D:')), '한글 없음');
    assert.ok(!entities('반응을 나타내시오(상태를 표시하시오).').some((e) => e.startsWith('D:')), '지정 없음');
  });

  it('정답지 요약 괄호 「(표:」「(상자:」「(제시문:」은 D로 묶지 않는다 (오종래 2026-10-07)', () => {
    for (const head of ['표:', '상자:', '제시문:']) {
      assert.ok(!entities(`반응을 나타내시오. (${head} 물의 상태)`, ['SD']).some((e) => e.startsWith('D:')), head);
    }
  });

  it('어절 머리가 아니면(「판단,」) 걸지 않는다 · 지정이 없으면 그대로', () => {
    assert.deepEqual(entities('판단, 반응을 나타내시오', ['SD']), ['B:판단, 반응', 'Q:나타내시오']);
    assert.ok(entities(q).includes('Q:표시하시오'), '지정이 없으면 단서절로 묶지 않는다');
  });
});

describe('수량 값 B — 「몇 ~」 Q에 접힌 값 B가 급소 (오종래 2026-10-06)', () => {
  const table = (quantityHeads?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], quantityHeads },
    pending: [],
  });

  it('「몇 N인가?」 Q가 있으면 대상 B보다 먼저 그 Q가 급소 — 실체 「몇 N」', () => {
    const g = graph([node('B1', 'B', '평균 힘의 크기'), node('Q1', 'Q', '몇 N인가?')], []);
    const r = analyze_pivot(g, table(['몇']));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.pivot.reason, '수량 값 B');
    assert.equal(r.pivot.node.id, 'Q1');
    assert.equal(r.pivot.keyword, '몇 N');
  });

  it('간접의문 「몇 g 넣어야 하」(는지)도 — 실체는 「몇」과 바로 뒤 어절', () => {
    const g = graph([node('B1', 'B', '아자이드화 나트륨'), node('Q1', 'Q', '몇 g 넣어야 하'), node('Q2', 'Q', '계산하시오')], []);
    const r = analyze_pivot(g, table(['몇']));
    assert.equal(r.ok && r.pivot.keyword, '몇 g');
  });

  it('지정이 없으면 기존 규칙 그대로 — Q 직전 B', () => {
    const g = graph([node('B1', 'B', '평균 힘의 크기'), node('Q1', 'Q', '몇 N인가?')], []);
    const r = analyze_pivot(g, table());
    assert.equal(r.ok && r.pivot.reason, 'Q 직전 B');
  });
});

describe('제시문 지정 — 「제시문」이 붙은 괄호 기호·범위만 P (오종래 2026-10-07)', () => {
  // B = SB(~을·~의·~에), 단독 기호 = SL(어휘형 「(가)」「(나)」 B), 지정 = SP(어휘형 「@P」 P)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (designatedPassages?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~을', '~의', '~에'], 'B'), sw('SL', ['(가)', '(나)'], 'B', true), sw('SP', ['@P'], 'P', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, designatedPassages },
    pending: [],
  });
  const entities = (q: string, list?: string[]) =>
    build_path_graph(q, table(list)).nodes.map((n) => `${n.color}:${n.entity}`);

  it('범위 「(나)~(라)」는 P 하나 — 뒤 B에 묻히지 않는다', () => {
    assert.deepEqual(entities('@P (나)~(라)에 나타난 영향을', ['SP']), ['P:(나)~(라)', 'B:나타난 영향']);
  });

  it('기호 나열 「(가), (다), (라)」「(가)·(나)·(다)」도 전체가 P 하나 (오종래 2026-10-07)', () => {
    assert.deepEqual(entities('@P (가), (다), (라)의 설명을', ['SP']), ['P:(가), (다), (라)', 'B:설명']);
    assert.deepEqual(entities('@P (가)·(나)·(다)의 설명을', ['SP']), ['P:(가)·(나)·(다)', 'B:설명']);
    assert.deepEqual(entities('@P (1), (2)의 설명을', ['SP']), ['P:(1), (2)', 'B:설명']);
  });

  it('단독 지정 「(마)」도 P', () => {
    assert.deepEqual(entities('@P (마)의 설명을', ['SP']), ['P:(마)', 'B:설명']);
  });

  it('「@P」 없는 단독 기호는 제 스위치 그대로 (B)', () => {
    assert.deepEqual(entities('(가)의 설명을', ['SP']), ['B:(가)', 'B:설명']);
  });

  it('뒤에 기호가 없으면 걸지 않는다 · 지정이 없으면 적용하지 않는다', () => {
    assert.equal(entities('@P 내용을', ['SP']).some((e) => e.startsWith('P:')), false);
    assert.equal(entities('@P (마)의 설명을').includes('P:(마)'), false);
  });
});

describe('지시어 B 급소 — 실체값이 지시어면 앞 명사구 (오종래 2026-10-07)', () => {
  // B = SB(~을·~의), 병렬 = SP(~와), Q = SQ(어휘형 「설명하고」「서술하시오」)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const t: SealedTable = {
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~을', '~의'], 'B'), sw('SP', ['~와'], 'P'), sw('SQ', ['설명하고', '서술하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true },
    pending: [],
  };
  const keyword = (q: string) => {
    const r = analyze_pivot(build_path_graph(q, t), t);
    return r.ok ? r.pivot.keyword : r.flag;
  };

  it('앞 쉼표가 붙은 「, 그것」도 앞 B 명사구로 · 병렬 P는 함께', () => {
    assert.equal(keyword('관점을 설명하고, 그것을 서술하시오'), '관점');
    assert.equal(keyword('갑와 을을 설명하고, 그것을 서술하시오'), '갑와 을');
  });

  it('지시어가 아니면 그대로', () => {
    assert.equal(keyword('관점을 설명하고, 반론을 서술하시오'), '반론');
  });
});

describe('비교구문 — 「A과/와 B를 비교하여」「A과/와 B의 차이를」의 A·B는 각각 B (오종래 2026-10-07)', () => {
  // B = SB(~을·~를·~의), 병렬 = SP(~와·~과 P), Q = SQ(어휘형 「서술하시오」)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const t: SealedTable = {
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~을', '~를', '~의'], 'B'), sw('SP', ['~와', '~과'], 'P'), sw('SQ', ['서술하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true },
    pending: [],
  };
  const entities = (q: string) => build_path_graph(q, t).nodes.map((n) => `${n.color}:${n.entity}`);

  it('비교 대상 A·B가 각각 B — 「비교하여」「~의 차이」', () => {
    assert.deepEqual(entities('갑과 을을 비교하여 서술하시오'), ['B:갑', 'B:을', 'Q:서술하시오']);
    assert.deepEqual(entities('갑과 을의 차이를 서술하시오'), ['B:갑', 'B:을', 'B:차이', 'Q:서술하시오']);
  });

  it('「~과 함께」 등 부사구 · 비교어 없는 병렬은 P 그대로', () => {
    assert.equal(entities('갑과 함께 을을 비교하여 서술하시오')[0], 'P:갑');
    assert.equal(entities('갑과 을을 서술하시오')[0], 'P:갑');
  });

  it('「A의 차이」는 「의」 명사구 연결보다 먼저 나눈다 — A와 기준어가 각각 B (오종래 2026-10-07)', () => {
    const chained: SealedTable = { ...t, apply: { ...t.apply, nounChainMarkers: ['~의'] } };
    const ents = (q: string) => build_path_graph(q, chained).nodes.map((n) => `${n.color}:${n.entity}`);
    assert.deepEqual(ents('갑과 병의 차이를 서술하시오'), ['B:갑', 'B:병', 'B:차이', 'Q:서술하시오']);
    assert.deepEqual(ents('갑과 병의 결과를 서술하시오'), ['P:갑', 'B:병의 결과', 'Q:서술하시오'], '비교어가 아니면 연결 그대로');
  });

  it('「중 더 큰/작은/많은/적은」도 비교어 — 「중」 뒤 B 실체는 나누지 않는다 (오종래 2026-10-07)', () => {
    assert.deepEqual(entities('갑과 병 중 더 큰 수를 서술하시오'), ['B:갑', 'B:병 중 더 큰 수', 'Q:서술하시오']);
    assert.equal(entities('갑과 병 중 더 적은 쪽을 서술하시오')[0], 'B:갑');
  });
});

describe('접속사 Q절 — 문장 머리 접속사로 이어진 Q절은 절마다 단위 (오종래 2026-10-07)', () => {
  // B = SB(~을·~를), Q = SQ(어휘형 「제시하시오」「설명하시오」), 접속사 = 「@C」(테스트용 가짜 낱말)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (conjunctionClauses?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~을', '~를'], 'B'), sw('SQ', ['제시하시오', '설명하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, conjunctionClauses },
    pending: [],
  });
  const q = '근거를 제시하시오. @C 노력을 설명하시오.';

  it('접속사는 실체 머리에 붙지 않는다', () => {
    const g = build_path_graph(q, table(['@C']));
    assert.deepEqual(g.nodes.map((n) => `${n.color}:${n.entity}`), ['B:근거', 'Q:제시하시오', 'B:노력', 'Q:설명하시오']);
  });

  it('앞뒤 절에 Q가 모두 있으면 Q절마다 단위 — 접속사는 빠진다', () => {
    assert.deepEqual(split_units(q, table(['@C'])), ['근거를 제시하시오.', '노력을 설명하시오.']);
  });

  it('쉼표가 붙은 접속사·셋 이상 열거도 자른다', () => {
    const three = '근거를 제시하시오. @C, 노력을 설명하시오. @C 방안을 제시하시오.';
    assert.deepEqual(split_units(three, table(['@C'])), ['근거를 제시하시오.', '노력을 설명하시오.', '방안을 제시하시오.']);
  });

  it('한쪽 절에 Q가 없거나 문장 머리가 아니면 자르지 않는다 · 지정이 없으면 적용하지 않는다', () => {
    assert.deepEqual(split_units('근거를 @C 노력을 설명하시오.', table(['@C'])), []);
    assert.deepEqual(split_units('근거를 제시하시오. @C 노력을', table(['@C'])), []);
    assert.deepEqual(split_units(q, table()), []);
  });
});

describe('조건부확률 조건절 — 뒤에 「~확률」 B가 오면 「~일 때」는 접지 않고 C (오종래 2026-10-07)', () => {
  // B = SB(~가·~을), 판단기준 = SJ(~일 때 C, foldToB), Q = SQ(어휘형 「구하시오」), 대상 = 「@확률」(테스트용 가짜 말)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (conditionalTargets?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~가', '~을'], 'B'), sw('SJ', ['~일 때'], 'C'), sw('SQ', ['구하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, foldToB: ['SJ'], conditionalTargets },
    pending: [],
  });
  const q = '공이 빨간색일 때, 주머니가 A일 @확률을 구하시오.';

  it('조건절은 C 그대로, 급소는 Q 직전 B 「~확률」', () => {
    const t = table(['@확률']);
    const g = build_path_graph(q, t);
    const cond = g.nodes.find((n) => n.switchId === 'SJ')!;
    assert.equal(cond.color, 'C');
    assert.equal(cond.foldedFrom, undefined);
    const r = analyze_pivot(g, t);
    assert.equal(r.ok && r.pivot.node.entity, 'A일 @확률');
    assert.equal(r.ok && r.pivot.reason, 'Q 직전 B');
  });

  it('「~확률」 B가 없으면 판단기준 그대로 B로 접힌다 · 지정이 없으면 적용하지 않는다', () => {
    const plain = build_path_graph('f(x)가 연속일 때, 상수 a를 구하시오.', table(['@확률']));
    assert.equal(plain.nodes.find((n) => n.switchId === 'SJ')!.color, 'B');
    assert.equal(build_path_graph(q, table()).nodes.find((n) => n.switchId === 'SJ')!.color, 'B');
  });

  it('상태가 식·기호(「k일 때」)이거나 「~확률」 B가 다른 문장이면 판단기준 그대로', () => {
    const t = table(['@확률']);
    const sj = (s: string) => build_path_graph(s, t).nodes.find((n) => n.switchId === 'SJ')!.color;
    assert.equal(sj('눈의 수가 k일 때, 주머니가 A일 @확률을 구하시오.'), 'B');
    assert.equal(sj('공이 빨간색일 때 끝낸다. 주머니가 A일 @확률을 구하시오.'), 'B');
  });
});

describe('대괄호 묶음 · 따옴표 이름 — 묶음 전체가 노드 하나 (오종래 2026-10-07)', () => {
  // B = SB(~을·~인), P = SP(어휘형 「그림」), 블록 = SK(보기 머리 「⑤」), Q = SQ(어휘형 「구하시오」)
  const sw = (id: string, markers: string[], color: Color, lexical?: boolean) =>
    ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
  const table = (bracketLabels?: string[], quotedNames?: string[]): SealedTable => ({
    version: 1,
    source: { document: '(테스트)', sections: [] },
    switches: [sw('SB', ['~을', '~인'], 'B'), sw('SP', ['그림'], 'P', true), sw('SK', ['⑤'], 'B', true), sw('SQ', ['구하시오'], 'Q', true)],
    lights: [],
    matrix: [],
    symbols: [],
    forms: [],
    apply: { longestMatchFirst: true, precedence: [], endOfWord: true, statementBlocks: ['SK'], bracketLabels, quotedNames },
    pending: [],
  });
  const ents = (q: string, t: SealedTable) => build_path_graph(q, t).nodes.map((n) => `${n.color}${n.entity}`);

  it('「[그림 1]」은 P 하나 — 「그림」·「1]」로 갈라지지 않는다', () => {
    assert.deepEqual(ents('[그림 1]을 구하시오.', table(['SP'])), ['P[그림 1]', 'Q구하시오']);
    assert.deepEqual(ents('[그림 1]을 구하시오.', table()), ['P그림', 'B1]', 'Q구하시오']);
  });

  it('한글로 시작하지 않는 대괄호(구간)와 보기 블록 안의 대괄호는 그대로', () => {
    assert.deepEqual(ents('구간 [0, 2]을 구하시오.', table(['SP'])), ['B구간 [0, 2]', 'Q구하시오']);
    const block = '구하시오.\n⑤ 45/4 [그림]';
    assert.deepEqual(ents(block, table(['SP'])), ents(block, table()));
    assert.ok(!ents(block, table(['SP'])).includes('P[그림]'));
  });

  it("「'장인'」은 B 하나 — 안의 「인」이 표지로 걸리지 않는다 · 「f'(x)」의 프라임은 아니다", () => {
    assert.deepEqual(ents("'장인'을 구하시오.", table(undefined, ['SB'])), ["B'장인'", 'Q구하시오']);
    assert.deepEqual(ents("'장인'을 구하시오.", table()), ["B'장", "B'", 'Q구하시오']);
    assert.deepEqual(ents("f'(x)을 구하시오.", table(undefined, ['SB'])), ["Bf'(x)", 'Q구하시오']);
  });
});
