// 인문논술 F2 세우기 — 봉인② (오종래 2026-10-14):
// 세우기 조각 수 = 논제가 요구하는 실체를 서술한 실질 문장 수 = 소문항 급소와 엔진이 연결한 제시문 단락의 모든 문장.
// 풀기는 내지 않는다. 연결문장이 없으면(수리·서술형) 노드 규칙 그대로.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { derive_pieces, f2_input_from_v2, filter_by_polarity, link_sentences, speaker_lines, split_sentences, thesis_polarity } from '../src/rubric/f2.ts';
import { judge_element } from '../src/rubric/f3.ts';
import { K핵심어, 마지막명사 } from '../src/rubric/sealed/f2.ts';
import { 봉인4a_반올림 } from '../src/rubric/sealed/f5.ts';
import { 봉인6_조각대조 } from '../src/rubric/sealed/g1.ts';
import { allocate_points } from '../src/rubric/f5.ts';
import { spread_piece } from '../src/rubric/f6.ts';
import { specify_condition } from '../src/rubric/f4.ts';
import { split_solve_lines } from '../src/rubric/solve_lines.ts';

const 논제 = 'A국의 보호무역 정책으로 인한 손실을 줄이기 위해, B국이 시행한 대응조치는 무엇인지 설명하시오.';
const 다 =
  'B국은 무역 의존도가 높은 국가로, A국의 보호무역 정책 때문에 주요 수출품의 가격 경쟁력이 약화하여 수출이 감소하였다. ' +
  '이에 따라 B국 기업의 수익이 줄어들고 B국의 상품수지도 악화하였다. ' +
  '그럼에도 불구하고 B국 정부는 연구개발(R&D) 지원과 자유무역협정(FTA) 다변화 정책을 추진하였다.';

// [오종래 2026-10-15 (가)] 봉인④-a 큰 나머지 방식 — 마지막 몫이 나머지를 떠안아 음수가 되던 것
describe('봉인④-a 반올림 — 큰 나머지 방식', () => {
  it('1.1점을 7몫 — 음수 없이 합이 맞고, 몫끼리 차이는 0.1 이하', () => {
    const r = 봉인4a_반올림(1.1, Array(7).fill(1.1 / 7));
    assert.ok(r.every((x) => x >= 0), JSON.stringify(r));
    assert.equal(Math.round(r.reduce((a, b) => a + b, 0) * 10), 11);
    assert.ok(Math.max(...r) - Math.min(...r) <= 0.1 + 1e-9);
  });

  it('끝수가 큰 몫부터 0.1씩 — 같으면 뒤 몫 먼저 (옛 규칙 「마지막 칸」과 같은 결과)', () => {
    assert.deepEqual(봉인4a_반올림(1, [0.24, 0.36, 0.4]), [0.2, 0.4, 0.4]);
    assert.deepEqual(봉인4a_반올림(1, [1 / 3, 1 / 3, 1 / 3]), [0.3, 0.3, 0.4]);
    assert.deepEqual(봉인4a_반올림(10, [2.2, 3.3, 2.2, 2.3]), [2.2, 3.3, 2.2, 2.3]);
  });
});

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

