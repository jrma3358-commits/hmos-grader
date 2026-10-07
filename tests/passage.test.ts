// 제시문 인식 — HMOS_제시문인식원리_구조화.md §2~§5 (오종래 2026-10-07)
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

describe('제시문 인식 — 단락 분리 · 5색 · 단락 급소 (§2·§3)', () => {
  it('빈 줄로 단락을 끊고, 머리 기호([가]·단락N:)를 떼어 label로 남긴다', () => {
    const r = recognizePassage('[가] 다수결를 본다.\n\n단락2:\n만장일치를 본다.', table);
    assert.deepEqual(r.paragraphs.map((p) => [p.label, p.text]), [['가', '다수결를 본다.'], ['2', '만장일치를 본다.']]);
  });

  it('단락마다 색별 노드 실체와 급소(B)를 낸다', () => {
    const r = recognizePassage('[가] 다수결를 본다.', table);
    const p = r.paragraphs[0];
    assert.deepEqual(p.colors.B, ['다수결']);
    assert.equal(p.pivot?.node.entity, '다수결');
    assert.equal(p.flag, undefined);
  });

  it('B가 없으면 급소가 서지 않는다 — NO_B (P·D는 급소가 아니다)', () => {
    const p = recognizePassage('그냥 본다.', table).paragraphs[0];
    assert.equal(p.pivot, undefined);
    assert.equal(p.flag, 'NO_B');
  });

  it('B가 동점으로 둘이면 급소가 서지 않는다 — MULTIPLE_CONVERGENCE (단락의 급소는 하나)', () => {
    const p = recognizePassage('다수결를 만장일치를 본다.', table).paragraphs[0];
    assert.equal(p.pivot, undefined);
    assert.equal(p.flag, 'MULTIPLE_CONVERGENCE');
  });
});

describe('제시문 인식 — 전체 급소 (§3-7)', () => {
  it('단락들을 이어 붙인 전체에 같은 급소 규칙 — B가 하나면 그것이 전체 급소', () => {
    const r = recognizePassage('[가] 다수결를 본다.\n\n[나] 그냥 본다.', table);
    assert.equal(r.pivot?.node.entity, '다수결');
  });

  it('전체가 하나로 수렴하지 않으면 플래그', () => {
    const r = recognizePassage('[가] 다수결를 본다.\n\n[나] 만장일치를 본다.', table);
    assert.equal(r.pivot, undefined);
    assert.equal(r.flag, 'MULTIPLE_CONVERGENCE');
  });
});

describe('논제-제시문 연결 · 놀고 있는 급소 (§4·§5)', () => {
  const passage = recognizePassage('[가] 다수결를 본다.\n\n[나] 만장일치를 본다.\n\n㉠ 위임를 본다.', table);

  it('지정 — 논제의 [가]는 그 단락과 잇는다', () => {
    const c = connectPassage(question('[가] 자료를 설명하시오.'), passage);
    assert.ok(c.links.some((l) => l.kind === '지정' && l.paragraph === 0));
  });

  it('기호 — 논제 B 실체의 ㉠은 그 기호가 있는 단락과 잇는다', () => {
    const c = connectPassage(question('㉠를 설명하시오.'), passage);
    assert.ok(c.links.some((l) => l.kind === '기호' && l.paragraph === 2));
  });

  it('맞물림 — 논제 급소와 단락 급소의 실체값이 같거나 한쪽이 품는다', () => {
    const c = connectPassage(question('만장일치 방식를 설명하시오.'), passage);
    assert.deepEqual(c.links.filter((l) => l.kind === '맞물림').map((l) => l.paragraph), [1]);
  });

  it('놀고 있는 급소 — 급소가 섰는데 어떤 연결도 없는 단락', () => {
    const c = connectPassage(question('[가] 자료를 설명하시오.'), passage);
    assert.deepEqual(c.idle, [1, 2]);
  });

  it('전체 급소가 서지 않았으면 전체 맞물림은 판정하지 않는다', () => {
    const c = connectPassage(question('다수결를 설명하시오.'), passage);
    assert.equal(c.wholeMatches, undefined);
  });
});
