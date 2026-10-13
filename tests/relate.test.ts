// C·논술 6단계 — 단락 급소 관계·6유형·논제 뼈대·추가/보완 [봉인⑭] (오종래 2026-10-14)
// 표지는 봉인 값이 아니라 테스트용 가짜 표지다 (align.test.ts와 같다). B = SB(~를), Q = SQ(설명하시오)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze_pivot, build_path_graph, describeCombination, recognizePassage } from '../src/fq/index.ts';
import type { V2Analysis } from '../src/fq/pipeline.ts';
import type { SealedSwitch, SealedTable } from '../src/fq/sealed/schema.ts';
import type { Color } from '../src/fq/types.ts';
import { align_passage } from '../src/thesis/align.ts';
import { 같은종류, 봉인14_6단계, 봉인14_단락관계 } from '../src/thesis/relate.ts';

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
const 엔진 = (제시문: string, 소문항: [string, string, string[]][]) => {
  const passage = recognizePassage(제시문, table);
  const 정합 = align_passage(
    소문항.map(([번호, q, 참조]) => ({ 번호, 참조, 인식: 인식(q) })),
    passage,
  );
  return { 정합, passage };
};
const 관계 = (제시문: string, 소문항: [string, string, string[]][]) => {
  const { 정합, passage } = 엔진(제시문, 소문항);
  return 봉인14_단락관계(정합, passage);
};
const 육 = (제시문: string, 소문항: [string, string, string[]][]) => {
  const { 정합, passage } = 엔진(제시문, 소문항);
  return 봉인14_6단계(정합, passage);
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
    assert.deepEqual(r[0].유형, ['선택·응용']);
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

describe('봉인14_6단계 — 비교 불가 · 논제 뼈대 · 행선', () => {
  const 따로 = (_제시문: string): [string, string, string[]][] => [
    ['1', '다수결를 설명하시오.', ['가']],
    ['2', '만장일치를 설명하시오.', ['다']],
  ];

  it('유사·대비가 하나도 없으면 비교 불가', () => {
    const r = 육('[가] 다수결를 본다.\n\n[다] 만장일치 제도를 본다.', 따로(''));
    assert.equal(r.비교불가, true);
    assert.deepEqual(r.관계.map((x) => x.실체.관계), ['병렬']);
  });

  it('대비가 있으면 비교 가능 — 뼈대는 두 단락 기호와 두 급소 실체를 품는다', () => {
    const r = 육('[다] B국이 시행한 대응조치를 본다.\n\n[마] D국이 시행한 정책를 본다.', [
      ['1-2', 'B국이 시행한 대응조치를 설명하시오.', ['다']],
      ['2-2', 'D국이 시행한 정책를 설명하시오.', ['마']],
    ]);
    assert.equal(r.비교불가, false);
    assert.deepEqual(r.추가후보.map((c) => c.유형), ['비교·대비', '선택·응용', '인연·비판']);
    const [비교, 선택, 비판] = r.추가후보;
    assert.equal(비교.뼈대, '제시문 [다], [마]를 참고하여 [다]의 B국이 시행한 대응조치와 [마]의 D국이 시행한 정책을 비교하여 설명하시오.');
    assert.equal(선택.뼈대, '제시문 [다], [마]를 참고하여 [다]의 B국이 시행한 대응조치와 [마]의 D국이 시행한 정책 가운데 하나를 선택하여 근거를 들어 논하시오.');
    assert.equal(비판.뼈대, '제시문 [다], [마]를 참고하여 [다]의 B국이 시행한 대응조치의 입장에서 [마]의 D국이 시행한 정책을 비판적으로 서술하시오.');
    assert.deepEqual(비교.실체들, ['B국이 시행한 대응조치', 'D국이 시행한 정책']);
    assert.deepEqual(비교.단락, ['다', '마']);
  });

  it('보완 관계의 뼈대 — 채움으로 빈 곳을 뒷받침 / 빈 곳의 문제에 채움으로 대안', () => {
    const r = 육('[가] 다수결를 본다.\n\n[다] 만장일치 제도를 본다. 다수결 보완책를 본다. 만장일치 제도를 본다.', 따로(''));
    assert.deepEqual(
      r.추가후보.map((c) => c.뼈대),
      [
        '제시문 [가], [다]를 참고하여 [다]의 다수결 보완책을 근거로 [가]의 다수결에 대한 주장을 뒷받침하시오.',
        '제시문 [가], [다]를 참고하여 [가]의 다수결이 지닌 문제를 분석하고, [다]의 다수결 보완책을 바탕으로 대안을 제시하시오.',
      ],
    );
  });

  it('보완 판단은 5단계 진단 「보완」으로 — 끌어들일 단락과 이미 연결된 단락', () => {
    const r = 육('[가] 다수결를 본다.\n\n[다] 만장일치 제도를 본다.', [
      ['1', '다수결를 설명하시오.', ['가', '다']],
      ['2', '만장일치를 설명하시오.', ['다']],
    ]);
    assert.deepEqual(r.추가후보, []);
    assert.equal(r.보완.length, 1);
    assert.deepEqual(
      { 갈래: r.보완[0].갈래, 단위: r.보완[0].단위, 단락: r.보완[0].단락, 급소: r.보완[0].급소, 연결단락: r.보완[0].연결단락, 관계: r.보완[0].관계 },
      { 갈래: '보완', 단위: '1', 단락: '다', 급소: '만장일치 제도', 연결단락: '가', 관계: '병렬' },
    );
  });

  it('덮음은 추가도 보완도 내지 않는다', () => {
    const r = 육('[가] 다수결 원칙를 본다.\n\n[나] 다수결 원칙를 본다.', [['1', '다수결를 설명하시오.', []]]);
    assert.deepEqual([r.추가후보, r.보완], [[], []]);
    assert.equal(r.비교불가, false);
  });
});