describe('F2 인문논술 세우기 (계열 인문사회국어)', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis(논제));
  assert.ok(입력.ok);
  const { 물음, k, 인식 } = 입력;
  const 연결문장 = link_sentences([{ 라벨: '다', 텍스트: 다 }], [{ 단락: '다', 단락급소: '연구개발(R&D) 지원' }]);
  const 조각 = derive_pieces(물음, k, { ...인식, 연결문장 }, '인문사회국어');

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

  it('근거대기·답구하기는 연결문장과 무관하다', () => {
    const 노드규칙 = derive_pieces(물음, k, 인식, '인문사회국어');
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
    const 빈 = derive_pieces(물음, k, { ...인식, 연결문장: [] }, '인문사회국어');
    assert.equal(빈.filter((c) => c.파트 === '세우기' || c.파트 === '풀기').length, 0);
  });

  it('연결문장이 있어도 수리 계열이면 수리 구조 — 세우기는 C·P 노드', () => {
    const 수리 = derive_pieces(물음, k, { ...인식, 연결문장 }, '수리');
    assert.ok(수리.filter((c) => c.파트 === '세우기').every((c) => c.node !== null && !c.근거));
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
      '급소 「B국이 시행한 대응조치」(핵심어 「대응조치」)에 닿았다 — 경로 b「A국의 보호무역 정책으로 인한 손실」 → k「B국이 시행한 대응조치」 위에서 급소 흔적과 경로 표지 흔적 하나 이상이 답안에 남아 있다.',
    );
    assert.ok(입력.ok);
  });

  it('K 핵심어 = 급소 실체의 마지막 명사 (마지막 어절, 앞뒤 문장부호 뗌)', () => {
    assert.equal(조각of(논제).조각[0].경로!.at(-1)!.핵심어, '대응조치');
    const 둘 = 조각of('C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.').조각;
    assert.deepEqual(둘.map((c) => c.경로!.at(-1)!.핵심어), ['약점', '국내 물가 상승']);
    assert.equal(마지막명사('영향'), '영향');
    assert.equal(마지막명사(", 'A의 값'"), '값');
    assert.equal(마지막명사(' (가) '), '가');
    assert.equal(마지막명사('…'), '…');
  });

  it('K 핵심어 — 질문 표지어(이유·영향·방안·차이·공통점)는 떼고 지목 대상 실체', () => {
    assert.equal(K핵심어('국내 물가 상승의 이유'), '국내 물가 상승');
    assert.equal(K핵심어('두 정책의 차이'), '두 정책');
    assert.equal(K핵심어('갈등을 줄일 방안'), '갈등을 줄일');
    assert.equal(K핵심어('영향'), '영향'); // 앞에 남는 말이 없으면 그대로
    assert.equal(K핵심어('B국이 시행한 대응조치'), '대응조치'); // 표지어가 아니면 마지막 명사
  });

  it('K 핵심어 — 서술형 끝은 서술 어미를 떼고 마지막 명사구', () => {
    assert.equal(K핵심어("'0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'"), '부등식 sinx ≥ xcosx');
    assert.equal(K핵심어('B국의 대응은 기술 경쟁력 강화이다'), '기술 경쟁력 강화');
    assert.equal(K핵심어('두 사건의 원인이 같다'), '같다'); // 목록 밖 서술어(같다)는 서술형으로 보지 않는다 — 마지막 명사 규칙
    // 알려진 한계 — 관형형 「-는」(오르는)을 조사 「는」으로 읽어 경계가 서서 명사구가 「이유」만 남고, 표지어를 떼면 남는 말이 없어 「이유」 그대로
    assert.equal(K핵심어('물가가 오르는 이유이다'), '이유');
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

// 인문논술 ① 근거대기 + 제시문 단락 급소 — 봉인② (오종래 2026-10-14):
// 논제 노드(b·d·c·p, K 제외) + 4단계 엔진이 연결한 제시문 단락 급소, 둘 다 ① 조각. 논제가 시킨 것 + 제시문에서 실제 가져온 것
describe('인문 ① 근거대기 — 논제 노드 + 제시문 연결 단락 급소', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis(논제));
  assert.ok(입력.ok);
  const { 물음, k, 인식 } = 입력;
  const 단락연결 = [
    { 노드: k.node.id, 단락: '다', 단락급소: 'B국' },
    { 노드: 'n9', 단락: '다', 단락급소: 'B국' }, // 같은 짝 — 하나로
    { 노드: k.node.id, 단락: '나', 단락급소: ', 보호무역 정책' }, // 머리 쉼표는 뗀다
  ];
  const 근거of = (계열: '수리' | '인문사회국어', 연결 = 단락연결) =>
    derive_pieces(물음, k, { ...인식, 단락연결: 연결 }, 계열).filter((c) => c.파트 === '근거대기');

  it('논제 노드 다음에 (단락·단락급소) 짝마다 하나 — 노드 없음 · 요소 b', () => {
    const 논제만 = 근거of('인문사회국어', []);
    const 근거 = 근거of('인문사회국어');
    assert.equal(근거.length, 논제만.length + 2);
    const 제시문 = 근거.slice(논제만.length);
    assert.deepEqual(제시문.map((c) => `${c.id}:${c.제시문?.단락}:${c.제시문?.단락급소}`), [
      `근거대기-${논제만.length + 1}:다:B국`,
      `근거대기-${논제만.length + 2}:나:보호무역 정책`,
    ]);
    assert.ok(제시문.every((c) => c.node === null && judge_element(c, '인문사회국어') === 'b'));
  });

  it('F4 충족조건 · F6 모범조각의 {실체} = 단락 급소', () => {
    const c = 근거of('인문사회국어').find((x) => x.제시문)!;
    assert.equal(specify_condition(c, '인문사회국어'), '「B국」의 개념·근거를 서술했는가');
    assert.equal(spread_piece(c, k, '인문사회국어'), 'B국에 대하여 이해하고 있다.');
  });

  it('F4 ① 문구 계열별 · F4·F6 실체 머리 쉼표 제거 (오종래 2026-10-14)', () => {
    const 쉼표 = { ...근거of('인문사회국어').find((x) => x.제시문)!, 제시문: { 단락: '나', 단락급소: ', 보호무역' } };
    assert.equal(specify_condition(쉼표, '인문사회국어'), '「보호무역」의 개념·근거를 서술했는가');
    assert.equal(specify_condition(쉼표, '수리'), '「보호무역」의 조건·정의를 제시했는가');
    assert.equal(spread_piece(쉼표, k, '인문사회국어'), '보호무역에 대하여 이해하고 있다.');
  });

  it('수리는 제시문 단락 급소를 ①에 넣지 않는다', () => {
    assert.ok(근거of('수리').every((c) => c.node !== null && !c.제시문));
  });
});

