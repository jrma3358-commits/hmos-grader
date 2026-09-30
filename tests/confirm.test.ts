// 선생 확인 창 — 문항분석 명세서-2 §6을 기준으로 한 테스트.
// 기대값은 명세에서 온다. «①을 골라야만 루브릭창»과, 교사가 거르기도 ①로 뒤집을 수 있음(2026-09-30 오종래)을 본다.
// 봉인⑩~⑬이 비어 있어 엔진이 «통과»를 낼 수 없으므로, 통과 화면은 손으로 세운다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { choose, is_approved, make_screen, render_screen, type 확인화면 } from '../src/filter/confirm.ts';
import type { 필터입력 } from '../src/filter/judge.ts';
import { generate_rubric } from '../src/rubric/assemble.ts';

const 급소불명: 필터입력 = { 유형: '단독문제', 텍스트: '' };

const 통과화면 = (): 확인화면 => ({
  입력: { 유형: '단독문제', 텍스트: '(손으로 세운 문항)' },
  판정: { 판정: '통과(교사 확인 대기)', 항목: [], 분석: null },
  급소: ['급소'],
  실체요약: ['B「함수」 → K「급소」'],
  필터판정: '통과(교사 확인 대기)',
  다경로지점: [],
  선택지: [1, 2, 3, 4],
});

describe('화면 자료 (§6)', () => {
  it('거르기 문항 — 급소·요약은 (서지 않음), 선택지는 ①~④ 전부', () => {
    const s = make_screen(급소불명);
    assert.equal(s.필터판정, '거르기');
    assert.deepEqual(s.급소, ['(서지 않음)']);
    assert.deepEqual(s.실체요약, ['(서지 않음)']);
    assert.deepEqual(s.선택지, [1, 2, 3, 4]);
  });

  it('다경로 지점은 표시 규칙이 없어 비어 있다', () => {
    assert.deepEqual(make_screen(급소불명).다경로지점, []);
  });

  it('계단식은 봉인⑦이 비어 있어 화면을 만들지 못한다', () => {
    assert.throws(() => make_screen({ 유형: '계단식 단계형', 텍스트: '(1) … (2) …' }), /\[봉인⑦\]/);
  });
});

describe('교사 선택 — ①을 골라야만 루브릭창 (§6)', () => {
  it('통과 화면에서 ① → 루브릭창, 승인된문항에 입력·판정이 그대로 실린다', () => {
    const s = 통과화면();
    const r = choose(s, { 번호: 1 });
    assert.equal(r.다음, '루브릭창');
    if (r.다음 !== '루브릭창') return;
    assert.equal(r.문항.승인, '교사 ①');
    assert.equal(r.문항.입력, s.입력);
    assert.equal(r.문항.판정, s.판정);
    assert.equal(r.문항.뒤집음, false);
    assert.equal(is_approved(r.문항), true);
  });

  it('엔진 판정이 거르기여도 교사는 ①로 뒤집을 수 있다 — 뒤집음이 남는다', () => {
    const r = choose(make_screen(급소불명), { 번호: 1 });
    assert.equal(r.다음, '루브릭창');
    if (r.다음 !== '루브릭창') return;
    assert.equal(r.문항.뒤집음, true);
    assert.equal(is_approved(r.문항), true);
  });

  it('손으로 만든 같은 모양의 입장권은 승인이 아니다', () => {
    const s = 통과화면();
    assert.equal(is_approved({ 승인: '교사 ①', 입력: s.입력, 판정: s.판정, 뒤집음: false }), false);
  });

  it('② → 고친 입력으로 재판정해 새 화면', () => {
    const 수정: 필터입력 = { 유형: '인문사회논술', 논제: '', 제시문: [] };
    const r = choose(make_screen(급소불명), { 번호: 2, 수정 });
    assert.equal(r.다음, '재판정');
    if (r.다음 !== '재판정') return;
    assert.equal(r.화면.입력, 수정);
    assert.ok('항목' in r.화면.판정);
    assert.equal(r.화면.판정.항목[0].증상, '재료 완결');
  });

  it('③ 정교화 모드 · ④ 논제 생성 모드 — 행선지만, 화면은 그대로', () => {
    const s = make_screen(급소불명);
    const r3 = choose(s, { 번호: 3 });
    const r4 = choose(s, { 번호: 4 });
    assert.equal(r3.다음, '정교화 모드');
    assert.equal(r4.다음, '논제 생성 모드');
    assert.ok('화면' in r3 && r3.화면 === s);
    assert.ok('화면' in r4 && r4.화면 === s);
  });
});

describe('화면 그리기 (§6 배치)', () => {
  it('제목·판정·항목 사유·다경로 자리가 나온다', () => {
    const t = render_screen(make_screen(급소불명));
    assert.match(t, /^\[문항 적절성 체크 화면\]/);
    assert.match(t, /필터 판정 *: 거르기/);
    assert.match(t, /· 급소 명확: 거르기 — NO_B/);
    assert.match(t, /\(표시 규칙 없음\)/);
  });

  it('거르기 화면에도 ①이 나온다', () => {
    assert.match(render_screen(make_screen(급소불명)), /① 급소가 내 의도와 맞다/);
  });
});

describe('루브릭창은 교사 승인만 받는다 (§6 → 구현명세 §4)', () => {
  it('손으로 만든 입장권은 거절', () => {
    const s = 통과화면();
    assert.throws(
      () => generate_rubric({ 승인: '교사 ①', 입력: s.입력, 판정: s.판정, 뒤집음: false }, '수리', 10),
      /①로 승인한 문항만/,
    );
  });

  it('승인됐어도 계단식·논술형은 아직 루브릭 경로가 없다', () => {
    for (const 입력 of [
      { 유형: '계단식 단계형', 텍스트: '' },
      { 유형: '인문사회논술', 논제: '', 제시문: [] },
    ] as 필터입력[]) {
      const r = choose({ ...통과화면(), 입력 }, { 번호: 1 });
      assert.ok(r.다음 === '루브릭창');
      assert.throws(() => generate_rubric(r.문항, '수리', 10), /루브릭 경로는 아직 없습니다/);
    }
  });

  it('거르기를 ①로 뒤집어도 급소가 서지 않으면 루브릭은 PivotFailure를 돌려준다', () => {
    const r = choose(make_screen(급소불명), { 번호: 1 });
    assert.ok(r.다음 === '루브릭창');
    const g = generate_rubric(r.문항, '수리', 10);
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.equal(g.flag, 'NO_B');
  });
});
