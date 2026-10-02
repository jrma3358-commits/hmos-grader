// 급소(K) = 최수렴 B — 구현명세 §2-4를 기준으로 한 테스트.
// 기대값은 엔진 출력이 아니라 **명세**에서 온다. 봉인 값은 쓰지 않는다(그래프를 손으로 세운다).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, build_path_graph, convergenceOf, deepest_node, find_pivot, PivotError, split_units } from '../src/fq/index.ts';
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

  it('판단기준 표지가 없으면 접지 않는다 — B끼리 수렴 0 동점', () => {
    const g = build_path_graph(q, table());
    assert.equal(g.nodes[1].color, 'C');
    assert.equal(g.nodes[1].foldedFrom, undefined);
    const r = analyze_pivot(g);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.flag, 'MULTIPLE_CONVERGENCE');
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
