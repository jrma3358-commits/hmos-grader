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

describe('의문사 + 「방식으로」는 서술형태가 아니다 (오종래 2026-10-13)', () => {
  const t: SealedTable = {
    ...table(true),
    switches: [...table(true).switches.filter((s) => s.id !== 'C-F'), sw('C-F', ['~인 방식으로', '~방식으로', '방식으로'], 'C', ['방식으로'])],
    apply: { ...table(true).apply, formPivot: ['C-F'] },
  };
  const cf = (q: string) => build_path_graph(q, t).nodes.filter((n) => n.switchId === 'C-F').map((n) => n.entity.trim());

  it('「어떤 방식으로」 · 「어떠한 방식으로」 · 「무슨 방식으로」는 C-F 노드가 서지 않는다', () => {
    for (const w of ['어떤', '어떠한', '무슨']) assert.deepEqual(cf(`수출에 ${w} 방식으로 작용하는지 설명하시오.`), [], w);
  });

  it('의문사가 아니면 그대로 C-F', () => {
    assert.deepEqual(cf('경제적 방식으로 서술하시오.'), ['경제적']);
    assert.deepEqual(cf('자유이고 평등인 방식으로 서술하시오.'), ['자유이고 평등']);
  });
});

describe('두 음절 용언 어간 — 「이루는」의 「는」은 관형형 (apply.verbStems, 오종래 2026-10-13)', () => {
  const t: SealedTable = {
    ...table(false),
    switches: [...table(false).switches, sw('ST', ['~는'], 'B')],
    apply: { ...table(false).apply, afterNounOnly: ['ST'], verbStems: ['하', '이루'] },
  };
  const 는 = (q: string) => build_path_graph(q, t).nodes.filter((n) => n.switchId === 'ST').map((n) => n.entity.trim());

  it('어간 「이루」 뒤 「는」은 걸지 않는다', () => {
    assert.deepEqual(는('목적을 이루는 데 설명하시오.'), []);
  });

  it('「하루는」은 그대로 주제 「는」 — 어간 앞이 한글이면 어간이 아니다', () => {
    assert.deepEqual(는('하루는 철수를 설명하시오.'), ['하루']);
  });
});

// 인식 덩이 (오종래 2026-10-14) — 봉인 표지사전으로 본다:
//   ① 「와/과」 병렬 덩이는 뒤 기능표지에 묶이는 한 단위 (parallelChains.links ~와·~과, 예외 없음)
//   ② 관형형 「~는」(verbStems 미치·겪 …)은 앞 명사구(「의」「에」「이」로 끝나는 어절)·뒤 「~인」과 한 덩이 (관형절 덩이)
//   ③ 주어 「이」 — 앞 어절이 「…의」로 끝나고 명사가 두 음절 이상이면 끊는다
describe('인식 덩이 — 와/과 병렬 · 관형절 · 주어 「이」 (봉인 표지사전)', async () => {
  const { recognizeV2Analysis } = await import('../src/fq/pipeline.ts');
  const 실체들 = (q: string) => recognizeV2Analysis(q).graph.nodes.map((n) => `${n.color}「${n.entity.trim()}」`);

  it('「A와 B」는 쪼개지 않고 뒤 표지에 묶인 한 덩이', () => {
    const r = 실체들('A국과 C국의 무역분쟁으로 인한 손실을 줄이기 위해, D국이 시행한 정책이 자국의 경제에 어떤 도움이 될 수 있는지 설명하시오.');
    assert.ok(r.includes('B「A국과 C국의 무역분쟁으로 인한 손실」'));
    assert.ok(!r.some((x) => x === 'P「A국」'));
  });

  it('관형형 「~는」은 앞 명사구·뒤 「~인」과 한 덩이 — 급소 실체 하나', () => {
    const a = recognizeV2Analysis('자유무역이 국가의 경제에 미치는 긍정적인 영향을 경제주체별로 구분하여 설명하시오.');
    assert.deepEqual(a.graph.nodes.map((n) => `${n.color}「${n.entity.trim()}」`).slice(0, 1), ['B「자유무역이 국가의 경제에 미치는 긍정적인 영향」']);
    assert.ok(a.pivot.ok && a.pivot.pivot.node.entity.trim() === '자유무역이 국가의 경제에 미치는 긍정적인 영향');
  });

  it('관형절은 다른 조사에서 멈춘다 — 「…를 증명하는」 앞의 인용 명제는 따로 선다', () => {
    const r = 실체들("다음은 '0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'를 증명하는 방법에 대한 철수와 영희의 대화 중 일부이다. 물음에 답하시오.");
    assert.ok(r.includes("B「'0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'」"));
  });

  it('주어 「이」 — 「…의 수출국이」에서 끊는다, 한 음절 명사(「길이」)는 걸지 않는다', () => {
    const r = 실체들('C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.');
    assert.ok(r.includes('B「C국과 같은 원자재 중심의 수출국」'));
    assert.ok(r.includes('B「국제무역 환경」'));
    assert.ok(!실체들('정사각형의 한 변의 길이가 3일 때 넓이를 구하시오.').some((x) => x.endsWith('「한 변의 길」') || x.endsWith('「길」')));
  });
});
