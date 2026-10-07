// 제시문 인식 — HMOS_제시문인식원리_구조화.md §2~§5 · 제시문 급소 규칙 · 판별 확정 원칙 (오종래 2026-10-07)
// 표지는 봉인 값이 아니라 테스트용 가짜 표지다. B = SB(~를), P = SP(어휘형 [가]·[나]), Q = SQ(설명하시오)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, build_path_graph, connectPassage, describeCombination, recognizePassage } from '../src/fq/index.ts';
import type { V2Analysis } from '../src/fq/pipeline.ts';
import type { SealedSwitch, SealedTable } from '../src/fq/sealed/schema.ts';
import type { Color } from '../src/fq/types.ts';

const sw = (id: string, markers: string[], color: Color, lexical?: string[]) =>
  ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
const table: SealedTable = {
  version: 1,
  source: { document: '(테스트)', sections: [] },
  switches: [sw('SB', ['~를'], 'B'), sw('SP', ['[가]', '[나]'], 'P', ['[가]', '[나]']), sw('SQ', ['설명하시오'], 'Q', ['설명하시오'])],
  lights: [],
  matrix: [],
  symbols: [],
  forms: [],
  apply: { longestMatchFirst: true, precedence: [], endOfWord: true },
  pending: [],
};

const question = (q: string): V2Analysis => {
  const graph = build_path_graph(q, table);
  return { question: q, graph, form: describeCombination(graph.combination, table), pivot: analyze_pivot(graph, table) };
};

describe('제시문 인식 — 단락 분리 · 5색 · 서두·말미 (§2·§3)', () => {
  it('빈 줄로 단락을 끊고, 머리 기호([가]·단락N:)를 떼어 label로 남긴다', () => {
    const r = recognizePassage('[가] 다수결를 본다.\n\n단락2:\n만장일치를 본다.', table);
    assert.deepEqual(r.paragraphs.map((p) => [p.label, p.text]), [['가', '다수결를 본다.'], ['2', '만장일치를 본다.']]);
  });

  it('단락마다 색별 노드 실체를 낸다', () => {
    const p = recognizePassage('[가] 다수결를 본다.', table).paragraphs[0];
    assert.deepEqual(p.colors.B, ['다수결']);
  });

  it('서두 = 첫 문장의 B · 말미 = 마지막 문장의 B — 가운데 문장의 B는 어느 쪽도 아니다', () => {
    const p = recognizePassage('다수결를 본다. 가운데를 본다. 만장일치를 본다.', table).paragraphs[0];
    assert.deepEqual(p.head.map((n) => n.entity), ['다수결']);
    assert.deepEqual(p.tail.map((n) => n.entity), ['만장일치']);
  });

  it('한 문장 단락은 서두와 말미가 같다', () => {
    const p = recognizePassage('다수결를 본다.', table).paragraphs[0];
    assert.deepEqual(p.head, p.tail);
  });

  it('전체 — 단락들을 이어 붙인 전체에 같은 급소 규칙 (§3-7)', () => {
    assert.equal(recognizePassage('[가] 다수결를 본다.\n\n[나] 그냥 본다.', table).pivot?.node.entity, '다수결');
    assert.equal(recognizePassage('[가] 다수결를 본다.\n\n[나] 만장일치를 본다.', table).flag, 'MULTIPLE_CONVERGENCE');
  });
});