// 계열별 파트 구조 — 봉인② (오종래 2026-10-14). 두 계열 모두 ① 근거대기에서 급소 K를 뺀다 (K는 ④에서만):
//   수리 ① b·d · ② c·p 노드(식 세우기) · ③ ②와 1:1 · ④ K 값 일치
//   인문 ① b·d·c·p · ② 논제 실체 서술 문장 · ③ 없음 · ④ K 경로 흔적 도달
describe('계열별 파트 구조 · ① 급소 K 제외', () => {
  const 수능17 = "17. 다항함수 f(x)에 대하여 f'(x)=9x²+4x이고 f(1)=6일 때, f(2)의 값을 구하시오. [3점]";

  it('급소 K는 ①에 없고 ④에만 — 수리', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 조각 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    const 근거 = 조각.filter((c) => c.파트 === '근거대기');
    assert.ok(근거.every((c) => c.node?.id !== 입력.k.node.id && !c.is_중심));
    assert.ok(조각.some((c) => c.파트 === '답구하기' && c.node?.id === 입력.k.node.id));
  });

  // [오종래 2026-10-20] 함숫값 지정 조건 「f'(x)=…이고 f(1)=6일 때」는 접지 않는 C — ① 근거대기가 아니라 ② 세우기로 간다
  it('수리 ① = b·d — C·P 노드는 ② 세우기로 (함숫값 지정 「~일 때」는 C)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 조각 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리').map((c) => ({ ...c, 요소: judge_element(c, '수리') }));
    assert.deepEqual(조각.filter((c) => c.파트 === '근거대기').map((c) => `${c.node?.color}:${c.요소}`), []);
    assert.deepEqual(조각.filter((c) => c.파트 === '세우기').map((c) => `${c.node?.color}:${c.요소}`), ['P:c', 'C:c']);
  });

  it('수리 ③ 풀기 = ②와 1:1 · 계열을 주지 않으면 수리 구조', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 조각 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    assert.deepEqual(
      조각.filter((c) => c.파트 === '풀기').map((c) => c.node?.id),
      조각.filter((c) => c.파트 === '세우기').map((c) => c.node?.id),
    );
    const 없음 = derive_pieces(입력.물음, 입력.k, 입력.인식);
    assert.deepEqual(없음.map((c) => `${c.id}:${c.node?.id}`), 조각.map((c) => `${c.id}:${c.node?.id}`));
  });

  // [오종래 2026-10-16] 수리도 교사 모범답안 줄 단위 — 줄이 있으면 줄 하나 = 풀기 하나(노드 없음 · 교사 판정), 없으면 ②와 1:1
  it('수리 ③ 풀기 — 모범답안 풀기 줄이 있으면 줄마다 조각 (판정은 교사)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 뼈대 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    const 세우기 = 뼈대.find((c) => c.파트 === '세우기')!.node!.entity.trim();
    const 답 = 뼈대.find((c) => c.파트 === '답구하기')!.node!.entity.trim();
    const 답안 = [`${세우기}에서 f(x)=3x³+2x²+C이다.`, 'x=1을 넣으면 3+2+C=6이므로 C=1이다.', '따라서 f(x)=3x³+2x²+1이다.', `${답}은 24+8+1=33이다.`].join('\n');
    const 구간 = split_solve_lines(답안, 뼈대);
    assert.deepEqual(구간.풀기, ['x=1을 넣으면 3+2+C=6이므로 C=1이다.', '따라서 f(x)=3x³+2x²+1이다.']);
    const 조각 = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 교사풀기: 구간.풀기 }, '수리');
    const 풀기 = 조각.filter((c) => c.파트 === '풀기');
    assert.deepEqual(풀기.map((c) => c.풀기글), 구간.풀기);
    assert.ok(풀기.every((c) => c.node === null && judge_element(c, '수리') === null));
    // ①②④는 줄과 상관없이 그대로
    assert.deepEqual(조각.filter((c) => c.파트 !== '풀기').map((c) => c.id), 뼈대.filter((c) => c.파트 !== '풀기').map((c) => c.id));
    // 배점 — 조각이 선 수리 파트는 모두 배점 · 충족조건에 그 줄 · 채점은 교사. ① 근거대기는 조각이 없어 미배정 (2026-10-20 「~일 때」 C)
    assert.deepEqual(allocate_points(조각, 10, '수리').미배정, ['근거대기']);
    assert.match(specify_condition(풀기[0], '수리'), /모범답안 풀기-1: 「x=1을 넣으면/);
    const 맥락 = { 답노드: [], 질문급소: 입력.k, 계열: '수리' as const, 루브릭: 조각 as any, 앞결과: new Map() };
    assert.equal(봉인6_조각대조('아무 답', 풀기[0] as any, 맥락).결과, '판정불가');
  });

  it('인문 ① = b·d·c·p — F3 요소는 노드 색 그대로', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis('A국과 C국의 무역분쟁으로 인한 손실을 줄이기 위해, D국이 시행한 정책이 자국의 경제에 어떤 도움이 될 수 있는지 설명하시오.'));
    assert.ok(입력.ok);
    const 근거 = derive_pieces(입력.물음, 입력.k, 입력.인식, '인문사회국어')
      .filter((c) => c.파트 === '근거대기')
      .map((c) => ({ ...c, 요소: judge_element(c, '인문사회국어') }));
    // 「A국과 C국의 …손실」은 와/과 병렬 덩이 하나 (2026-10-14) — B, 「자국의 경제」 C
    assert.deepEqual(근거.map((c) => `${c.node?.color}:${c.요소}`), ['B:b', 'C:c']);
  });

  it('인문 ① — 기호뿐인 노드(「(나)」「ⓐ」)는 조각이 아니다 (오종래 2026-10-15 안 A)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis('(나)의 ⓐ는 (라)의 핵심 개념과, (나)의 ⓑ는 (마)의 핵심 개념과 연결하여 차별·혐오 표현이 발생하는 원인을 각각 분석하고 서술하시오.'));
    assert.ok(입력.ok);
    const 근거 = derive_pieces(입력.물음, 입력.k, 입력.인식, '인문사회국어').filter((c) => c.파트 === '근거대기');
    assert.deepEqual(근거.map((c) => c.node?.entity.trim()), ['핵심 개념', '핵심 개념', '연결하여']);
    const 수리 = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리').filter((c) => c.파트 === '근거대기');
    assert.ok(수리.some((c) => c.node?.entity.trim() === '(나)'), '수리는 그대로');
  });

  it('급소가 여럿이면 전부 ①에서 뺀다 — 논술 (2-1)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis('C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.'));
    assert.ok(입력.ok);
    const 급소 = new Set(입력.인식.급소들!.map((g) => g.node.id));
    assert.equal(급소.size, 2);
    const 근거 = derive_pieces(입력.물음, 입력.k, 입력.인식, '인문사회국어').filter((c) => c.파트 === '근거대기');
    assert.ok(근거.length > 0 && 근거.every((c) => !급소.has(c.node!.id)));
    assert.ok(근거.some((c) => c.node?.color === 'P')); // P「변화」 — 「C국과 같은 …수출국」은 와/과 덩이 B (2026-10-14)
  });

  it('인문 ③ 풀기 없음 — 배점은 봉인④ 결손재분배 (수리는 네 파트 모두 배점)', () => {
    const 입력 = f2_input_from_v2(recognizeV2Analysis(수능17));
    assert.ok(입력.ok);
    const 인문 = derive_pieces(입력.물음, 입력.k, 입력.인식, '인문사회국어');
    assert.equal(인문.filter((c) => c.파트 === '풀기').length, 0);
    assert.ok(allocate_points(인문, 10, '인문사회국어').미배정.includes('풀기'));
    // 수리는 ①이 비면 그 파트만 미배정 (2026-10-20 「~일 때」 C → ② 세우기)
    assert.deepEqual(allocate_points(derive_pieces(입력.물음, 입력.k, 입력.인식, '수리'), 10, '수리').미배정, ['근거대기']);
  });
});

