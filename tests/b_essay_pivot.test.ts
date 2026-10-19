// 서술형(B) 급소 [오종래 2026-10-19 확정] — 서술 방식 노드(C-F 「연관지어」 등)는 급소 후보가 아니다.
//   실체 명사(「배경」「이유」「원인」「결과」「영향」)로 끝나는 B가 급소다. 논술(서술형 아님)은 그대로
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recognizeV2Analysis } from '../src/fq/pipeline.ts';

const 급소 = (q: string, 서술형: boolean) => {
  const p = recognizeV2Analysis(q, { 서술형 }).pivot;
  return p.ok ? (p.pivots ?? [p.pivot]).map((x) => [x.node.entity.trim(), x.reason]) : p.flag;
};

describe('서술형 급소 — 실체 명사 B, 서술 방식(C-F) 제외', () => {
  const 그리스 = '그리스의 폴리스들이 다음 행사를 개최하였던 배경을 그리스의 자연 환경과 연관지어 서술하시오.';

  it('세계사 서술형 2 — 「연관지어」가 아니라 「개최하였던 배경」', () => {
    assert.deepEqual(급소(그리스, true), [['개최하였던 배경', '실체 명사 B']]);
  });

  it('서술형이 아니면 지금 규칙 그대로 (서술형태 급소 「연관지어」)', () => {
    assert.deepEqual(급소(그리스, false), [['연관지어', '서술형태']]);
  });

  it('실체 명사 B가 여럿이면 급소 복수', () => {
    const r = 급소('임진왜란이 일어난 배경을 쓰고, 전쟁이 조선 사회에 끼친 영향을 서술하시오.', true) as string[][];
    assert.deepEqual(r.map((x) => x[1]), ['실체 명사 B', '실체 명사 B']);
  });

  it('「원인과 그 결과」처럼 한 덩이 B면 급소 하나', () => {
    assert.deepEqual(급소('산업 혁명이 일어난 원인과 그 결과를 비교하여 서술하시오.', true), [['산업 혁명이 일어난 원인과 그 결과', '실체 명사 B']]);
  });

  it('실체 명사 B가 없으면 서술 방식만 빼고 B 규칙 그대로', () => {
    const r = 급소('두 나라의 정치 제도를 비교하여 서술하시오.', true) as string[][];
    assert.ok(r.every((x) => x[1] !== '서술형태'));
  });
});
