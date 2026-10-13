// 병렬 나열 (apply.parallelChains, 오종래 2026-10-13) — (B이고 B이고 …) 전체는 마지막에 붙는 기능표지 하나로 색이 정해진다.
// 표지는 봉인 값이 아니라 테스트용 가짜 표지다. 고리 = SP(~이고·~이며), 관형 = SA(~인)
// 「~하고」는 용언 연결이라 고리가 아니다 (오종래 2026-10-13) — 표지도 아니어서 다음 실체에 붙는다

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { build_path_graph } from '../src/fq/index.ts';
import type { SealedSwitch, SealedTable } from '../src/fq/sealed/schema.ts';
import type { Color } from '../src/fq/types.ts';

const sw = (id: string, markers: string[], color: Color, lexical?: string[]) =>
  ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
const table = (parallel: boolean): SealedTable => ({
  version: 1,
  source: { document: '(테스트)', sections: [] },
  switches: [
    sw('SB', ['~을', '~를'], 'B'),
    sw('SP', ['~이고', '~이며'], 'P'),
    sw('SA', ['~인'], 'C'),
    sw('SC', ['~인 경우에', '~경우에', '경우에', '~일 때'], 'C', ['경우에']),
    sw('C-F', ['~인 방식으로'], 'C'),
    sw('SQ', ['설명하시오', '서술하시오'], 'Q', ['설명하시오', '서술하시오']),
  ],
  lights: [],
  matrix: [],
  symbols: [],
  forms: [],
  apply: {
    longestMatchFirst: true,
    precedence: [],
    endOfWord: true,
    ...(parallel ? { parallelChains: { links: ['~이고', '~이며'], adnominal: ['~인'] } } : {}),
  },
  pending: [],
});
const 노드 = (q: string, parallel = true) =>
  build_path_graph(q, table(parallel)).nodes.map((n) => [n.color, n.switchId, n.entity.trim()]);

describe('병렬 나열 — 끝 표지 하나가 전체 색', () => {
  it('「A이고 B인 것을」 → 「을」 B로 흡수 (사슬 안 「인」은 관형)', () => {
    assert.deepEqual(노드('자유이고 평등인 것을 설명하시오.'), [
      ['B', 'SB', '자유이고 평등인 것'],
      ['Q', 'SQ', '설명하시오'],
    ]);
  });

  it('「A이고 B인 경우에」 → C로 흡수', () => {
    assert.deepEqual(노드('자유이고 평등인 경우에 설명하시오.')[0], ['C', 'SC', '자유이고 평등']);
  });

  it('「A이고 B인 방식으로」 → C-F로 흡수', () => {
    assert.deepEqual(노드('자유이고 평등인 방식으로 서술하시오.')[0], ['C', 'C-F', '자유이고 평등']);
  });

  it('고리 여럿도 한 사슬', () => {
    assert.deepEqual(노드('자유이고 평등이며 연대인 가치를 설명하시오.')[0], ['B', 'SB', '자유이고 평등이며 연대인 가치']);
  });

  it('「~하고」는 고리가 아니다 — 단독 P로 서지 않고 다음 실체에 붙는다', () => {
    assert.deepEqual(노드('평등하고 자유로운 사회인 것을 설명하시오.'), [
      ['C', 'SA', '평등하고 자유로운 사회'],
      ['B', 'SB', '것'],
      ['Q', 'SQ', '설명하시오'],
    ]);
  });

  it('단독 항목 — 앞말이 없어도 「경우에」가 선다, 앞말이 있으면 앞말이 실체', () => {
    assert.deepEqual(노드('경우에 따라 다른 결과를 설명하시오.')[0], ['C', 'SC', '경우에']);
    assert.deepEqual(노드('그 경우에 생긴 결과를 설명하시오.')[0], ['C', 'SC', '그']);
  });

  it('수학 「…이고 …일 때」 → 한 덩어리 C', () => {
    assert.deepEqual(노드("f'(x)=2x이고 f(1)=6일 때 값을 설명하시오.")[0], ['C', 'SC', "f'(x)=2x이고 f(1)=6"]);
  });

  it('흡수된 노드는 parallelOf에 남고, 간선은 끝 노드로 이어진다', () => {
    const g = build_path_graph('대상을 자유이고 평등인 것을 설명하시오.', table(true));
    const 끝 = g.nodes.find((n) => n.entity.trim() === '자유이고 평등인 것')!;
    assert.deepEqual(끝.parallelOf?.map((x) => [x.color, x.surface]), [['P', '이고'], ['C', '인']]);
    assert.ok(g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to)));
  });

  it('문장 경계가 끼면 잇지 않는다 — 규칙이 없을 때와 같다', () => {
    assert.deepEqual(노드('자유이고. 평등인 것을 설명하시오.'), 노드('자유이고. 평등인 것을 설명하시오.', false));
  });

  it('규칙이 없으면 지금처럼 나뉜다', () => {
    assert.deepEqual(노드('자유이고 평등인 것을 설명하시오.', false).map((n) => n[0]), ['P', 'C', 'B', 'Q']);
  });
});