// 세우기 문장 — 논제 요구와 맞는 문장만 (오종래 2026-10-14 (가)): 논제가 긍정·부정 한쪽을 지정하면
// 단락 안에서 역접(하지만·그러나·반면·그렇지만) 문장부터 끝까지를 반대쪽으로 보고 뺀다
describe('세우기 — 역접 뒤 반대쪽 문장 제외', () => {
  const 가 =
    '자유무역은 무역 확대를 목표로 한다. 자유무역의 긍정적인 효과는 소비자들이 저렴한 상품을 구매할 수 있다는 것이다. ' +
    '또한, 수출 증가는 고용 창출에 도움을 준다. 하지만 부정적인 효과도 존재한다. 이익이 균등하지 않을 수 있다. 또한, 해외 의존도가 높아진다.';

  it('논제 극성 — 「긍정적」만이면 긍정, 「부정적」만이면 부정, 둘 다·없으면 null', () => {
    assert.equal(thesis_polarity('자유무역이 국가의 경제에 미치는 긍정적인 영향을 설명하시오.'), '긍정');
    assert.equal(thesis_polarity('부정적인 효과를 서술하시오.'), '부정');
    assert.equal(thesis_polarity('긍정적·부정적 효과를 비교하시오.'), null);
    assert.equal(thesis_polarity('대응조치를 설명하시오.'), null);
  });

  it('긍정을 물으면 역접 앞까지 · 부정을 물으면 역접부터 · 극성 없으면 전부', () => {
    const 연결 = [{ 단락: '가', 단락급소: '자유무역' }];
    assert.equal(link_sentences([{ 라벨: '가', 텍스트: 가 }], 연결, '긍정').length, 3);
    assert.deepEqual(link_sentences([{ 라벨: '가', 텍스트: 가 }], 연결, '부정').map((x) => x.문장.slice(0, 4)), ['하지만 ', '이익이 ', '또한, ']);
    assert.equal(link_sentences([{ 라벨: '가', 텍스트: 가 }], 연결).length, 6);
  });

  it('역접이 없는 단락은 극성이 있어도 그대로', () => {
    assert.deepEqual(filter_by_polarity(['가.', '나.'], '긍정'), ['가.', '나.']);
  });
});

