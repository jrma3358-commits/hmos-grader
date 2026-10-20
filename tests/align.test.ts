// C·논술 4단계 — 논제 급소 ↔ 제시문 단락 급소 연결, 사족 (오종래 2026-10-13: 논제 급소가 어느 단락 급소와도 연결되지 않으면 사족)
// 표지는 봉인 값이 아니라 테스트용 가짜 표지다 (passage.test.ts와 같다). B = SB(~를), Q = SQ(설명하시오)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, build_path_graph, describeCombination, recognizePassage } from '../src/fq/index.ts';
import type { V2Analysis } from '../src/fq/pipeline.ts';
import type { SealedSwitch, SealedTable } from '../src/fq/sealed/schema.ts';
import type { Color } from '../src/fq/types.ts';
import { align_passage, background_passage } from '../src/thesis/align.ts';
import { background_paragraphs } from '../src/thesis/background.ts';

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
const 제시문 = recognizePassage('[가] 다수결 원칙를 본다.\n\n[나] 만장일치 제도를 본다.\n\n[다] 날씨를 본다.', table);

describe('align_passage', () => {
  it('논제 급소를 열쇠로 선 단락 급소가 그 급소의 연결이다', () => {
    const r = align_passage([{ 번호: '1-1', 참조: [], 인식: 인식('다수결를 설명하시오.') }], 제시문);
    assert.deepEqual(r.연결, [{ 소문항: '1-1', 급소: '다수결', 덩어리: '다수결', 노드: r.연결[0].노드, 단락: [{ 단락: '가', 단락급소: '다수결 원칙', 자리: '서두' }] }]);
    assert.deepEqual(r.사족, []);
  });

  it('사족 — 논제 급소가 어느 단락 급소와도 연결되지 않는다', () => {
    const r = align_passage([{ 번호: '1-2', 참조: [], 인식: 인식('국민투표를 설명하시오.') }], 제시문);
    assert.deepEqual(r.연결[0].단락, []);
    assert.deepEqual(r.사족, [{ 소문항: '1-2', 급소: '국민투표' }]);
  });

  it('참조 범위 밖 단락의 급소는 연결이 아니다', () => {
    const r = align_passage([{ 번호: '2-1', 참조: ['나', '다'], 인식: 인식('다수결를 설명하시오.') }], 제시문);
    assert.deepEqual(r.사족, [{ 소문항: '2-1', 급소: '다수결' }]);
    assert.deepEqual(r.소문항[0].연결.outOfScope, [0]);
  });

  it('소문항마다 따로 잇는다', () => {
    const r = align_passage(
      [
        { 번호: '1-1', 참조: [], 인식: 인식('다수결를 설명하시오.') },
        { 번호: '1-2', 참조: [], 인식: 인식('만장일치를 설명하시오.') },
      ],
      제시문,
    );
    assert.deepEqual(
      r.연결.map((x) => [x.소문항, x.단락.map((d) => d.단락)]),
      [
        ['1-1', ['가']],
        ['1-2', ['나']],
      ],
    );
    assert.deepEqual(r.사족, []);
  });

  it('논제가 기호로 짚은 단락은 지정 연결 — 사족이 아니다 (오종래 2026-10-15 안 A)', () => {
    const r = align_passage([{ 번호: '1', 참조: [], 인식: 인식('(다)를 설명하시오.') }], 제시문);
    assert.deepEqual(r.연결.map((x) => x.단락), [[{ 단락: '다', 단락급소: '', 자리: '지정' }]]);
    assert.deepEqual(r.사족, []);
  });

  it('급소가 서지 않은 소문항은 사족을 가리지 않는다', () => {
    const r = align_passage([{ 번호: null, 참조: [], 인식: 인식('설명하시오.') }], 제시문);
    assert.deepEqual(r.연결, []);
    assert.deepEqual(r.사족, []);
  });
});

// 라벨 없는 단일 제시문 [오종래 2026-10-20 확정] — 〈제시문〉 뒤 한 덩어리 본문은 통째로 배경 P (숭실대 인문논술 다수결)
describe('background_passage — 라벨 없는 단일 제시문', () => {
  it('제시문이 하나이고 라벨이 없으면 그 본문', () => {
    assert.equal(background_passage([{ id: '제시문', 텍스트: ' 오늘날 민주주의는 … 주장한다. ' }]), '오늘날 민주주의는 … 주장한다.');
  });
  it('라벨 있는 제시문([가] · [I])은 기존대로 — null', () => {
    assert.equal(background_passage([{ id: '가', 텍스트: '…' }]), null);
    assert.equal(background_passage([{ id: 'I', 텍스트: '…' }]), null);
    assert.equal(background_passage([{ id: '가', 텍스트: '…' }, { id: '나', 텍스트: '…' }]), null);
  });
});

// 배경 제시문 단락 실체 [오종래 2026-10-20 확정 — 정의문 우선] (숭실대 인문논술 다수결)
describe('background_paragraphs — 단락마다 실체 하나', () => {
  const 글 = [
    '오늘날 민주주의는 자유와 평등의 원리를 가장 잘 구현하는 정치체제로 알려져 있다. 의사결정 과정에서 공동체의 다수가 원하는 방안을 선택하는 다수결 원칙은 민주주의의 작동과정에서 핵심적인 위치를 차지한다.',
    '첫 번째 방식은 만장일치에 의한 의사결정이다. 만장일치를 선호하는 사람들은 다수결에 의해 도출된 결과가 소수의 이익을 침해할 수 있음을 지적한다.',
    '두 번째 방식은 공동체의 의사결정을 소수에게 위임하는 것이다. 이러한 방식의 필요성은 고대 아테네 민주주의 이래로 꾸준히 제기되어 왔다.',
  ].join('\n\n');
  it('정의문 → 논제 실체 순서', () => {
    const r = background_paragraphs(글, ['다수결 원칙', '그 이유']);
    assert.deepEqual(r.map((p) => [p.라벨, p.근거, p.실체]), [
      ['#1', '논제 실체', '다수결 원칙'],
      ['#2', '정의문', '만장일치에 의한 의사결정'],
      ['#3', '정의문', '공동체의 의사결정을 소수에게 위임하는 것'],
    ]);
    assert.match(r[0].문장, /^의사결정 과정에서 .*다수결 원칙은/);
  });
  it('정의문도 논제 실체도 없으면 첫 문장 급소', () => {
    assert.equal(background_paragraphs(글.split('\n\n')[0], [])[0].근거, '첫 문장 급소');
  });
});
