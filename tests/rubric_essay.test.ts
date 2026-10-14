// 인문논술 F2 세우기 — 봉인② (오종래 2026-10-14):
// 세우기 조각 수 = 논제가 요구하는 실체를 서술한 실질 문장 수 = 소문항 급소와 엔진이 연결한 제시문 단락의 모든 문장.
// 풀기는 내지 않는다. 연결문장이 없으면(수리·서술형) 노드 규칙 그대로.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2, link_sentences, split_sentences } from '../src/rubric/f2.ts';
import { allocate_points } from '../src/rubric/f5.ts';
import { spread_piece } from '../src/rubric/f6.ts';
import { specify_condition } from '../src/rubric/f4.ts';

const 논제 = 'A국의 보호무역 정책으로 인한 손실을 줄이기 위해, B국이 시행한 대응조치는 무엇인지 설명하시오.';
const 다 =
  'B국은 무역 의존도가 높은 국가로, A국의 보호무역 정책 때문에 주요 수출품의 가격 경쟁력이 약화하여 수출이 감소하였다. ' +
  '이에 따라 B국 기업의 수익이 줄어들고 B국의 상품수지도 악화하였다. ' +
  '그럼에도 불구하고 B국 정부는 연구개발(R&D) 지원과 자유무역협정(FTA) 다변화 정책을 추진하였다.';

describe('split_sentences', () => {
  it('문장 끝 부호 뒤 공백에서 나눈다 — 괄호 속 약어·쉼표는 나누지 않는다', () => {
    assert.equal(split_sentences(다).length, 3);
    assert.deepEqual(split_sentences('하나다.\n\n둘인가? 셋!'), ['하나다.', '둘인가?', '셋!']);
    assert.deepEqual(split_sentences('   '), []);
  });
});

describe('link_sentences', () => {
  const 단락들 = [
    { 라벨: '가', 텍스트: '가 첫 문장이다. 가 둘째 문장이다.' },
    { 라벨: '다', 텍스트: 다 },
    { 라벨: '다', 텍스트: '같은 기호를 잇는 단락이다.' },
  ];
  it('연결된 라벨의 단락 문장 전부 — 같은 라벨 단락은 모두, 연결 안 된 단락은 빼고', () => {
    const r = link_sentences(단락들, [{ 단락: '다', 단락급소: '대응' }]);
    assert.equal(r.length, 4);
    assert.ok(r.every((x) => x.단락 === '다' && x.단락급소 === '대응'));
  });
  it('한 라벨에 연결이 둘이어도 문장은 한 번 — 실체는 첫 연결의 단락 급소', () => {
    const r = link_sentences(단락들, [
      { 단락: '가', 단락급소: '첫' },
      { 단락: '가', 단락급소: '둘' },
    ]);
    assert.deepEqual(r.map((x) => x.단락급소), ['첫', '첫']);
  });
  it('연결이 없으면 빈 배열', () => {
    assert.deepEqual(link_sentences(단락들, []), []);
  });
});

describe('F2 인문논술 세우기 (연결문장이 있을 때)', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis(논제));
  assert.ok(입력.ok);
  const { 물음, k, 인식 } = 입력;
  const 연결문장 = link_sentences([{ 라벨: '다', 텍스트: 다 }], [{ 단락: '다', 단락급소: '연구개발(R&D) 지원' }]);
  const 조각 = derive_pieces(물음, k, { ...인식, 연결문장 });

  it('세우기 = 연결 단락 문장 수, 조각마다 근거 문장 · 요소 p · 노드 없음', () => {
    const 세우기 = 조각.filter((c) => c.파트 === '세우기');
    assert.equal(세우기.length, 3);
    assert.deepEqual(세우기.map((c) => c.id), ['세우기-1', '세우기-2', '세우기-3']);
    assert.ok(세우기.every((c) => c.node === null && c.요소 === 'p' && c.근거?.단락 === '다'));
    assert.equal(세우기[1].근거?.문장, '이에 따라 B국 기업의 수익이 줄어들고 B국의 상품수지도 악화하였다.');
  });

  it('풀기는 없다', () => {
    assert.equal(조각.filter((c) => c.파트 === '풀기').length, 0);
  });

  it('근거대기·답구하기는 노드 규칙 그대로', () => {
    const 노드규칙 = derive_pieces(물음, k, 인식);
    for (const 파트 of ['근거대기', '답구하기'] as const) {
      assert.deepEqual(
        조각.filter((c) => c.파트 === 파트).map((c) => c.node?.id),
        노드규칙.filter((c) => c.파트 === 파트).map((c) => c.node?.id),
      );
    }
  });

  it('F4 충족조건·F6 모범조각이 노드 없는 세우기 조각에서 선다 (인문 틀은 {실체}가 없다)', () => {
    const c = 조각.find((x) => x.파트 === '세우기')!;
    assert.equal(specify_condition(c, '인문사회국어'), '논지를 정확히 서술하고 있다.');
    assert.equal(spread_piece(c, k, '인문사회국어'), '논지에 대한 근거의 주장이 적합하다.');
  });

  it('풀기 배점은 봉인④ 결손재분배로 미배정에 든다', () => {
    const 배점 = allocate_points(조각, 10, '인문사회국어');
    assert.ok(배점.미배정.includes('풀기'));
  });

  it('연결 단락이 없으면 세우기 0 · 풀기 0', () => {
    const 빈 = derive_pieces(물음, k, { ...인식, 연결문장: [] });
    assert.equal(빈.filter((c) => c.파트 === '세우기' || c.파트 === '풀기').length, 0);
  });
});

describe('연결문장이 없으면 노드 규칙 그대로 (수리·서술형)', () => {
  it('세우기 = C·P 노드, 풀기 = 세우기와 1:1', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis('17. 다항함수 f(x)에 대하여 f\'(x)=9x²+4x이고 f(1)=6일 때, f(2)의 값을 구하시오. [3점]'));
    assert.ok(입력.ok);
    const 조각 = derive_pieces(입력.물음, 입력.k, 입력.인식);
    const 세우기 = 조각.filter((c) => c.파트 === '세우기');
    const 풀기 = 조각.filter((c) => c.파트 === '풀기');
    assert.ok(세우기.length > 0 && 세우기.every((c) => c.node !== null && !c.근거));
    assert.deepEqual(풀기.map((c) => c.node?.id), 세우기.map((c) => c.node?.id));
  });
});