// 화자 지정 (오종래 2026-10-14) — 서술형 B: 소문항이 「X의 방법으로」로 지목한 화자의 「X : …」 줄이 연결 단락
describe('화자 지정 — 「~의 방법으로」', () => {
  const 대화 = '철수 : f(x) = sinx - xcosx의 증가, 감소를 따져보는 것은 어때?\r\n영희 : 곡선 y=tanx와 직선 y=x의 그래프를 그려서 비교하면 어때?';
  it('지목한 화자의 줄만', () => {
    assert.deepEqual(speaker_lines("철수의 방법으로 '…'를 증명하시오.", 대화), [{ 라벨: '철수', 텍스트: 'f(x) = sinx - xcosx의 증가, 감소를 따져보는 것은 어때?' }]);
    assert.deepEqual(speaker_lines('영희의 방법으로 증명하시오.', 대화).map((l) => l.라벨), ['영희']);
  });
  it('이름 끝 「이」를 떼고도 찾는다 (민권이 → 「민권 :」)', () => {
    assert.deepEqual(speaker_lines('민권이의 방법으로 구하시오.', '민권 : 거리는 같으니까 …\n은재 : 기울기를 구하고 …').map((l) => l.라벨), ['민권']);
  });
  it('지목이 없거나 줄이 없으면 빈 배열', () => {
    assert.deepEqual(speaker_lines('증명하시오.', 대화), []);
    assert.deepEqual(speaker_lines('수지의 방법으로 증명하시오.', 대화), []);
  });
});

