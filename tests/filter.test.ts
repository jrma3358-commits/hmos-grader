// 1차 필터[a] — 문항분석 명세서-2 §2·§3·§5를 기준으로 한 테스트.
// 기대값은 엔진 출력이 아니라 **명세와 2026-09-30 오종래 확정**에서 온다. 봉인 값은 쓰지 않는다(노드를 손으로 세운다).
// 봉인⑦~⑬은 비어 있으므로 «소리 내어 실패하는지»만 본다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SealedError } from '../src/fq/sealed/index.ts';
import type { Color } from '../src/fq/types.ts';
import type { PathNode } from '../src/fq/v2/graph.ts';
import { analyze_descriptive } from '../src/filter/descriptive.ts';
import { judge_item, 제시문상한 } from '../src/filter/judge.ts';
import { 봉인10_관계적절, 봉인11_요소결손, 봉인12_중의성, 봉인13_정교화필요 } from '../src/filter/sealed/items.ts';
import { 봉인8_관계대조 } from '../src/filter/sealed/relation.ts';
import { 봉인7_소문항분리 } from '../src/filter/sealed/stepwise.ts';
import { 봉인9_논제요구 } from '../src/filter/sealed/thesis.ts';
import { summarize_substance } from '../src/filter/substance.ts';
import type { 급소K, 조각뼈대, 파트 } from '../src/rubric/types.ts';

let seq = 0;
const node = (id: string, color: Color | null, entity = id): PathNode => ({
  id,
  surface: '·',
  switchId: `SW-${id}`,
  index: seq++,
  color,
  entity,
});
const piece = (id: string, 파트: 파트, n: PathNode): 조각뼈대 => ({
  id,
  파트,
  요소: null,
  수행질: null,
  확인물음: '',
  is_중심: false,
  node: n,
});
const kOf = (n: PathNode): 급소K => ({ 실체: n.entity, node: n });

describe('서술형 실체 요약 — 바탕(B·D·P) → 도달(C·K·Q), node.color로 읽는다 (§2)', () => {
  const b = node('b', 'B', '함수');
  const d = node('d', 'D', '정의');
  const p = node('p', 'P', '상황');
  const c = node('c', 'C', '조건');
  const q = node('q', 'Q', '구하시오');
  const x = node('x', null, '미결');
  const k = node('k', 'B', '급소');
  const nodes = [b, d, p, c, q, x, k];

  it('B·D·P는 바탕, C·Q는 도달', () => {
    const s = summarize_substance(kOf(k), { 조합: [], nodes }, []);
    assert.deepEqual(s.바탕.map((e) => e.node.id), ['b', 'd', 'p']);
    assert.deepEqual(s.도달.map((e) => e.node.id), ['c', 'q', 'k']);
  });

  it('급소 K는 색(B)과 상관없이 도달, 표지 K', () => {
    const s = summarize_substance(kOf(k), { 조합: [], nodes }, []);
    assert.equal(s.바탕.some((e) => e.node.id === 'k'), false);
    assert.equal(s.도달.find((e) => e.node.id === 'k')?.표지, 'K');
  });

  it('색 미결 노드는 어느 쪽에도 넣지 않는다', () => {
    const s = summarize_substance(kOf(k), { 조합: [], nodes }, []);
    assert.deepEqual(s.미결.map((n) => n.id), ['x']);
  });

  it('F3가 덮어쓴 요소가 아니라 노드 색을 따른다 — 세우기 C 노드는 도달', () => {
    const 세우기 = { ...piece('세우기-1', '세우기', c), 요소: 'p' as const };
    const s = summarize_substance(kOf(k), { 조합: [], nodes: [c, k] }, [세우기]);
    assert.equal(s.도달.find((e) => e.node.id === 'c')?.표지, 'C');
  });

  it('조각 연동 — 풀기는 세우기와 같은 노드라 뺀다', () => {
    const s = summarize_substance(kOf(k), { 조합: [], nodes: [c, k] }, [
      piece('세우기-1', '세우기', c),
      piece('풀기-1', '풀기', c),
    ]);
    assert.deepEqual(s.도달.find((e) => e.node.id === 'c')?.조각ids, ['세우기-1']);
  });

  it('요약 한 줄 = 바탕 → 도달, 비면 (없음)', () => {
    const s = summarize_substance(kOf(k), { 조합: [], nodes: [b, k] }, []);
    assert.equal(s.요약, 'B「함수」 → K「급소」');
    assert.equal(summarize_substance(kOf(k), { 조합: [], nodes: [k] }, []).요약, '(없음) → K「급소」');
  });
});

