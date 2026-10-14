// 인문논술 F2 세우기 — 봉인② (오종래 2026-10-14):
// 세우기 조각 수 = 논제가 요구하는 실체를 서술한 실질 문장 수 = 소문항 급소와 엔진이 연결한 제시문 단락의 모든 문장.
// 풀기는 내지 않는다. 연결문장이 없으면(수리·서술형) 노드 규칙 그대로.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2, link_sentences, split_sentences } from '../src/rubric/f2.ts';
import { judge_element } from '../src/rubric/f3.ts';
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

// 서술·논술형 ④ 답구하기 — 봉인② (오종래 2026-10-14): 값 일치가 아니라 경로 추적.
// 대상 = 엔진 급소 K (급소 복수면 조각마다 하나), 경로 = 제시문 단락급소 → 논제 K 앞 노드 → K, 충족 = K + 경로 흔적 하나 이상
describe('④ 답구하기 서술·논술형 (계열 인문사회국어)', () => {
  const 조각of = (논제글: string, 단락연결?: { 노드: string; 단락: string; 단락급소: string }[]) => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(논제글));
    assert.ok(입력.ok);
    return { 입력, 조각: derive_pieces(입력.물음, 입력.k, { ...입력.인식, ...(단락연결 ? { 단락연결 } : {}) }, '인문사회국어').filter((c) => c.파트 === '답구하기') };
  };

  it('대상 = 엔진 급소 K — 「무엇」 같은 간접의문 Q는 조각이 아니다', () => {
    const { 입력, 조각 } = 조각of(논제);
    assert.equal(조각.length, 1);
    assert.equal(조각[0].node?.id, 입력.k.node.id);
    assert.equal(조각[0].is_중심, true);
  });

  it('경로 = 제시문 단락급소 → 논제 K 앞 노드 → K (마지막이 k)', () => {
    const { 입력, 조각 } = 조각of(논제, [{ 노드: '', 단락: '다', 단락급소: 'B국' }]);
    // 단락연결의 노드가 K가 아니면 제시문 경로에 들지 않는다
    assert.ok(조각[0].경로!.every((p) => p.출처 === '논제'));
    const 맞음 = 조각of(논제, [{ 노드: 입력.k.node.id, 단락: '다', 단락급소: 'B국' }, { 노드: 입력.k.node.id, 단락: '다', 단락급소: '중복' }]).조각[0].경로!;
    assert.deepEqual(맞음.map((p) => `${p.출처}:${p.색}:${p.실체}`), [
      '제시문:b:B국',
      '논제:b:A국의 보호무역 정책으로 인한 손실',
      '논제:k:B국이 시행한 대응조치',
    ]);
  });

  it('급소가 여럿이면 조각마다 하나 — 뒤 급소의 논제 경로는 앞 물음 Q 뒤부터, 머리 쉼표는 뗀다', () => {
    const { 조각 } = 조각of('C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.');
    assert.equal(조각.length, 2);
    assert.ok(조각.every((c) => c.is_중심));
    assert.equal(조각[0].경로!.at(-1)!.실체, '구조적 약점');
    assert.ok(조각[0].경로!.length > 1);
    assert.deepEqual(조각[1].경로!.map((p) => p.실체), ['국내 물가 상승의 이유']);
  });

  it('충족조건 = 급소 흔적 + 경로 표지 흔적 (완전일치 아님)', () => {
    const { 입력, 조각 } = 조각of(논제, []);
    const c = { ...조각[0], 요소: 'k' as const };
    assert.equal(
      specify_condition(c, '인문사회국어'),
      '급소 「B국이 시행한 대응조치」에 닿았다 — 경로 b「A국의 보호무역 정책으로 인한 손실」 → k「B국이 시행한 대응조치」 위에서 급소 흔적과 경로 표지 흔적 하나 이상이 답안에 남아 있다.',
    );
    assert.ok(입력.ok);
  });

  it('수리는 Q 대상 규칙(값 일치) 그대로 — 계열을 주지 않아도 같다', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(논제));
    assert.ok(입력.ok);
    const 수리 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리').filter((c) => c.파트 === '답구하기');
    const 없음 = derive_pieces(입력.물음, 입력.k, 입력.인식).filter((c) => c.파트 === '답구하기');
    assert.deepEqual(수리.map((c) => c.node?.id), 없음.map((c) => c.node?.id));
    assert.equal(수리.length, 2); // B국이 시행한 대응조치 · 무엇 (Q 앞 노드마다)
    assert.ok(수리.every((c) => !c.경로));
    assert.equal(specify_condition({ ...수리[0], 요소: 'k' }, '수리'), '질문의 급소에서 요구된 값과 일치했다.');
  });
});

// ① 근거대기 — 봉인② (오종래 2026-10-14): K 조각을 뺀다 (K는 ④에서만), 조각 = b·d·c·p 노드.
// C·P가 ①로 가므로 수리·서술형 ② 세우기는 노드에서 세지 않는다 (규칙 미정 — 조각 없음, ③ 풀기도 없음)
describe('① 근거대기 = b·d·c·p, 급소 K 제외', () => {
  const 수능17 = "17. 다항함수 f(x)에 대하여 f'(x)=9x²+4x이고 f(1)=6일 때, f(2)의 값을 구하시오. [3점]";

  it('급소 K는 ①에 없고 ④에만 — 수리', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 조각 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    const 근거 = 조각.filter((c) => c.파트 === '근거대기');
    assert.ok(근거.every((c) => c.node?.id !== 입력.k.node.id && !c.is_중심));
    assert.ok(조각.some((c) => c.파트 === '답구하기' && c.node?.id === 입력.k.node.id));
  });

  it('C·P 노드도 ① 조각 — F3 요소는 노드 색 그대로 (P→p, 접힌 C는 B라 b)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 근거 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리')
      .filter((c) => c.파트 === '근거대기')
      .map((c) => ({ ...c, 요소: judge_element(c, '수리') }));
    assert.deepEqual(근거.map((c) => `${c.node?.color}:${c.요소}`), ['P:p', 'B:b']);
  });

  it('급소가 여럿이면 전부 ①에서 뺀다 — 논술 (2-1)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis('C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.'));
    assert.ok(입력.ok);
    const 급소 = new Set(입력.인식.급소들!.map((g) => g.node.id));
    assert.equal(급소.size, 2);
    const 근거 = derive_pieces(입력.물음, 입력.k, 입력.인식, '인문사회국어').filter((c) => c.파트 === '근거대기');
    assert.ok(근거.length > 0 && 근거.every((c) => !급소.has(c.node!.id)));
    assert.ok(근거.some((c) => c.node?.color === 'C') && 근거.some((c) => c.node?.color === 'P'));
  });

  it('수리·서술형(연결문장 없음) ② 세우기·③ 풀기 없음 — 배점은 봉인④ 결손재분배', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 조각 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    assert.equal(조각.filter((c) => c.파트 === '세우기' || c.파트 === '풀기').length, 0);
    const 배점 = allocate_points(조각, 10, '수리');
    assert.deepEqual([...배점.미배정].sort(), ['세우기', '풀기'].sort());
  });
});