// 단계형 이어받기 (오종래 2026-10-14) — (n)의 ① 근거대기에 (n-1)의 급소 K를 「앞 결과」 조각으로
describe('단계형 — 앞 급소를 ① 「앞 결과」 조각으로', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis("영희의 방법으로 '0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'를 증명하시오."));
  assert.ok(입력.ok);
  const 조각 = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 앞급소: [{ 번호: '1', 실체: ', f(x) ≥ 0' }] }, '인문사회국어');
  const 앞 = 조각.filter((c) => c.앞결과);

  it('① 끝에 앞 결과 조각 하나 — 노드 없음 · 요소 b · 머리 쉼표 뗌', () => {
    assert.equal(앞.length, 1);
    assert.equal(앞[0].파트, '근거대기');
    assert.deepEqual(앞[0].앞결과, { 번호: '1', 실체: 'f(x) ≥ 0' });
    assert.equal(judge_element(앞[0], '인문사회국어'), 'b');
  });

  it('F4 · F6 {실체} = 앞 급소', () => {
    assert.equal(specify_condition(앞[0], '인문사회국어'), '「f(x) ≥ 0」의 개념·근거를 서술했는가');
    assert.equal(spread_piece(앞[0], 입력.k, '인문사회국어'), 'f(x) ≥ 0에 대하여 이해하고 있다.');
  });

  it('수리는 앞 급소를 받지 않는다', () => {
    const 수리 = derive_pieces(입력.물음, 입력.k, { ...입력.인식, 앞급소: [{ 번호: '1', 실체: 'x' }] }, '수리');
    assert.ok(!수리.some((c) => c.앞결과));
  });
});

// 앞 결과 조각 채점 — 앞 급소의 K 핵심어로 맞춘다 (오종래 2026-10-14)
describe('단계형 — 앞 결과 조각은 핵심어로 채점', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis("영희의 방법으로 '0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'를 증명하시오."));
  assert.ok(입력.ok);
  const 맥락 = { 답노드: [], 질문급소: 입력.k, 계열: '인문사회국어' as const, 루브릭: [], 앞결과: new Map() };
  const 앞조각 = (실체: string) => derive_pieces(입력.물음, 입력.k, { ...입력.인식, 앞급소: [{ 번호: '1', 실체 }] }, '인문사회국어').map((c) => ({ ...c, 충족조건: '', 배점: 1, 모범조각: '' })).find((c) => c.앞결과)!;

  it('명제 전체를 옮겨 쓰지 않아도 핵심어 「부등식 sinx ≥ xcosx」가 있으면 O', () => {
    const c = 앞조각("'0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'");
    const r = 봉인6_조각대조('앞에서 보인 부등식 sinx ≥ xcosx를 그래프로도 확인한다.', c, 맥락);
    assert.equal(r.결과, 'O');
    assert.match(r.근거, /부등식 sinx ≥ xcosx/);
    assert.equal(봉인6_조각대조('영희의 방법으로 그래프를 그렸다.', c, 맥락).결과, 'X');
  });

  it('핵심어가 한 글자(「f(x) ≥ 0」 → 「0」)면 명제 전체로 — 거짓 O 막기', () => {
    const c = 앞조각('f(x) ≥ 0');
    assert.equal(봉인6_조각대조('x=0에서 그래프가 만난다.', c, 맥락).결과, 'X');
    assert.equal(봉인6_조각대조('앞에서 f(x) ≥ 0을 보였다.', c, 맥락).결과, 'O');
  });
});

