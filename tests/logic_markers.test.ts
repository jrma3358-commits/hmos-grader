import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { find_logic_markers } from '../src/fq/logic_markers.ts';
import { sealedPath } from '../src/fq/index.ts';

// 논리 펼치기 표지 (오종래 2026-10-19 — deploy/hmos-spec/논리펼치기_명세서.md §2). 표지 목록은 봉인 표지사전 「논리펼치기」에 있다 —
// 여기서는 명세서 §2의 목록을 시험용으로 받아 찾는 규칙(낱말 자리)만 본다
const 표 = {
  결론연결: ['따라서', '그러므로', '이를 통해', '이로써', '결국', '종합하면', '이처럼'],
  근거제시: ['왜냐하면', '이는', '즉', '다시 말해', '구체적으로'],
  대비반론: ['반면', '그러나', '하지만', '이에 반해', '반대로'],
  수렴: ['이처럼', '결국', '종합하면', '이상에서'],
};

describe('find_logic_markers', () => {
  it('갈래마다 찾은 표지를 낸다', () => {
    const r = find_logic_markers('(가)는 지역을 구성 요인으로 본다. 즉, 사투리는 지역 공동체의 말이다. 반면 (나)의 학생들은 이를 우열로 본다. 따라서 차별의 원인은 지역이다.', 표);
    assert.deepEqual(r.근거제시, ['즉']);
    assert.deepEqual(r.대비반론, ['반면']);
    assert.deepEqual(r.결론연결, ['따라서']);
    assert.deepEqual(r.수렴, []);
  });

  it('낱말 안에 든 글자는 표지가 아니다 — 「보이는」의 「이는」 · 「즉시」의 「즉」', () => {
    const r = find_logic_markers('관심을 보이는 학생이 즉시 답했다.', 표);
    assert.deepEqual(r.근거제시, []);
  });

  it('두 낱말 표지와 문장 첫머리 표지도 찾는다', () => {
    const r = find_logic_markers('이는 언어 공동체의 차이 때문이다.\n이에 반해 (다)는 세대를 든다. 이상에서 보듯 원인은 둘이다.', 표);
    assert.deepEqual(r.근거제시, ['이는']);
    assert.deepEqual(r.대비반론, ['이에 반해']);
    assert.deepEqual(r.수렴, ['이상에서']);
  });

  it('표지가 없으면 모두 빈 배열', () => {
    const r = find_logic_markers('사투리를 쓰는 친구를 놀렸다.', 표);
    assert.ok(Object.values(r).every((xs) => xs.length === 0));
  });

  it('봉인 표지사전이 있으면 「논리펼치기」 네 갈래가 명세서 §2와 같다', { skip: !existsSync(sealedPath()) }, () => {
    const 봉인 = JSON.parse(readFileSync(sealedPath(), 'utf8'));
    assert.deepEqual(봉인.논리펼치기, 표);
  });
});
