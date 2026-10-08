// 문항 유형 감지 — 서숳형문항2차검증 문항1 · 사회논술_문1 원문 (generate.test.ts와 같은 원문)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { confirmType, detectType, isSealedAvailable, recognizePassage, recognizeV2Analysis } from '../src/fq/index.ts';
import { loadSealedTable } from '../src/fq/sealed/index.ts';

const 문항1 =
  '다음 그림은 삼각함수 y = a sin(bx + c)의 그래프를 좌표평면 위에 나타낸 것이다. a > 0, b > 0, 0 ≤ c ≤ π/2일 때 상수 a, b, c의 값을 구하고, 그 이유를 서술하시오. [6점]';

const 사회논술_문1 = `[가] 자유무역은 국제 사회에서 국가 간 상품, 서비스 교역 활동에 대한 관세 인하와 비관세 장벽 완화를 통한 무역 확대를 목표로 한다. 자유무역의 긍정적인 효과는 소비자들이 저렴하고 다양한 상품을 구매할 수 있고, 자국 기업이 타국 기업과 경쟁을 통해 기술과 품질을 향상시키는 데 도움이 된다는 것이다. 또한, 자유무역을 통한 수출 증가는 정부의 고용 창출과 자국 산업의 성장에 도움을 준다. 하지만 부정적인 효과도 존재한다. 자유무역을 통해 얻을 수 있는 이익이 무역 당사국 간에 균등하지 않을 수 있으며, 국가 간 경쟁력 차이로 인해 일부 국가가 피해를 입을 수도 있다. 또한, 자유무역을 하는 국가들은 수출입의 증가로 해외 의존도가 높아지고 국제 원자재 등의 수입가격 변동에 대한 민감도가 상승하며, 국제경제 상황이 자국 경제에 미치는 영향도 커지게 된다.

[나] A국은 오랜 기간 저렴한 제품의 수입을 대폭 확대해왔다. 그 결과 A국은 자국산 제품에 대한 수요가 줄었고, 일부 자국 기업이 파산하여 실업률이 상승하였다. 그러자 A국은 주요 수입품에 대해 고율의 관세를 부과함으로써 무역상대국이 A국에 수출한 제품에 대한 무역장벽을 높였다. 이에 대해 여러 무역상대국은 A국의 보호무역 정책이 세계무역기구(WTO)의 자유무역 원칙을 훼손한다고 주장하고 있다.

[다] B국은 무역 의존도가 높은 국가로, A국의 보호무역 정책 때문에 주요 수출품의 가격 경쟁력이 약화하여 수출이 감소하였다. 이에 따라 B국 기업의 수익이 줄어들고 B국의 상품수지도 악화하였다. 그럼에도 불구하고 B국 정부는 A국에 대한 직접적인 무역보복을 피하고 자국 기업의 경쟁력 강화를 위해 연구개발(R&D) 지원과 자유무역협정(FTA) 다변화 정책을 추진하여 손실을 만회하면서 여전히 자유무역의 이점을 강조하고 있다.

[라] C국은 원자재 중심의 수출국으로, 국제 원자재 가격 변화에 따라 자국 경제가 크게 영향을 받는다. 최근 A국의 보호무역 정책과 세계 경기 둔화로 인해 국제 원자재 수요가 줄어들면서 C국의 수출도 대폭 감소하였다. 이에 따라 C국은 상품수지 적자가 누적되고, 환율변동 때문에 수입품의 가격이 상승하여 국내 물가가 상승하였다.

[마] D국은 개방 경제 국가로 자유무역 체제를 적극적으로 지지해왔다. D국은 FTA를 통해 A국에서 농·축산품을 수입하고, A국에 가공·약적인 제품을 수출해왔다. 그런데 제시문 [나]와 같이 A국이 보호무역 정책을 강화하자 C국이 대응조치로 핵심 소재와 원자재 수출을 제한하여 D국은 필요한 소재와 원자재를 확보하기 어렵게 되었다. 결국 D국은 C국에 대한 의존도를 낮추기 위해 자국의 소재 생산기반을 확대하고 원자재 수입국을 다변화하는 정책을 펴고 있다.

[문항 1] 제시문 [가], [나], [다]를 참고하여 다음의 물음에 답하시오.
(1-1) 자유무역이 국가의 경제에 미치는 긍정적인 영향을 경제주체별로 구분하여 설명하시오.
(1-2) A국의 보호무역 정책으로 인한 손실을 줄이기 위해, B국이 시행한 대응조치는 무엇인지 설명하시오.
[문항 2] 제시문 [가], [나], [라], [마]를 참고하여 다음의 물음에 답하시오.
(2-1) C국과 같은 원자재 중심의 수출국이 국제무역 환경의 변화 때문에 겪는 구조적 약점을 제시하고, 국내 물가 상승의 이유를 설명하시오.
(2-2) A국과 C국의 무역분쟁으로 인한 손실을 줄이기 위해, D국이 시행한 정책이 자국의 경제에 어떤 도움이 될 수 있는지 설명하시오.`;

