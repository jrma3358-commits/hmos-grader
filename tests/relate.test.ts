// C·논술 6단계 — 단락 급소 관계·6유형·추가/보완 [봉인⑭ 초안] (오종래 2026-10-14)
// 표지는 봉인 값이 아니라 테스트용 가짜 표지다 (align.test.ts와 같다). B = SB(~를), Q = SQ(설명하시오)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, build_path_graph, describeCombination, recognizePassage } from '../src/fq/index.ts';
import type { V2Analysis } from '../src/fq/pipeline.ts';
import type { SealedSwitch, SealedTable } from '../src/fq/sealed/schema.ts';
import type { Color } from '../src/fq/types.ts';
import { align_passage } from '../src/thesis/align.ts';
import { 같은종류, 봉인14_단락관계 } from '../src/thesis/relate.ts';

const sw = (id: string, markers: string[], color: Color, lexical?: string[]) =>
  ({ id, kind: '조사·어미', markers, intent: '', color, lexical }) as SealedSwitch;
const table: SealedTable = {
  version: 1,
  source: { document: '(테스트)', sections: [] },
  switches: [sw('SB', ['~를'], 'B'), sw('SQ', ['설명하시오'], 'Q', ['설명하시오'])],
  lights: [],
  matrix: [],
  symbols: [],
  forms: [],
  apply: { longestMatchFirst: true, precedence: [], endOfWord: true },
  pending: [],
};

const 인식 = (q: string): V2Analysis => {
  const graph = build_path_graph(q, table);
  return { question: q, graph, form: describeCombination(graph.combination, table), pivot: analyze_pivot(graph, table) };
};
const 관계 = (제시문: string, 소문항: [string, string, string[]][]) => {
  const passage = recognizePassage(제시문, table);
  const 정합 = align_passage(
    소문항.map(([번호, q, 참조]) => ({ 번호, 참조, 인식: 인식(q) })),
    passage,
  );
  return 봉인14_단락관계(정합, passage);
};

describe('봉인14_단락관계 — ② 관계 판정', () => {
  it('유사 — 두 단락 급소가 같은 실체, 공통 근거는 서로 품는 B', () => {
    const r = 관계('[가] 다수결 원칙를 본다.\n\n[나] 다수결 원칙를 본다.', [['1', '다수결를 설명하시오.', []]]);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].실체, { 관계: '유사', 공통: ['다수결 원칙'] });
    assert.deepEqual(r[0].유형, ['공통원리']);
  });

  it('대비 — 같은 논제 B에 다른 실체', () => {
    const r = 관계('[가] 다수결 원칙를 본다.\n\n[나] 다수결의 한계를 본다.', [['1', '다수결를 설명하시오.', []]]);
    assert.deepEqual(r[0].실체, { 관계: '대비', 기준: '다수결', 차이: ['다수결 원칙', '다수결의 한계'] });
    assert.deepEqual(r[0].유형, ['비교·대비', '선택·응용', '인연·비판']);
  });

  it('대비 — 논제 B 종류가 같다: 첫 어절(주체) 밖 어절이 같다 (오종래 2026-10-14)', () => {
    const r = 관계('[다] B국이 시행한 대응조치를 본다.\n\n[마] D국이 시행한 정책를 본다.', [
      ['1-2', 'B국이 시행한 대응조치를 설명하시오.', ['다']],
      ['2-2', 'D국이 시행한 정책를 설명하시오.', ['마']],
    ]);
    assert.deepEqual(r[0].실체, { 관계: '대비', 기준: '시행한', 차이: ['B국이 시행한 대응조치', 'D국이 시행한 정책'] });
    assert.equal(r[0].판단, '추가');
  });

  it('같은종류 — 첫 어절만 같거나 겹치는 어절이 없으면 다른 종류', () => {
    assert.equal(같은종류('B국이 시행한 대응조치', 'B국이 겪는 손실'), undefined);
    assert.equal(같은종류('자유무역', '국내 물가 상승의 이유'), undefined);
    assert.equal(같은종류('다수결', '다수결'), '다수결');
  });

  it('보완 — 한 급소를 다른 단락이 급소 노드 밖에서 다시 다룬다', () => {
    const r = 관계('[가] 다수결를 본다.\n\n[다] 만장일치 제도를 본다. 다수결 보완책를 본다. 만장일치 제도를 본다.', [
      ['1', '다수결를 설명하시오.', ['가']],
      ['2', '만장일치를 설명하시오.', ['다']],
    ]);
    assert.deepEqual(r[0].실체, { 관계: '보완', 빈곳: '다수결', 채움: [{ 단락: '다', 색: 'B', 실체: '다수결 보완책' }] });
    assert.deepEqual(r[0].유형, ['근거·주장', '대안제시']);
  });

  it('병렬 — 다른 열쇠, 겹치지 않는 급소', () => {
    const r = 관계('[가] 다수결를 본다.\n\n[다] 만장일치 제도를 본다.', [
      ['1', '다수결를 설명하시오.', ['가']],
      ['2', '만장일치를 설명하시오.', ['다']],
    ]);
    assert.deepEqual(r[0].실체, { 관계: '병렬', 나열: ['다수결', '만장일치 제도'] });
  });

  it('급소 단락이 하나뿐이면 맞대 볼 쌍이 없다', () => {
    assert.deepEqual(관계('[가] 다수결를 본다.\n\n[나] 날씨를 본다.', [['1', '다수결를 설명하시오.', []]]), []);
  });
});

describe('봉인14_단락관계 — ⑤ 기존 논제와 비교', () => {
  const 제시문 = '[가] 다수결를 본다.\n\n[다] 만장일치 제도를 본다.';

  it('덮음 — 한 소문항이 두 단락에 모두 연결', () => {
    const r = 관계('[가] 다수결 원칙를 본다.\n\n[나] 다수결 원칙를 본다.', [['1', '다수결를 설명하시오.', []]]);
    assert.equal(r[0].판단, '덮음');
    assert.equal(r[0].소문항, '1');
  });

  it('보완 — 한 단락에 연결된 소문항의 참조 범위 안에 다른 단락이 있다 → 5단계로', () => {
    const r = 관계(제시문, [
      ['1', '다수결를 설명하시오.', ['가', '다']],
      ['2', '만장일치를 설명하시오.', ['다']],
    ]);
    assert.equal(r[0].판단, '보완');
    assert.equal(r[0].소문항, '1');
  });

  it('추가 — 두 단락을 함께 묻는 소문항도, 끌어들일 범위도 없다', () => {
    const r = 관계(제시문, [
      ['1', '다수결를 설명하시오.', ['가']],
      ['2', '만장일치를 설명하시오.', ['다']],
    ]);
    assert.equal(r[0].판단, '추가');
    assert.equal(r[0].소문항, undefined);
  });
});
