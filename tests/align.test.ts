// C·논술 4단계 엔진 몫 ①타당 ③불완전 ④사족 (오종래 2026-10-13). 노드는 손으로 세운다 — 봉인 값은 쓰지 않는다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Color } from '../src/fq/types.ts';
import type { PathNode } from '../src/fq/v2/graph.ts';
import { align_passage, type 단락분석, type 인식소문항 } from '../src/thesis/align.ts';

let seq = 0;
const node = (id: string, color: Color, entity: string): PathNode => ({ id, surface: '·', switchId: `SW-${id}`, index: seq++, color, entity });

const 소문항 = (번호: string, 참조: string[], nodes: PathNode[], 급소: PathNode): 인식소문항 => ({
  번호,
  참조,
  인식: {
    graph: { question: '', nodes, edges: [], combination: [], undecided: [] },
    pivot: { ok: true, pivot: { node: 급소, reason: 'Q 직전 B', convergence: 0, sameAsDeepest: false } },
  },
});

const 단락 = (label: string, 급소: string, more: Partial<단락분석> = {}): 단락분석 => ({
  단락: label,
  P: [],
  B: [급소],
  D: [],
  C: [],
  급소,
  관련: [],
  ...more,
});

describe('align_passage', () => {
  const b = node('n2', 'B', 'B국이 시행한 대응조치');
  const s12 = 소문항('1-2', ['가', '나', '다'], [node('n1', 'B', '으로 인한 손실'), b, node('n3', 'Q', '무엇')], b);

  it('① 타당 — 논제 B노드가 단락 급소를 품는다', () => {
    const r = align_passage([s12], [단락('다', '대응조치')]);
    assert.deepEqual(r.타당, [{ 소문항: '1-2', 노드: 'n2', 실체: 'B국이 시행한 대응조치', 단락: '다', 단락급소: '대응조치' }]);
    assert.deepEqual(r.불완전, []);
  });

  it('① 참조 범위 밖 단락과는 잇지 않는다', () => {
    const r = align_passage([s12], [단락('라', '대응조치')]);
    assert.deepEqual(r.타당, []);
    assert.deepEqual(r.불완전, [{ 단락: '라', 단락급소: '대응조치' }]);
  });

  it('③ 불완전 — 어느 논제 B노드와도 이어지지 않은 단락 급소', () => {
    const r = align_passage([s12], [단락('다', '대응조치'), 단락('가', '빈부 격차')]);
    assert.deepEqual(r.불완전, [{ 단락: '가', 단락급소: '빈부 격차' }]);
  });

  it('④ 사족 — 논제 노드와도 관련 실체와도 이어지지 않은 단락 노드', () => {
    const d = 단락('나', '보호무역 정책', {
      P: ['A국'],
      B: ['보호무역 정책', '세계무역기구'],
      D: ['실업률 상승'],
      관련: [{ 소문항: '1-2', 실체: '실업률', 근거문장: '…실업률이 상승하였다' }],
    });
    const r = align_passage([s12], [d]);
    // 「A국」: 논제 실체에 없음 / 「세계무역기구」: 없음 / 「실업률 상승」: 관련 실체 「실업률」을 품음 / 급소는 ④에서 뺀다
    assert.deepEqual(r.사족, [
      { 단락: '나', 실체: 'A국' },
      { 단락: '나', 실체: '세계무역기구' },
    ]);
  });

  it('④ 논제 노드 실체를 품으면 사족이 아니다 (Q는 열쇠가 아니다)', () => {
    const d = 단락('다', '대응조치', { C: ['손실', '무엇'] });
    const r = align_passage([s12], [d]);
    assert.deepEqual(r.사족, [{ 단락: '다', 실체: '무엇' }]);
  });

  it('참조가 없는 소문항은 모든 단락과 잇는다', () => {
    const s = 소문항('1-1', [], [b], b);
    assert.equal(align_passage([s], [단락('마', '대응조치')]).타당.length, 1);
  });
});
