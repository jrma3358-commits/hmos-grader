import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { check_human_answer, check_math_answer, last_sentence, parse_length, units_in, value_form } from '../src/fq/answer_markers.ts';
import { sealedPath } from '../src/fq/index.ts';

// 답구하기 · 답표현하기 (오종래 2026-10-19 — deploy/hmos-spec/답구하기_답표현하기_명세서.md). 표지 목록은 봉인 표지사전에 있다 —
// 여기서는 지시받은 목록을 시험용으로 받아 찾는 규칙만 본다
const 답구하기 = { 단위표지: ['cm', 'm', 'km', 'g', 'kg', '초', '분', '시간', '원', '개'], 형식표지: ['분수', '소수', '정수', '벡터', '행렬'] };
const 답표현하기 = { 형식표지: ['서술하시오', '논하시오', '비교하시오', '설명하시오', '분석하시오'], 완결표지: ['이다', '한다', '된다', '있다', '없다', '해야 한다', '본다', '보인다', '생각한다', '여긴다', '판단한다'], 분량기준: '±10%' };

describe('답구하기 — 단위 · 형식', () => {
  it('수 뒤에 붙은 단위만 단위다 — 「분수」「원인」「3분의 1」은 아니다', () => {
    assert.deepEqual(units_in('넓이는 12cm이고 무게는 3 kg', 답구하기.단위표지), ['cm', 'kg']);
    assert.deepEqual(units_in('분수로 나타낸 원인은 3분의 1', 답구하기.단위표지), []);
    assert.deepEqual(units_in('5mm', 답구하기.단위표지), []);
  });

  it('끝 값의 꼴', () => {
    assert.equal(value_form('따라서 답은 1/2'), '분수');
    assert.equal(value_form('따라서 답은 0.5'), '소수');
    assert.equal(value_form('답은 72가지'), '정수');
    assert.equal(value_form('구하는 벡터는 (1, -2)'), '벡터');
    assert.equal(value_form('답 없음'), null);
  });

  it('모범답안에 단위가 있으면 학생 답에도 있어야 한다', () => {
    const r = check_math_answer('넓이를 구하면\n따라서 넓이는 12', '넓이를 구하시오.', '가로×세로\n넓이는 12cm', 답구하기);
    assert.deepEqual(r.단위.기준, ['cm']);
    assert.equal(r.단위.맞음, false);
    assert.equal(check_math_answer('따라서 넓이는 12cm', '넓이를 구하시오.', '넓이는 12cm', 답구하기).단위.맞음, true);
  });

  it('기준에 단위가 없으면 학생 답에도 없어야 한다', () => {
    assert.equal(check_math_answer('경우의 수는 72개', '경우의 수를 구하시오.', '6!/2!=360\n경우의 수 72', 답구하기).단위.맞음, false);
  });

  it('논제가 요구한 꼴이면 맞다 — 소수를 요구했는데 분수로 쓰면 틀림', () => {
    assert.equal(check_math_answer('답은 0.25', 'p를 소수로 나타내시오.', '', 답구하기).형식.맞음, true);
    const r = check_math_answer('답은 1/4', 'p를 소수로 나타내시오.', '', 답구하기);
    assert.deepEqual(r.형식.요구, ['소수']);
    assert.equal(r.형식.맞음, false);
    assert.equal(check_math_answer('답은 1/4', 'p의 값을 구하시오.', '', 답구하기).형식.맞음, true);
  });
});

describe('답표현하기 — 서술 형식 표지 · 분량 · 완결', () => {
  it('마지막 문장', () => {
    assert.equal(last_sentence('첫 문장이다. 둘째 문장이다.\n셋째 줄의 끝 문장이다.'), '셋째 줄의 끝 문장이다.');
  });

  it('분량 — 「800 ± 80자」 그대로, 「N자 내외」는 ±10%, 「N자 이내」는 N까지', () => {
    assert.deepEqual([parse_length('(800 ± 80자, 50점)', '±10%')?.최소, parse_length('(800 ± 80자, 50점)', '±10%')?.최대], [720, 880]);
    assert.deepEqual([parse_length('200자 내외로 서술하시오.', '±10%')?.최소, parse_length('200자 내외로 서술하시오.', '±10%')?.최대], [180, 220]);
    assert.deepEqual([parse_length('300자 이내', '±10%')?.최소, parse_length('300자 이내', '±10%')?.최대], [null, 300]);
    assert.equal(parse_length('원인을 서술하시오.', '±10%'), null);
  });

  it('논제가 요구한 서술 형식 · 분량 · 완결', () => {
    const 답 = '가'.repeat(195) + '이다.';
    const r = check_human_answer(답, '(나)의 원인을 200자 내외로 서술하시오.', 답표현하기);
    assert.deepEqual(r.형식.요구, ['서술하시오']);
    assert.equal(r.분량.글자수, 198);
    assert.equal(r.분량.맞음, true);
    assert.equal(r.완결.맞음, true);
    assert.equal(r.완결.표지, '이다');
  });

  it('분량 미달 · 문장 미완성', () => {
    const r = check_human_answer('지역 차이를 우열로 보는 인식', '(나)의 원인을 200자 내외로 서술하시오.', 답표현하기);
    assert.equal(r.분량.맞음, false);
    assert.equal(r.완결.맞음, false);
  });

  it('「본다」「보인다」「생각한다」「여긴다」「판단한다」로 끝나도 완결 (2026-10-19 추가)', () => {
    for (const 끝 of ['원인을 지역으로 본다.', '차별의 뿌리로 보인다.', '원인은 지역이라고 생각한다.', '사투리를 열등하게 여긴다.', '지역 차이가 원인이라고 판단한다.']) {
      assert.equal(check_human_answer(끝, '원인을 서술하시오.', 답표현하기).완결.맞음, true, 끝);
    }
    assert.equal(check_human_answer('원인을 지역으로 보았다.', '원인을 서술하시오.', 답표현하기).완결.맞음, false);
  });

  it('논제에 분량이 없으면 분량은 따지지 않는다 (null)', () => {
    assert.equal(check_human_answer('원인은 지역이다.', '원인을 서술하시오.', 답표현하기).분량.맞음, null);
  });

  it('봉인 표지사전이 있으면 「답구하기」·「답표현하기」가 지시받은 목록과 같다', { skip: !existsSync(sealedPath()) }, () => {
    const 봉인 = JSON.parse(readFileSync(sealedPath(), 'utf8'));
    assert.deepEqual(봉인.답구하기, 답구하기);
    assert.deepEqual(봉인.답표현하기, 답표현하기);
  });
});
