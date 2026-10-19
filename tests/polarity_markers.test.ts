import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { find_polarity_markers, passage_polarity } from '../src/fq/polarity_markers.ts';
import { sealedPath } from '../src/fq/index.ts';
import type { PathGraph, PathNode } from '../src/fq/v2/graph.ts';

// 제시문 B 극성 (오종래 2026-10-19). 표지 목록은 봉인 표지사전 「극성」에 있다 — 여기서는 지시의 목록을 시험용으로 받아
// 찾는 규칙(문장 자리 · 조사 짝 · 당김 먼저)만 본다
const 표 = {
  당김: ['~때문에', '~로 인해', '~의 결과', '~에 따라', '~로써', '~이므로', '~한 탓에', '~에서 비롯', '~을 초래', '~의 원인'],
  밀침: ['~에 반해', '~와 달리', '~을 비판', '~을 부정', '~에 맞서', '~와 대조적으로', '~을 거부', '~에도 불구하고', '~이 아니라'],
};

const 노드 = (entity: string, index: number): PathNode => ({ id: `n${index}`, surface: '', switchId: '', index, color: 'B', entity });

describe('제시문 B 극성 — 기능표지 (오종래 2026-10-19)', () => {
  it('「~」는 앞말 자리 — 표지 본체가 문장에 있으면 찾는다', () => {
    assert.deepEqual(find_polarity_markers('관세가 올랐기 때문에 물가가 올랐다.', 표.당김), ['~때문에']);
    assert.deepEqual(find_polarity_markers('보호무역은 자유무역과 달리 관세를 높인다.', 표.밀침), ['~와 달리']);
  });

  it('조사 짝 — 「~을 비판」은 「를 비판」, 「~로 인해」는 「으로 인해」, 「~이 아니라」는 「가 아니라」도', () => {
    assert.deepEqual(find_polarity_markers('정부는 보호무역 정책를 비판했다.', 표.밀침), ['~을 비판']);
    assert.deepEqual(find_polarity_markers('환율 상승으로 인해 수입 물가가 올랐다.', 표.당김), ['~로 인해']);
    assert.deepEqual(find_polarity_markers('문제는 관세가 아니라 환율이다.', 표.밀침), ['~이 아니라']);
  });

  it('「~이므로」의 「이」는 조사 짝이 아니다 — 「가므로」로 찾지 않는다', () => {
    assert.deepEqual(find_polarity_markers('그는 학교에 가므로 늦는다.', 표.당김), []);
  });

  it('B마다 그 B가 든 문장만 본다 — 당김·밀침·배경', () => {
    const 글 = '관세 인상으로 인해 수입 물가가 올랐다. 자유무역과 달리 보호무역은 국내 산업을 지킨다. 정부는 회의를 열었다.';
    const g = { question: 글, nodes: [], edges: [], combination: [], undecided: [] } as unknown as PathGraph;
    const r = passage_polarity(g, [노드('관세 인상', 0), 노드('보호무역', 글.indexOf('보호무역')), 노드('회의', 글.indexOf('회의'))], 표);
    assert.deepEqual(r.map((x) => x.polarity), ['당김', '밀침', null]);
    assert.deepEqual(r[1].markers, ['~와 달리']);
  });

  it('한 문장에 둘 다 있으면 당김 (판정 순서 3 → 4)', () => {
    const 글 = '자유무역과 달리 보호무역은 관세 때문에 물가를 올린다.';
    const g = { question: 글, nodes: [], edges: [], combination: [], undecided: [] } as unknown as PathGraph;
    assert.equal(passage_polarity(g, [노드('보호무역', 글.indexOf('보호무역'))], 표)[0].polarity, '당김');
  });

  it('봉인 표지사전이 있으면 「극성」 당김·밀침이 지시와 같다', { skip: !existsSync(sealedPath()) }, () => {
    const 봉인 = JSON.parse(readFileSync(sealedPath(), 'utf8'));
    assert.deepEqual(봉인.극성, 표);
  });
});