describe('단락 급소 — 논제 방향 · 서두·말미 · background (판별 확정 원칙)', () => {
  it('논제 급소 keyword를 품은 서두 B가 급소', () => {
    const passage = recognizePassage('다수결 원칙를 본다. 가운데를 본다. 끝를 본다.', table);
    const c = connectPassage(question('다수결를 설명하시오.'), passage);
    assert.equal(c.pivots[0]?.node.entity, '다수결 원칙');
    assert.equal(c.pivots[0]?.place, '서두');
  });

  it('말미 B도 급소가 된다', () => {
    const passage = recognizePassage('처음를 본다. 가운데를 본다. 만장일치 제도를 본다.', table);
    const c = connectPassage(question('만장일치를 설명하시오.'), passage);
    assert.equal(c.pivots[0]?.place, '말미');
    assert.equal(c.pivots[0]?.node.entity, '만장일치 제도');
  });

  it('가운데 문장의 B는 keyword를 품어도 급소가 아니다 — 그 단락은 background', () => {
    const passage = recognizePassage('처음를 본다. 다수결를 본다. 끝를 본다.', table);
    const c = connectPassage(question('다수결를 설명하시오.'), passage);
    assert.equal(c.pivots[0], null);
    assert.deepEqual(c.background, [0]);
  });

  it('keyword가 B 실체를 품어도 닿는다 — 「D국이 시행한 정책」 ↔ 「정책」 · 한 글자는 닿지 않는다', () => {
    const passage = recognizePassage('정책를 본다.\n\n차를 본다.', table);
    const c = connectPassage(question('시행한 정책를 설명하시오.'), passage);
    assert.equal(c.pivots[0]?.node.entity, '정책');
    assert.equal(c.pivots[1], null);
  });

  it('논제 급소 keyword가 먼저, 관련 정보(논제의 다른 B)가 다음', () => {
    const passage = recognizePassage('자료를 본다. 끝를 본다.', table);
    const c = connectPassage(question('자료를 그 이유를 설명하시오.'), passage);
    assert.equal(c.pivots[0]?.key, '자료');
  });
});

describe('논제-제시문 연결 (§4·§5)', () => {
  const passage = recognizePassage('[가] 다수결를 본다.\n\n[나] 만장일치를 본다.\n\n㉠ 위임를 본다.', table);

  it('지정 — 논제의 [가]는 그 단락과 잇는다', () => {
    const c = connectPassage(question('[가] 자료를 설명하시오.'), passage);
    assert.ok(c.links.some((l) => l.kind === '지정' && l.paragraph === 0));
  });

  it('기호 — 논제 B 실체의 ㉠은 그 기호가 있는 단락과 잇는다', () => {
    const c = connectPassage(question('㉠를 설명하시오.'), passage);
    assert.ok(c.links.some((l) => l.kind === '기호' && l.paragraph === 2));
  });

  it('급소 — 단락 급소가 선 단락은 논제와 잇는다', () => {
    const c = connectPassage(question('만장일치 방식를 설명하시오.'), passage);
    assert.deepEqual(c.links.filter((l) => l.kind === '급소').map((l) => l.paragraph), [1]);
    assert.deepEqual(c.background, [0, 2]);
  });

  it('전체 급소가 서지 않았으면 전체 맞물림은 판정하지 않는다', () => {
    const c = connectPassage(question('다수결를 설명하시오.'), passage);
    assert.equal(c.wholeMatches, undefined);
  });
});