describe('문항 유형 감지', () => {
  it('문항1 — 수학서술형 (수식 + 조건 + 구하시오·서술하시오)', () => {
    const r = detectType(문항1);
    assert.equal(r.type, '수학서술형');
    assert.equal(r.subType, undefined);
    assert.ok(r.flags.includes('조건:부등호'));
    assert.ok(r.flags.some((f) => f.startsWith('수식:')));
    assert.ok(r.confidence >= 0.9);
  });

  it('문항1 — 서술 표지 「서술하시오」「이유를」 → 수학서술형 (수학주관식 아님)', () => {
    const r = detectType(문항1);
    assert.equal(r.type, '수학서술형');
    assert.ok(r.flags.includes('서술표지:서술하시오'));
    assert.ok(r.flags.includes('서술표지:이유를'));
  });

  it('주관식 예시 — 서술 표지 없이 「구하시오」만 → 주관식 (조건 부등식이 없어 수학주관식 아님)', () => {
    const r = detectType('함수 f(x) = x² + 1의 최솟값을 구하시오');
    assert.equal(r.type, '주관식');
    assert.ok(r.flags.includes('주관표지:구하시오'));
    assert.ok(!r.flags.some((f) => f.startsWith('서술표지:')));
    assert.ok(!r.flags.includes('조건:부등호'));
  });

  it('꺾쇠 제목 <규칙>·〈보기〉는 조건:부등호가 아니다 (서술형 문항3) · 진짜 부등호는 그대로', () => {
    assert.ok(!detectType('다음 <규칙>에 따라 옮기려고 한다. 과정을 설명하시오.').flags.includes('조건:부등호'));
    assert.ok(!detectType('〈보기〉에서 고르시오.').flags.includes('조건:부등호'));
    assert.ok(detectType('<규칙>을 따르고 a < b일 때 설명하시오.').flags.includes('조건:부등호'));
  });

  it('사회논술_문1 — 논술형 + 단계형 ((1-1)~(2-2) 소문항)', () => {
    const r = detectType(사회논술_문1);
    assert.equal(r.type, '논술형');
    assert.equal(r.subType, '단계형');
    assert.ok(r.flags.includes('제시문:[가][나][다][라][마]'));
    assert.ok(!r.flags.some((f) => f.startsWith('수식:')));
    assert.ok(r.confidence >= 0.9);
  });
});

// 수리논술 예시 — 시험 원문이 아니라 2단계 기준 1(B 수식 + 라벨 2개)을 세우려고 만든 문항이다.
// [가]는 수리논술_문_4 제시문(근과 계수의 관계)을 빌렸다.
const 수리논술_예시_제시문 = `[가] 이차방정식 ax² + bx + c = 0의 두 근을 α, β라고 하면 α + β = -b/a, αβ = c/a 이다.

[나] 함수 f(x) = x² - 2x + k의 그래프는 x축과 서로 다른 두 점에서 만난다.`;
const 수리논술_예시_논제 = '제시문 [가], [나]를 참고하여 방정식 f(x) = 0의 두 근의 합을 구하고 그 이유를 논하시오.';

describe('문항 유형 확정 (2단계)', { skip: !isSealedAvailable() && '봉인 표지사전 없음' }, () => {
  const table = () => loadSealedTable();

  it('문항1 — 수학서술형 (B 수식 + C 부등식)', () => {
    const r = confirmType(문항1, recognizeV2Analysis(문항1), recognizePassage(문항1, table()));
    assert.equal(r.type, '수학서술형');
    assert.equal(r.subType, undefined);
    assert.equal(r.surface.type, '수학서술형');
    assert.equal(r.overridden, false);
    assert.ok(r.flags.some((f) => f.startsWith('확정:B수식')));
    assert.ok(r.flags.some((f) => f.startsWith('확정:C부등식')));
  });

  it('사회논술_문1 — 논술형 + 단계형 (단락 라벨 5개)', () => {
    const at = 사회논술_문1.indexOf('[문항 1]');
    const passage = recognizePassage(사회논술_문1.slice(0, at), table());
    const r = confirmType(사회논술_문1, recognizeV2Analysis(사회논술_문1.slice(at)), passage);
    assert.equal(r.type, '논술형');
    assert.equal(r.subType, '단계형');
    assert.equal(r.overridden, false);
    assert.ok(r.flags.includes('확정:단락라벨[가][나][다][라][마]'));
  });

  it('수리논술 예시 — 수리논술 (B 수식 + 단락 라벨 2개)', () => {
    const text = `${수리논술_예시_제시문}\n\n${수리논술_예시_논제}`;
    const r = confirmType(text, recognizeV2Analysis(수리논술_예시_논제), recognizePassage(수리논술_예시_제시문, table()));
    assert.equal(r.type, '수리논술');
    assert.equal(r.surface.type, '수리논술');
    assert.equal(r.overridden, false);
    assert.ok(r.flags.some((f) => f.startsWith('확정:B수식')));
    assert.ok(r.flags.includes('확정:단락라벨[가][나]'));
  });
});