describe('급소 불명 = 거르기 (§5 급소 명확, 초석1)', () => {
  it('B가 없는 문항(NO_B)은 오류가 아니라 거르기', () => {
    const r = analyze_descriptive('');
    assert.equal(r.판정, '거르기');
    if (r.판정 !== '거르기') return;
    assert.equal(r.증상, '급소 명확');
    assert.equal(r.초석, 1);
    assert.equal(r.실패.flag, 'NO_B');
  });

  it('단독문제 판정도 거르기, 뒤 항목은 보지 않는다', () => {
    const r = judge_item({ 유형: '단독문제', 텍스트: '' });
    assert.equal(r.판정, '거르기');
    assert.ok('항목' in r);
    assert.deepEqual(
      r.항목.map((i) => [i.증상, i.판정, i.초석]),
      [['급소 명확', '거르기', 1]],
    );
  });

  it('논술형 논제 급소가 서지 않아도 거르기', () => {
    const r = judge_item({ 유형: '인문사회논술', 논제: '', 제시문: [{ id: '가', 텍스트: '' }] });
    assert.equal(r.판정, '거르기');
    assert.ok('항목' in r);
    assert.equal(r.항목[0].증상, '급소 명확');
  });
});

describe('논술형 재료 완결 — 제시문 1~5개 (§5, 상한 §8)', () => {
  const 제시문 = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `${i}`, 텍스트: '' }));

  it('상한은 5', () => {
    assert.equal(제시문상한, 5);
  });

  for (const n of [0, 6]) {
    it(`제시문 ${n}개는 분석 전에 거르기`, () => {
      const r = judge_item({ 유형: '인문사회논술', 논제: '', 제시문: 제시문(n) });
      assert.equal(r.판정, '거르기');
      assert.ok('항목' in r);
      assert.deepEqual(
        r.항목.map((i) => [i.증상, i.판정]),
        [['재료 완결', '거르기']],
      );
      assert.equal(r.분석, null);
    });
  }
});

describe('비어 있는 봉인은 소리 내어 실패한다 (⑦~⑬)', () => {
  const k = kOf(node('k', 'B', '급소'));
  const 핵심 = (id: string) => ({ id, 핵심: k });

  it('⑦ 소문항분리 — 계단식 판정도 여기서 멈춘다', () => {
    assert.throws(() => 봉인7_소문항분리('(1) … (2) …'), SealedError);
    assert.throws(() => judge_item({ 유형: '계단식 단계형', 텍스트: '(1) … (2) …' }), /\[봉인⑦\]/);
  });

  it('⑧ 관계대조', () => {
    assert.throws(() => 봉인8_관계대조(핵심('가'), 핵심('나')), /\[봉인⑧\]/);
  });

  it('⑨ 논제요구', () => {
    assert.throws(() => 봉인9_논제요구(k, ['가', '나']), /\[봉인⑨\]/);
  });

  it('⑩~⑬ 필터 항목', () => {
    const 실체 = summarize_substance(k, { 조합: [], nodes: [k.node] }, []);
    const 분석 = { 판정: null, k, 조각들: [], 실체 };
    assert.throws(() => 봉인10_관계적절(실체, k), /\[봉인⑩\]/);
    assert.throws(() => 봉인11_요소결손(분석), /\[봉인⑪\]/);
    assert.throws(() => 봉인12_중의성(분석), /\[봉인⑫\]/);
    assert.throws(() => 봉인13_정교화필요([]), /\[봉인⑬\]/);
  });
});