// 서술형 B 교사 모범답안 (오종래 2026-10-16) — 라벨 없이, 세우기 실체 줄 뒤 ~ 급소 K 줄 앞의 줄 하나 = 인문 ③ 풀기 조각 하나.
// 배점은 풀기 몫(봉인④ 2/9)을 균등 분배
describe('서술형 B — 모범답안 줄 → 풀기 조각', () => {
  const 뼈 = (파트: any, id: string, 더: object = {}) => ({ id, 파트, 요소: null, 수행질: null, 확인물음: '', is_중심: false, node: null, ...더 });
  const 엔진조각 = [
    뼈('근거대기', '근거대기-1', { 제시문: { 단락: '철수', 단락급소: '증가, 감소' } }),
    뼈('세우기', '세우기-1', { 근거: { 단락: '철수', 단락급소: '증가, 감소', 문장: '…' } }),
    뼈('답구하기', '답구하기-1', { 경로: [{ 출처: '제시문', 색: 'b', 실체: '증가, 감소' }, { 출처: '논제', 색: 'k', 실체: '부등식이 성립함', 핵심어: '성립' }] }),
  ] as any[];

  it('세우기 실체가 마지막으로 나온 줄 뒤 ~ K 핵심어가 처음 나온 줄 앞 = 풀기 (빈 줄은 뺀다)', () => {
    const r = split_solve_lines('f(x)를 놓는다.\n철수처럼 증가, 감소를 따진다.\n\nf\'(x) = xsinx이다.\n구간에서 f\'(x) ≥ 0이다.\n따라서 부등식이 성립한다.', 엔진조각);
    assert.deepEqual(r.풀기, ["f'(x) = xsinx이다.", "구간에서 f'(x) ≥ 0이다."]);
    assert.equal(r.세우기끝, 2);
    assert.equal(r.답줄, 5);
    assert.equal(r.답대체, false);
  });

  it('답 줄을 먼저 — 답 줄에도 세우기 실체가 있으면 그 앞의 마지막 세우기 실체 줄이 세우기 끝', () => {
    const r = split_solve_lines('증가, 감소를 본다.\n가\n나\n따라서 증가, 감소로 부등식이 성립한다.', 엔진조각);
    assert.deepEqual(r.풀기, ['가', '나']);
    assert.equal(r.세우기끝, 1);
    assert.equal(r.답줄, 4);
  });

  it('K 핵심어가 여러 줄이면 마지막 줄이 답 · 어디에도 없으면 마지막 줄을 답으로', () => {
    assert.deepEqual(split_solve_lines('성립을 보이자.\n증가, 감소를 본다.\n가\n성립한다.', 엔진조각).풀기, ['가']);
    const r = split_solve_lines('증가, 감소를 본다.\n가\n나\n끝 줄', 엔진조각);
    assert.deepEqual(r.풀기, ['가', '나']);
    assert.equal(r.답대체, true);
    assert.equal(r.답줄, 4);
  });

  it('세우기 실체가 어느 줄에도 없으면 첫 줄까지를 앞 구간으로', () => {
    const r = split_solve_lines('첫\n둘\n성립한다.', 엔진조각);
    assert.equal(r.세우기끝, null);
    assert.deepEqual(r.풀기, ['둘']);
  });

  it('한 문단(줄바꿈 없음)이면 풀기 없음', () => {
    assert.deepEqual(split_solve_lines('증가, 감소를 따지면 성립한다.', 엔진조각).풀기, []);
  });

  const 입력 = f2_input_from_v2(recognizeV2Analysis(논제));
  assert.ok(입력.ok);
  const 조각of = (교사풀기?: string[]) => derive_pieces(입력.물음, 입력.k, { ...입력.인식, ...(교사풀기 ? { 교사풀기 } : {}) }, '인문사회국어').map((c) => ({ ...c, 요소: judge_element(c, '인문사회국어') }));

  it('풀기 줄 둘 → 풀기 조각 둘 (노드 없음 · 수행질 정확성 · 충족조건에 그 줄)', () => {
    const 풀기 = 조각of(['첫 단계', '둘째 단계']).filter((c) => c.파트 === '풀기');
    assert.deepEqual(풀기.map((c) => c.id), ['풀기-1', '풀기-2']);
    assert.equal(풀기[0].node, null);
    assert.equal(풀기[0].요소, null);
    assert.equal(풀기[0].수행질, '정확성');
    assert.match(specify_condition(풀기[1], '인문사회국어'), /모범답안 풀기-2: 「둘째 단계」/);
    assert.equal(spread_piece(풀기[0], 입력.k, '인문사회국어'), '논지의 전개 논리와 근거가 모두 타당하다.');
  });

  it('배점 — 풀기 몫 = 총배점 × 2/9 ÷ 풀기 수, 근거·세우기·답은 2:3:2 그대로', () => {
    const 뼈 = (파트: any, id: string) => ({ id, 파트, 요소: null, 수행질: null, 확인물음: '', is_중심: false, node: null });
    const 네파트 = (풀기수: number) => [뼈('근거대기', '근거대기-1'), 뼈('세우기', '세우기-1'), ...Array.from({ length: 풀기수 }, (_, i) => 뼈('풀기', `풀기-${i + 1}`)), 뼈('답구하기', '답구하기-1')];
    const r = allocate_points(네파트(2), 9, '인문사회국어');
    assert.deepEqual(r.파트배점, { 근거대기: 2, 세우기: 3, 풀기: 2, 답구하기: 2 });
    assert.deepEqual(r.조각들.filter((c) => c.파트 === '풀기').map((c) => c.배점), [1, 1]);
    // 풀기가 없으면 결손재분배 — 지금처럼 2:3:2
    assert.deepEqual(allocate_points(네파트(0), 7, '인문사회국어').파트배점, { 근거대기: 2, 세우기: 3, 풀기: 0, 답구하기: 2 });
  });

  it('라벨이 없으면 지금대로 풀기 없음', () => {
    assert.ok(!조각of().some((c) => c.파트 === '풀기'));
  });

  it('인문 풀기는 교사 판정', () => {
    const c = { ...조각of(['a']).find((x) => x.파트 === '풀기')!, 충족조건: '', 배점: 1, 모범조각: '' };
    assert.equal(봉인6_조각대조('a', c, { 답노드: [], 질문급소: 입력.k, 계열: '인문사회국어', 루브릭: [], 앞결과: new Map() }).결과, '판정불가');
  });
});

