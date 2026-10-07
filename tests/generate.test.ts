// 논제 생성 — 사회논술_문1 원문 (오종래 2026-10-07). 봉인 표지사전으로 돌린다 — 없으면 건너뛴다.
// 봉인 값은 출력하지 않는다. 결과의 구조만 단언한다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { connectPassage, generateQuestions, isSealedAvailable, recognizePassage, recognizeV2Analysis } from '../src/fq/index.ts';
import { loadSealedTable } from '../src/fq/sealed/index.ts';

const PASSAGE = `[가] 자유무역은 국제 사회에서 국가 간 상품, 서비스 교역 활동에 대한 관세 인하와 비관세 장벽 완화를 통한 무역 확대를 목표로 한다. 자유무역의 긍정적인 효과는 소비자들이 저렴하고 다양한 상품을 구매할 수 있고, 자국 기업이 타국 기업과 경쟁을 통해 기술과 품질을 향상시키는 데 도움이 된다는 것이다. 또한, 자유무역을 통한 수출 증가는 정부의 고용 창출과 자국 산업의 성장에 도움을 준다. 하지만 부정적인 효과도 존재한다. 자유무역을 통해 얻을 수 있는 이익이 무역 당사국 간에 균등하지 않을 수 있으며, 국가 간 경쟁력 차이로 인해 일부 국가가 피해를 입을 수도 있다. 또한, 자유무역을 하는 국가들은 수출입의 증가로 해외 의존도가 높아지고 국제 원자재 등의 수입가격 변동에 대한 민감도가 상승하며, 국제경제 상황이 자국 경제에 미치는 영향도 커지게 된다.

[나] A국은 오랜 기간 저렴한 제품의 수입을 대폭 확대해왔다. 그 결과 A국은 자국산 제품에 대한 수요가 줄었고, 일부 자국 기업이 파산하여 실업률이 상승하였다. 그러자 A국은 주요 수입품에 대해 고율의 관세를 부과함으로써 무역상대국이 A국에 수출한 제품에 대한 무역장벽을 높였다. 이에 대해 여러 무역상대국은 A국의 보호무역 정책이 세계무역기구(WTO)의 자유무역 원칙을 훼손한다고 주장하고 있다.

[다] B국은 무역 의존도가 높은 국가로, A국의 보호무역 정책 때문에 주요 수출품의 가격 경쟁력이 약화하여 수출이 감소하였다. 이에 따라 B국 기업의 수익이 줄어들고 B국의 상품수지도 악화하였다. 그럼에도 불구하고 B국 정부는 A국에 대한 직접적인 무역보복을 피하고 자국 기업의 경쟁력 강화를 위해 연구개발(R&D) 지원과 자유무역협정(FTA) 다변화 정책을 추진하여 손실을 만회하면서 여전히 자유무역의 이점을 강조하고 있다.

[라] C국은 원자재 중심의 수출국으로, 국제 원자재 가격 변화에 따라 자국 경제가 크게 영향을 받는다. 최근 A국의 보호무역 정책과 세계 경기 둔화로 인해 국제 원자재 수요가 줄어들면서 C국의 수출도 대폭 감소하였다. 이에 따라 C국은 상품수지 적자가 누적되고, 환율변동 때문에 수입품의 가격이 상승하여 국내 물가가 상승하였다.

[마] D국은 개방 경제 국가로 자유무역 체제를 적극적으로 지지해왔다. D국은 FTA를 통해 A국에서 농·축산품을 수입하고, A국에 가공·약적인 제품을 수출해왔다. 그런데 제시문 [나]와 같이 A국이 보호무역 정책을 강화하자 C국이 대응조치로 핵심 소재와 원자재 수출을 제한하여 D국은 필요한 소재와 원자재를 확보하기 어렵게 되었다. 결국 D국은 C국에 대한 의존도를 낮추기 위해 자국의 소재 생산기반을 확대하고 원자재 수입국을 다변화하는 정책을 펴고 있다.`;

const H1 = '[문항 1] 제시문 [가], [나], [다]를 참고하여 다음의 물음에 답하시오.';
const H2 = '[문항 2] 제시문 [가], [나], [라], [마]를 참고하여 다음의 물음에 답하시오.';
const QUESTIONS = [
  `${H1}\n(1-1) 자유무역이 국가의 경제에 미치는 긍정적인 영향을 경제주체별로 구분하여 설명하시오.`,
  `${H1}\n(1-2) A국의 보호무역 정책으로 인한 손실을 줄이기 위해, B국이 시행한 대응조치는 무엇인지 설명하시오.`,
  `${H2}\n(2-1) C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.`,
  `${H2}\n(2-2) A국과 C국의 무역분쟁으로 인한 손실을 줄이기 위해, D국이 시행한 정책이 자국의 경제에 어떤 도움이 될 수 있는지 설명하시오.`,
];

