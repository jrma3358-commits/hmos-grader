// 제시문 핵심 한 줄 · 제시문 간 관계(봉인⑧) — 5·6단계 키워드 입력창 위 (오종래 2026-10-21).
// 핵심은 6단계 단락 급소(표기로 보인다), 없으면 제시문 전체 급소. 관계는 봉인⑧ (유사 → 실증 → 대비).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { passage_cores } from '../src/thesis/passage_core.ts';
import type { 급소단락 } from '../src/thesis/relate.ts';

const 단락 = (단락: string, 급소: string, 표기 = 급소): 급소단락 => ({ 단락, 자리: 0, 급소, 열쇠: 급소, 소문항: [null], 표기 });

describe('제시문 핵심 · 관계 (오종래 2026-10-21)', () => {
  it('단락 급소가 있으면 표기로 보이고, 같은 실체를 품으면 유사', () => {
    const r = passage_cores(
      [{ id: '가', 텍스트: '자유무역은 교역을 넓힌다.' }, { id: '나', 텍스트: '자유무역의 효과는 크다.' }],
      [단락('가', '자유무역', '자유무역이 미치는 영향'), 단락('나', '자유무역의 효과')],
    );
    assert.deepEqual(r.핵심.map((x) => [x.id, x.핵심, x.출처]), [['가', ['자유무역이 미치는 영향'], '단락 급소'], ['나', ['자유무역의 효과'], '단락 급소']]);
    assert.deepEqual(r.관계.map((x) => [x.a, x.b, x.유형]), [['가', '나', '유사']]);
  });

  it('핵심이 서로 다르면 대비, 핵심이 서지 않은 제시문은 빈 핵심이고 관계에서 빠진다', () => {
    const r = passage_cores(
      [{ id: '가', 텍스트: '' }, { id: '나', 텍스트: '' }, { id: '다', 텍스트: '' }],
      [단락('가', '자유'), 단락('나', '평등')],
    );
    assert.deepEqual(r.핵심.map((x) => [x.id, x.핵심, x.출처]), [['가', ['자유'], '단락 급소'], ['나', ['평등'], '단락 급소'], ['다', [], null]]);
    assert.deepEqual(r.관계.map((x) => [x.a, x.b, x.유형]), [['가', '나', '대비']]);
  });
});