// 인문 ① 같은 실체 조각 하나만 (오종래 2026-10-16) — 「철수의 방법으로」 논제 노드 「철수」 + 화자 이름으로 선 단락 급소 「철수」
describe('인문 ① — 실체가 같은 조각은 처음 것 하나만', () => {
  const 입력 = f2_input_from_v2(recognizeV2Analysis("철수의 방법으로 '0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'를 증명하시오. [4점]"));
  assert.ok(입력.ok);
  const 근거of = (더: object) => derive_pieces(입력.물음, 입력.k, { ...입력.인식, ...더 }, '인문사회국어').filter((c) => c.파트 === '근거대기');

  it('논제 노드 「철수」와 단락 급소 「철수」 → 논제 노드 하나', () => {
    const r = 근거of({ 단락연결: [{ 노드: 입력.k.node.id, 단락: '철수', 단락급소: '철수' }] });
    assert.deepEqual(r.map((c) => [c.id, c.node?.entity ?? c.제시문?.단락급소]), [['근거대기-1', '철수']]);
  });

  it('실체가 다르면 그대로 · 번호는 이어서', () => {
    const r = 근거of({ 단락연결: [{ 노드: 입력.k.node.id, 단락: '철수', 단락급소: '증가, 감소' }], 앞급소: [{ 번호: '1', 실체: '철수' }] });
    assert.deepEqual(r.map((c) => c.id), ['근거대기-1', '근거대기-2']);
    assert.equal(r[1].제시문?.단락급소, '증가, 감소');
  });
});