describe('논제별 참조 범위 — 「제시문 [가], [나], [다]를 참고하여」 밖의 단락은 연결 후보가 아니다 (사회논술_문1 1-2·2-2)', () => {
  const passage = recognizePassage(
    '[가] 무역를 본다.\n\n[나] 관세를 본다.\n\n[다] 대응조치를 본다.\n\n[라] 환율를 본다.\n\n[마] 정책를 본다.\n\n이어진 단락이다. 정책를 본다.',
    table,
  );

  it('1-2 — 참조 [가][나][다] 밖의 [마]는 keyword 「정책」이 닿아도 잇지 않는다', () => {
    const c = connectPassage(question('제시문 [가], [나], [다]를 참고하여 정책 대응조치를 설명하시오.'), passage);
    assert.deepEqual(c.scope, ['가', '나', '다']);
    assert.deepEqual(c.outOfScope, [3, 4, 5]);
    assert.equal(c.pivots[4], null);
    assert.equal(c.pivots[5], null);
    assert.ok(c.links.every((l) => l.paragraph <= 2));
    assert.ok(c.background.every((i) => i <= 2));
  });

  it('2-2 — 참조 [가][나][라][마] 안의 [마]는 keyword 「정책」으로 잇는다 · 머리 기호 없는 단락은 앞 제시문을 잇는다', () => {
    const c = connectPassage(question('제시문 [가], [나], [라], [마]를 참고하여 정책를 설명하시오.'), passage);
    assert.deepEqual(c.outOfScope, [2]);
    assert.equal(c.pivots[4]?.node.entity, '정책');
    assert.equal(c.pivots[5]?.place, '말미');
    assert.deepEqual(c.links.filter((l) => l.kind === '급소').map((l) => l.paragraph), [4, 5]);
  });

  it('범위 표기 (나)~(라) · 공통 발문 뒤 소문항의 참조가 범위다', () => {
    const c = connectPassage(question('제시문 [가]~[마]를 읽고 답하시오.\n\n제시문 (나)~(라)를 참고하여 정책를 설명하시오.'), passage);
    assert.deepEqual(c.scope, ['나', '다', '라']);
  });

  it('참조가 없으면 모든 단락이 후보다', () => {
    const c = connectPassage(question('정책를 설명하시오.'), passage);
    assert.equal(c.scope, undefined);
    assert.deepEqual(c.outOfScope, []);
    assert.equal(c.pivots[4]?.node.entity, '정책');
  });
});

describe('제시문 급소 3규칙 —지시어 역추적 · keyword 특이도 · 서술문 B (오종래 2026-10-07)', () => {
  const t: SealedTable = {
    ...table,
    switches: [...table.switches, sw('SD', ['~이다.'], 'B')],
    apply: { ...table.apply, afterMathOnly: ['SD'], passageKeyExceptions: ['정책', '영향'] },
  };
  const q = (text: string): V2Analysis => {
    const graph = build_path_graph(text, t);
    return { question: text, graph, form: describeCombination(graph.combination, t), pivot: analyze_pivot(graph, t) };
  };

  it('서술문 B — 첫 문장 「X이다.」의 X 전체가 서두 B', () => {
    const p = recognizePassage('첫째를 만장일치에 의한 의사결정이다. 끝를 본다.', t).paragraphs[0];
    assert.deepEqual(p.head.map((n) => n.entity), ['첫째', '만장일치에 의한 의사결정']);
    assert.ok(p.colors.B.includes('만장일치에 의한 의사결정'));
  });

  it('서술문 B — 첫 문장이 아니면 세우지 않는다', () => {
    const p = recognizePassage('처음를 본다. 가운데 의사결정이다. 끝를 본다.', t).paragraphs[0];
    assert.deepEqual(p.head.map((n) => n.entity), ['처음']);
  });

  it('지시어 역추적 — 서두·말미 B가 지시어면 앞 단락 급소의 실체로 대체', () => {
    const passage = recognizePassage('위임 방식를 본다.\n\n이러한 방식를 본다.', t);
    const c = connectPassage(q('위임를 설명하시오.'), passage);
    assert.equal(c.pivots[1]?.entity, '위임 방식');
    assert.equal(c.pivots[1]?.deixis, '이러한 방식');
  });

  it('지시어 역추적 — 앞 단락 급소가 없으면 대체하지 않는다 (background)', () => {
    const passage = recognizePassage('그냥 본다.\n\n해당 위임를 본다.', t);
    const c = connectPassage(q('위임를 설명하시오.'), passage);
    assert.equal(c.pivots[1]?.entity, '해당 위임');
    assert.equal(c.pivots[1]?.deixis, undefined);
  });

  it('keyword 특이도 — 예외 낱말 그대로인 B 실체·논제 열쇠는 닿지 않는다', () => {
    const passage = recognizePassage('정책를 본다.\n\n크게 영향를 본다.\n\n보호무역 정책를 본다.', t);
    const c = connectPassage(q('시행한 정책를 영향를 설명하시오.'), passage);
    assert.equal(c.pivots[0], null);
    assert.equal(c.pivots[1], null);
    assert.equal(c.pivots[2], null);
    assert.deepEqual(c.background, [0, 1, 2]);
  });
});
