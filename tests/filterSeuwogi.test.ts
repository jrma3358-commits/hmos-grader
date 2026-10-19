import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterSeuwogi, filterSeuwogiDetailed } from '../src/rubric/filterSeuwogi.ts';

// 인문논술 세우기 필터 (오종래 2026-10-19). Claude 응답은 가짜 클라이언트로 — 고른 번호를 받아 남기는 규칙만 본다
const 목록 = ['가', '나', '다', '라', '마'].map((x, i) => ({ entity: '급소', source: x, text: `${i}번 문장이다.` }));
const 가짜 = (응답: string | Error) => ({
  messages: { create: async () => { if (응답 instanceof Error) throw 응답; return { content: [{ type: 'text', text: 응답 }] }; } },
}) as any;

describe('filterSeuwogi', () => {
  it('Claude가 고른 번호의 문장만 급소 수만큼', async () => {
    const r = await filterSeuwogiDetailed(목록, { keyword: '급소' }, 2, 'humanities', 가짜('[3, 1]'));
    assert.deepEqual(r.결과.map((s) => s.source), ['라', '나']);
    assert.equal(r.방법, 'Claude');
  });

  it('첫 블록이 thinking이어도 text 블록의 배열을 읽는다', async () => {
    const 생각먼저 = { messages: { create: async () => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '```json\n[4]\n```' }] }) } } as any;
    assert.deepEqual((await filterSeuwogi(목록, { keyword: '급소' }, 1, 'humanities', 생각먼저)).map((s) => s.source), ['마']);
  });

  it('급소 수보다 많이 고르거나 범위 밖·겹친 번호는 버린다', async () => {
    assert.deepEqual((await filterSeuwogi(목록, { keyword: '급소' }, 2, 'humanities', 가짜('[9, 0, 0, 2, 4]'))).map((s) => s.source), ['가', '다']);
  });

  it('응답이 JSON이 아니거나 API가 실패해도 막지 않는다 — 앞에서 급소 수만큼', async () => {
    for (const 응답 of ['고를 수 없음', '[]', new Error('연결 실패')]) {
      const r = await filterSeuwogiDetailed(목록, { keyword: '급소' }, 3, 'humanities', 가짜(응답));
      assert.deepEqual(r.결과.map((s) => s.source), ['가', '나', '다']);
      assert.equal(r.방법, '앞에서 3개');
    }
  });

  it('수리이거나 이미 급소 수 이하면 부르지 않고 그대로', async () => {
    const 터짐 = 가짜(new Error('부르면 안 됨'));
    assert.equal((await filterSeuwogiDetailed(목록, { keyword: '급소' }, 1, 'science', 터짐)).방법, '그대로');
    assert.equal((await filterSeuwogiDetailed(목록.slice(0, 2), { keyword: '급소' }, 3, 'humanities', 터짐)).방법, '그대로');
  });
});
