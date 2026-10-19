import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { find_logic_markers, LOGIC_MARKERS } from '../src/fq/lexicon.ts';

// 논리 펼치기 표지 (오종래 2026-10-19 — deploy/hmos-spec/논리펼치기_명세서.md §2)
describe('find_logic_markers', () => {
  it('명세서 §2의 네 갈래 표지를 그대로 담는다', () => {
    assert.deepEqual(Object.keys(LOGIC_MARKERS), ['결론연결', '근거제시', '대비반론', '수렴']);
    assert.ok(LOGIC_MARKERS.결론연결.includes('따라서'));
    assert.ok(LOGIC_MARKERS.근거제시.includes('다시 말해'));
  });

  it('갈래마다 찾은 표지를 낸다', () => {
    const r = find_logic_markers('(가)는 지역을 구성 요인으로 본다. 즉, 사투리는 지역 공동체의 말이다. 반면 (나)의 학생들은 이를 우열로 본다. 따라서 차별의 원인은 지역이다.');
    assert.deepEqual(r.근거제시, ['즉']);
    assert.deepEqual(r.대비반론, ['반면']);
    assert.deepEqual(r.결론연결, ['따라서']);
    assert.deepEqual(r.수렴, []);
  });

  it('낱말 안에 든 글자는 표지가 아니다 — 「보이는」의 「이는」 · 「즉시」의 「즉」', () => {
    const r = find_logic_markers('관심을 보이는 학생이 즉시 답했다.');
    assert.deepEqual(r.근거제시, []);
  });

  it('두 낱말 표지와 문장 첫머리 표지도 찾는다', () => {
    const r = find_logic_markers('이는 언어 공동체의 차이 때문이다.\n이에 반해 (다)는 세대를 든다. 이상에서 보듯 원인은 둘이다.');
    assert.deepEqual(r.근거제시, ['이는']);
    assert.deepEqual(r.대비반론, ['이에 반해']);
    assert.deepEqual(r.수렴, ['이상에서']);
  });

  it('표지가 없으면 모두 빈 배열', () => {
    const r = find_logic_markers('사투리를 쓰는 친구를 놀렸다.');
    assert.ok(Object.values(r).every((xs) => xs.length === 0));
  });
});