describe('논제 생성 — 사회논술_문1', { skip: !isSealedAvailable() && '봉인 표지사전 없음' }, () => {
  const run = () => {
    const table = loadSealedTable();
    const passage = recognizePassage(PASSAGE, table);
    const questions = QUESTIONS.map((q) => recognizeV2Analysis(q));
    const connections = questions.map((q) => connectPassage(q, passage));
    return { passage, questions, ...generateQuestions(passage, questions, connections, table) };
  };

  it('1. 기존 논제 4개 모두 판정한다 — 불완전·사족에는 까닭이 있다', () => {
    const { verdicts } = run();
    assert.equal(verdicts.length, 4);
    for (const v of verdicts) {
      assert.ok(['타당', '불완전', '사족'].includes(v.verdict));
      if (v.verdict !== '타당') assert.ok(v.reason);
    }
  });

  it('1. 급소가 둘인 논제(2-1)는 불완전 — 분리 필요', () => {
    const v = run().verdicts[2];
    assert.equal(v.pivots.length, 2);
    assert.equal(v.verdict, '불완전');
    assert.match(v.reason!, /분리/);
  });

  it('2. 후보 풀 — 쓰인 단락 급소와 기존 논제문에 나온 말은 들지 않는다', () => {
    const { pool, questions } = run();
    assert.ok(pool.length > 0);
    for (const e of pool) assert.ok(!questions.some((q) => q.question.includes(e.entity)), e.entity);
  });

  it('3·4. 후보마다 패턴이 맞고 논제문은 완성 문장이다', () => {
    const { candidates, questions } = run();
    assert.ok(candidates.length > 0);
    for (const c of candidates) {
      if (c.pattern === '비교형') assert.ok(c.labels.length >= 2);
      else assert.equal(c.labels.length, 1);
      if (c.pattern === '이유형') assert.ok(c.sources[0].result);
      assert.match(c.text, /^제시문 \[.+시오\.$/);
      assert.ok(!questions.some((q) => q.question.includes(c.keyword)));
    }
  });

  it('2. 중복 제거 — 다른 항목에 포함되는 짧은 항목은 빠지고, 같은 항목은 하나만 남는다', () => {
    const { pool } = run();
    for (const a of pool) assert.equal(pool.filter((b) => b.entity.includes(a.entity)).length, 1, a.entity);
    const entities = pool.map((e) => e.entity);
    assert.ok(entities.includes('비관세 장벽 완화를 통한 무역 확대'));
    assert.ok(!entities.includes('비관세 장벽 완화'));
  });

  it('2. 일반 항목 필터 — 국가명+일반명사 · 2글자 한자어 단독 · 지시어 시작은 풀에서 빠지고 까닭이 남는다', () => {
    const { pool, excluded } = run();
    const out = new Map(excluded.map((x) => [x.entry.entity, x.reason]));
    assert.equal(out.get('B국 정부'), '국가명+일반명사');
    assert.equal(out.get('국제 사회'), '2글자 한자어 단독');
    assert.ok(out.has('자국 경제'));
    for (const k of out.keys()) assert.ok(!pool.some((e) => e.entity === k), k);
    assert.ok(pool.some((e) => e.entity === '상품수지 적자'));
  });

  it('4. 논제문에는 잘린 조각이 아니라 원문의 명사구 전체가 들어간다', () => {
    const { candidates } = run();
    const keywords = candidates.map((c) => c.keyword);
    for (const k of keywords) {
      assert.ok(!k.includes(','), k);
      assert.doesNotMatch(k.split(' ')[0], /^(이에|그럼에도|그 결과|최근)$|(고|며|면서|해)$/, k);
    }
    assert.ok(keywords.includes('비관세 장벽 완화를 통한 무역 확대'));
    assert.ok(keywords.includes('주요 수출품의 가격 경쟁력'));
    assert.ok(keywords.includes('국제 원자재 등의 수입가격 변동에 대한 민감도'));
    assert.ok(!keywords.some((k) => ['통한 무역 확대', '이에 따라 C국', '국가로, A국'].includes(k)));
  });
});
