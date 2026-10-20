// 1차 필터[a] — 문항분석 명세서-2 §2·§3·§5를 기준으로 한 테스트.
// 기대값은 엔진 출력이 아니라 **명세와 2026-09-30 오종래 확정**에서 온다. 봉인 값은 쓰지 않는다(노드를 손으로 세운다).
// 봉인⑬은 오종래 2026-10-13, 봉인⑦~⑫는 2026-10-20 기준으로 채워졌다. ⑨ 표지 목록은 봉인 표지사전 「논제요구」 — 시험은 목록을 따로 받는다.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { V2Analysis } from '../src/fq/pipeline.ts';
import type { Color } from '../src/fq/types.ts';
import type { PathNode } from '../src/fq/v2/graph.ts';
import type { Pivot } from '../src/fq/v2/pivot.ts';
import { analyze_descriptive } from '../src/filter/descriptive.ts';
import { judge_item, 제시문상한 } from '../src/filter/judge.ts';
import { 봉인10_관계적절, 봉인11_요소결손, 봉인12_중의성, 봉인13_정교화진단, 엔진단위 } from '../src/filter/sealed/items.ts';
import { 봉인8_관계대조 } from '../src/filter/sealed/relation.ts';
import { 봉인7_소문항분리, 이어달리기 } from '../src/filter/sealed/stepwise.ts';
import { 논제요구표지, 봉인9_논제요구, 부른제시문, 요구of } from '../src/filter/sealed/thesis.ts';
import { existsSync } from 'node:fs';
import { sealedPath } from '../src/fq/sealed/index.ts';
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

describe('서술형 전용 봉인 — B만 돌린다 (⑦ · ⑩~⑫)', () => {
  // [오종래 2026-10-16] 서술형 전용 판정(⑦ 소문항 분리 · ⑩ 바탕→도달 관계 · ⑪ 요소 결손 · ⑫ 중의성) — 파이프라인 A는 돌리지 않는다
  const 수능17 = "17. 다항함수 f(x)에 대하여 f'(x)=9x²+4x이고 f(1)=6일 때, f(2)의 값을 구하시오. [3점]";
  const 계단2 = '질량 2 kg인 물체가 3 m/s로 움직인다. 물음에 답하시오.\n(1) 물체의 운동량을 구하시오.\n(2) (1)에서 구한 운동량으로 0.5초 동안 멈추게 하는 평균 힘의 크기를 구하시오.';
  /** A 판정 — 비어 있는 봉인 없이 끝까지 서고, 항목은 급소 명확 · 정교화 필요(⑬)뿐 */
  const A항목 = (r: ReturnType<typeof judge_item>) => {
    assert.ok(!('소문항' in r), 'A는 소문항으로 나누지 않는다');
    return r.항목.map((x) => x.증상);
  };

  it('⑩ 관계 적절 · ⑪ 요소 결손 · ⑫ 중의성은 B만 — A는 건너뛴다', () => {
    // ⑩⑪⑫가 채워져 B는 끝까지 선다
    const B항목 = ['급소 명확', '관계 적절', '요소 결손', '중의성', '정교화 필요'];
    assert.deepEqual(A항목(judge_item({ 유형: '단독문제', 텍스트: 수능17, 파이프라인: 'B' })), B항목);
    assert.deepEqual(A항목(judge_item({ 유형: '단독문제', 텍스트: 수능17 })), B항목); // 주지 않으면 B와 같다
    assert.deepEqual(A항목(judge_item({ 유형: '단독문제', 텍스트: 수능17, 파이프라인: 'A' })), ['급소 명확', '정교화 필요']);
  });

  it('⑦ 소문항 분리는 B만 — A 계단식은 문항 전체를 하나로', () => {
    // ⑦은 채워져 소문항마다 ⑩⑪⑫를 지나 판정이 선다
    const r = judge_item({ 유형: '계단식 단계형', 텍스트: 계단2, 파이프라인: 'B' });
    assert.ok('소문항' in r);
    assert.equal(r.소문항.length, 2);
    assert.deepEqual(A항목(judge_item({ 유형: '계단식 단계형', 텍스트: 수능17, 파이프라인: 'A' })), ['급소 명확', '정교화 필요']);
  });
});

describe('봉인⑦ 계단식 단계형 소문항 분리 — 이어달리기 표지면 계단식, 없으면 병렬 (오종래 2026-10-20)', () => {
  it('(1)(2)를 각각 소문항으로 나누고, 「(1)에서 구한」이 있으면 계단식 — 앞번호 1', () => {
    const s = 봉인7_소문항분리('물음에 답하시오.\n(1) 운동량을 구하시오.\n(2) (1)에서 구한 운동량으로 평균 힘을 구하시오.');
    assert.deepEqual(s.map((x) => [x.번호, x.관계, x.앞번호]), [['1', null, undefined], ['2', '계단식', '1']]);
    assert.equal(s[0].텍스트, '운동량을 구하시오.');
  });

  it('「위에서 구한」 — 번호를 가리키지 않으면 바로 앞 소문항', () => {
    const s = 봉인7_소문항분리('(1) 질량을 구하시오.\n(2) 부피를 구하시오.\n(3) 위에서 구한 값으로 밀도를 구하시오.');
    assert.deepEqual(s.map((x) => [x.관계, x.앞번호]), [[null, undefined], ['병렬', undefined], ['계단식', '2']]);
  });

  it('이어달리기 표지가 없으면 병렬 독립', () => {
    const s = 봉인7_소문항분리('(1) 반응식을 쓰시오.\n(2) 넣어야 할 질량을 계산하시오.');
    assert.deepEqual(s.map((x) => x.관계), [null, '병렬']);
  });

  it('표지 꼴 — (N) · [N-M] · 위 · 앞 문항에서 구한', () => {
    assert.deepEqual(이어달리기('(2)에서 구한 값'), { 번호: '2' });
    assert.deepEqual(이어달리기('[1-3]에서 구한 함수'), { 번호: '1-3' });
    assert.deepEqual(이어달리기('위에서 구한 값'), { 번호: null });
    assert.deepEqual(이어달리기('앞 문항에서 구한 값'), { 번호: null });
    assert.equal(이어달리기('위에서 설명한 원리'), null);
  });
});

describe('봉인⑪ 요소 결손 — 계열별 파트 조각이 모두 0개인가 (오종래 2026-10-20)', () => {
  const k = kOf(node('k', 'B', '급소'));
  const 분석 = (파트들: 파트[]) => ({
    판정: null, k, 실체: summarize_substance(k, { 조합: [], nodes: [k.node] }, []),
    조각들: 파트들.map((p, i) => piece(`${p}-${i}`, p, k.node)),
  });

  it('수리계산형 — 세우기 · 풀기 · 답구하기가 모두 0개면 결손, 근거대기만 있어도 결손', () => {
    assert.equal(봉인11_요소결손(분석([]), '수리').length, 1);
    assert.equal(봉인11_요소결손(분석(['근거대기']), '수리').length, 1);
  });

  it('수리계산형 — 셋 중 하나라도 있으면 통과', () => {
    for (const p of ['세우기', '풀기', '답구하기'] as 파트[]) assert.deepEqual(봉인11_요소결손(분석([p]), '수리'), [], p);
  });

  it('논리서술형 — 근거대기 · 논지(세우기) · 서술(풀기 · 답구하기)이 모두 0개면 결손, 하나라도 있으면 통과', () => {
    assert.equal(봉인11_요소결손(분석([]), '인문사회국어').length, 1);
    for (const p of ['근거대기', '세우기', '풀기', '답구하기'] as 파트[]) assert.deepEqual(봉인11_요소결손(분석([p]), '인문사회국어'), [], p);
  });

  it('계열을 모르면 수리 구조', () => {
    assert.equal(봉인11_요소결손(분석(['근거대기'])).length, 1);
  });
});

describe('봉인⑧ 관계 대조 — 유사 → 실증 → 대비 (오종래 2026-10-20)', () => {
  const 제시문 = (id: string, 핵심: string, 다른: string[] = []) => {
    const k = node(`${id}k`, 'B', 핵심);
    return { id, 핵심: kOf(k), 노드: [k, ...다른.map((e, i) => node(`${id}${i}`, 'B', e))] };
  };

  it('한 핵심이 다른 핵심을 품으면 유사 (같은 방향)', () => {
    assert.equal(봉인8_관계대조(제시문('가', '포장의 역할'), 제시문('나', '포장')), '유사');
  });

  it('한 제시문의 노드(자기 핵심 밖)가 다른 제시문의 핵심을 품으면 실증 (뒷받침)', () => {
    assert.equal(봉인8_관계대조(제시문('가', '소비주의'), 제시문('나', '고가의 재화', ['소비주의 사회의 사례'])), '실증');
    assert.equal(봉인8_관계대조(제시문('가', '고가의 재화', ['소비주의 사회의 사례']), 제시문('나', '소비주의')), '실증');
  });

  it('그 밖은 대비 (핵심이 서로 다르다)', () => {
    assert.equal(봉인8_관계대조(제시문('가', '자유'), 제시문('나', '평등')), '대비');
  });

  it('유사가 실증보다 먼저', () => {
    assert.equal(봉인8_관계대조(제시문('가', '포장'), 제시문('나', '포장의 역할', ['포장 사례'])), '유사');
  });
});

describe('봉인⑨ 논제 요구 — 표적 → 관계 → 도구, 기본값 도구 (오종래 2026-10-20)', () => {
  const 표 = { 표적: ['비판', '반박'], 관계: ['공통점', '차이점'], 도구: ['바탕으로', '참고하여'] };

  it('표적이 관계·도구보다 먼저 — 「참고하여 비판하시오」는 표적', () => {
    assert.deepEqual(요구of('[가]를 참고하여 [나]를 비판하시오.', 표), { 종류: '표적', 표지: '비판' });
    assert.deepEqual(요구of('[가]와 [나]의 공통점을 바탕으로 서술하시오.', 표), { 종류: '관계', 표지: '공통점' });
    assert.deepEqual(요구of('[가]를 바탕으로 논하시오.', 표), { 종류: '도구', 표지: '바탕으로' });
  });

  it('표지가 없으면 도구 (기본값)', () => {
    assert.deepEqual(요구of('[가]에 대하여 논하시오.', 표), { 종류: '도구', 표지: null });
  });

  it('부른 제시문 — [가] (나) 〈보기〉 · 범위 [가]~[다]', () => {
    assert.deepEqual(부른제시문('〈보기〉와 (나)를 읽고', ['보기', '가', '나']), ['보기', '나']);
    assert.deepEqual(부른제시문('[가]~[다]를 모두 활용하여', ['가', '나', '다', '라']), ['가', '나', '다']);
  });

  it('봉인 표지사전이 있으면 「논제요구」 세 목록이 확정과 같다', { skip: !existsSync(sealedPath()) }, () => {
    assert.deepEqual(논제요구표지(), {
      표적: ['비판', '반박', '반론', '문제점', '한계'],
      관계: ['공통점', '차이점', '비교', '대조', '관계'],
      도구: ['바탕으로', '활용하여', '참고하여', '근거로', '이용하여'],
    });
  });

  it('제시문을 부르는 문장마다 요구 하나 — 부르지 않으면 제시문 전부 도구', { skip: !existsSync(sealedPath()) }, () => {
    const k = kOf(node('k', 'B', '영향'));
    const r = 봉인9_논제요구(k, ['가', '나'], '[가]의 관점에서 [나]를 비판하시오. 그리고 자신의 견해를 쓰시오.');
    assert.deepEqual(r.map((x) => [x.종류, x.제시문]), [['표적', ['가', '나']]]);
    assert.deepEqual(봉인9_논제요구(k, ['가', '나'], '견해를 쓰시오.').map((x) => [x.종류, x.제시문]), [['도구', ['가', '나']]]);
  });
});

describe('봉인⑫ 중의성 — 한 소문항 안에서 같은 실체가 색이 다른 노드로 (오종래 2026-10-20)', () => {
  const 분석 = (nodes: PathNode[], k: PathNode) => ({ 판정: null, k: kOf(k), 조각들: [], 실체: summarize_substance(kOf(k), { 조합: [], nodes }, []) });

  it('같은 실체가 다른 색(의미)으로 두 번 — 중의성', () => {
    const b = node('b1', 'B', '속도');
    const c = node('c1', 'C', '속도');
    const k = node('k', 'Q', '구하시오');
    assert.deepEqual(봉인12_중의성(분석([b, c, k], k)), ['「속도」 B(b1) · C(c1)']);
  });

  it('같은 실체가 같은 색으로 두 번은 한 의미 — 통과', () => {
    const k = node('k', 'Q', '구하시오');
    assert.deepEqual(봉인12_중의성(분석([node('b1', 'B', '속도'), node('b2', 'B', '속도'), k], k)), []);
  });

  it('색 미결 노드는 세지 않는다', () => {
    const k = node('k', 'Q', '구하시오');
    assert.deepEqual(봉인12_중의성(분석([node('b1', 'B', '속도'), node('x', null, '속도'), k], k)), []);
  });

  it('여러 소문항에 같은 실체가 걸쳐도 소문항마다 독립 논제면 통과 — 소문항 하나씩 본다', () => {
    const r = judge_item({ 유형: '계단식 단계형', 파이프라인: 'B', 텍스트: '물음에 답하시오.\n(1) 질량 2 kg인 물체의 운동량을 구하시오.\n(2) 질량 2 kg인 물체가 5 m 떨어질 때 운동량을 구하시오.' });
    assert.ok('소문항' in r);
    for (const s of r.소문항) assert.equal(s.판정.항목.find((x) => x.증상 === '중의성')?.판정, '통과');
  });
});

describe('봉인⑩ 서술형 바탕→도달 — 급소 앞 배경의 숫자·조건 표지 (오종래 2026-10-20)', () => {
  const 판정 = (nodes: PathNode[], k: PathNode) => 봉인10_관계적절(summarize_substance(kOf(k), { 조합: [], nodes }, []), kOf(k));

  it('급소 앞 배경에 숫자(단위 포함)가 있으면 연결 완료', () => {
    for (const 수치 of ['10 m/s의 속도', '200g', '0.1초']) {
      const b = node('b', 'B', 수치); // 길 순서 = 만든 순서 (index)
      const k = node('k', 'Q', '몇 N인가?');
      assert.equal(판정([b, k], k).결과, '연결 완료', 수치);
    }
  });

  it('급소 앞 배경에 조건 표지(라고 한다면 · 일 때 · 이면 · 경우)가 있으면 연결 완료', () => {
    for (const 조건 of ['접촉 시간이 짧다라고 한다면', '함수가 최대일 때', '두 값이 같은 것이면', '마찰이 없는 경우']) {
      const c = node('c', 'C', 조건);
      const k = node('k', 'Q', '설명하시오');
      assert.equal(판정([c, k], k).결과, '연결 완료', 조건);
    }
  });

  it('표지 표층형에 걸린 조건도 본다 — 「일 때」가 표지인 C 노드', () => {
    const c = { ...node('c', 'C', 'f(x)가 최대'), surface: '일 때' };
    const k = node('k', 'Q', '구하시오');
    assert.equal(판정([c, k], k).결과, '연결 완료');
  });

  it('배경이 없거나 숫자·조건 표지가 없으면 보완 권장 — 급소만 단독', () => {
    const k = node('k', 'B', '운동량');
    assert.equal(판정([k, node('q', 'Q', '무엇인가?')], k).결과, '보완 권장');
    const k2 = node('k2', 'Q', '설명하시오');
    assert.equal(판정([node('b', 'B', '운동량의 뜻'), k2], k2).결과, '보완 권장');
  });

  it('급소 뒤의 숫자는 배경이 아니다', () => {
    const k = node('k', 'B', '평균 힘');
    assert.equal(판정([k, node('q', 'Q', '3가지를 쓰시오')], k).결과, '보완 권장');
  });
});

describe('봉인⑬ 정교화 4갈래 진단 (오종래 2026-10-13)', () => {
  const pv = (n: PathNode, convergence: number, reason: Pivot['reason'] = '최수렴 B'): Pivot => ({ node: n, reason, convergence, sameAsDeepest: false });
  // 길 순서 = 배열 순서 (index를 다시 매긴다)
  const 논제 = (nodes: PathNode[], pivot: V2Analysis['pivot'], question = '논제'): V2Analysis =>
    ({
      question,
      graph: { question, nodes: nodes.map((n, index) => ({ ...n, index })), edges: [], combination: [], undecided: [] },
      form: null,
      pivot,
    }) as unknown as V2Analysis;
  const 갈래들 = (a: V2Analysis) => 봉인13_정교화진단(엔진단위(a), []).map((d) => d.갈래);

  it('① 일방흐름 — 급소 B 바로 다음이 Q이고 C 노드가 없다', () => {
    const b = node('b', 'B');
    assert.deepEqual(갈래들(논제([node('p', 'P'), b, node('q', 'Q')], { ok: true, pivot: pv(b, 1) })), ['일방흐름']);
  });

  it('① C 노드가 하나라도 있으면 일방흐름이 아니다', () => {
    const b = node('b', 'B');
    assert.deepEqual(갈래들(논제([node('c', 'C'), b, node('q', 'Q')], { ok: true, pivot: pv(b, 1) })), []);
  });

  it('① 급소가 아닌 B는 보지 않는다', () => {
    const b1 = node('b1', 'B');
    const b2 = node('b2', 'B');
    assert.deepEqual(갈래들(논제([b1, node('q1', 'Q'), b2, node('d', 'D'), node('q2', 'Q')], { ok: true, pivot: pv(b2, 1) })), []);
  });

  it('② 서술복잡 — B 3개 이상이고 C-F 노드가 없다', () => {
    const bs = [node('b1', 'B'), node('b2', 'B'), node('b3', 'B')];
    assert.deepEqual(갈래들(논제([...bs, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(bs[2], 2) })), ['서술복잡']);
  });

  it('② 자료 분석형 소문항(〈자료 N〉·[자료 N] 참조)은 서술복잡을 내리지 않는다 (오종래 2026-10-20)', () => {
    const bs = [node('b1', 'B'), node('b2', 'B'), node('b3', 'B')];
    const a = 논제([...bs, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(bs[2], 2) });
    assert.deepEqual(봉인13_정교화진단([{ 이름: '1', 인식: a, 자료분석: true }], []).map((d) => d.갈래), []);
  });

  it('① 자료 분석형 병렬 소문항은 일방흐름을 내리지 않는다 (오종래 2026-10-20)', () => {
    const b = node('b', 'B');
    const a = 논제([b, node('q', 'Q')], { ok: true, pivot: pv(b, 1) });
    assert.deepEqual(봉인13_정교화진단([{ 이름: '2', 인식: a, 자료분석: true }], []).map((d) => d.갈래), ['일방흐름']);
    assert.deepEqual(봉인13_정교화진단([{ 이름: '2', 인식: a, 자료분석: true, 병렬자료: true }], []).map((d) => d.갈래), []);
  });

  it('② 기호뿐인 B(「(나)」「ⓐ」「ⓐ~ⓓ」)는 세지 않는다 — 기호 뒤 명사구가 붙으면 센다 (오종래 2026-10-15 안 A)', () => {
    const 기호들 = [node('l1', 'B', '(나)'), node('l2', 'B', 'ⓐ'), node('l3', 'B', '(라)'), node('l4', 'B', 'ⓐ~ⓓ')];
    const b = node('b', 'B', '차별·혐오 표현이 발생하는 원인');
    assert.deepEqual(갈래들(논제([...기호들, b, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(b, 1) })), []);
    const 붙은 = [node('l1', 'B', '(나)'), node('b1', 'B', 'ⓐ~ⓓ에 담긴 차별적 인식'), node('b2', 'B', '요인'), node('b3', 'B', '근거')];
    assert.deepEqual(갈래들(논제([...붙은, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(붙은[3], 1) })), ['서술복잡']);
  });

  it('② 물음 앞 배경 문장(「~다.」)의 B는 세지 않는다 (오종래 2026-10-15 안 B)', () => {
    // 실제 글자 자리로 — 「가를 나는 있다. 다를 라를 마를 하시오.」
    const q = '가를 나는 있다. 다를 라를 마를 하시오.';
    const at = (s: string, color: Color, entity: string, surface: string): PathNode => ({ ...node(s, color, entity), surface, index: q.indexOf(surface, q.indexOf(entity)) });
    const 배경 = [at('b1', 'B', '가', '를'), at('b2', 'B', '나', '는')];
    const 물음 = [at('b3', 'B', '다', '를'), at('b4', 'B', '라', '를')];
    const qn = at('q', 'Q', '하시오', '하시오');
    const a = {
      question: q,
      graph: { question: q, nodes: [...배경, ...물음, at('c', 'C', '마', '를'), qn], edges: [], combination: [], undecided: [] },
      form: null,
      pivot: { ok: true, pivot: pv(물음[1], 1) },
    } as unknown as V2Analysis;
    assert.deepEqual(갈래들(a), [], '물음 문장 B는 둘');
  });

  it('② 수치(숫자·단위)뿐인 B는 세지 않는다 — 실체 명사 B만 (오종래 2026-10-20)', () => {
    const 수치들 = ['10 m/s', '200 g', '0.1초', '25℃, 1기압', '36L'].map((e, i) => node(`v${i}`, 'B', e));
    const 명사 = [node('b1', 'B', '사고'), node('b2', 'B', '에어백의 부피')];
    assert.deepEqual(갈래들(논제([...명사, ...수치들, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(명사[1], 2) })), []);
    // 수치에 명사·서술이 붙으면 실체 명사로 센다
    const 붙은 = node('b3', 'B', '10 m/s의 속도로 굴러오');
    assert.deepEqual(갈래들(논제([...명사, 붙은, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(명사[1], 2) })), ['서술복잡']);
  });

  it('② C-F 노드가 있으면 서술복잡이 아니다', () => {
    const bs = [node('b1', 'B'), node('b2', 'B'), node('b3', 'B')];
    const cf = { ...node('cf', 'C'), switchId: 'C-F' };
    assert.deepEqual(갈래들(논제([...bs, cf, node('q', 'Q')], { ok: true, pivot: pv(bs[2], 2) })), []);
  });

  it('③ 급소불명확 — MULTIPLE_CONVERGENCE', () => {
    const b1 = node('b1', 'B');
    const b2 = node('b2', 'B');
    const a = 논제([b1, b2, node('c', 'C'), node('q', 'Q')], { ok: false, flag: 'MULTIPLE_CONVERGENCE', candidates: [b1, b2], message: '' });
    assert.deepEqual(갈래들(a), ['급소불명확']);
  });

  it('③ 수렴도 0이어도 Q 앞 B+C 덩어리가 서면 급소불명확이 아니다 (오종래 2026-10-13)', () => {
    const b = node('b', 'B');
    const a = 논제([node('c', 'C'), b, node('q', 'Q')], { ok: true, pivot: pv(b, 0, 'Q 직전 B') });
    assert.deepEqual(갈래들(a), []);
  });

  it('③ 급소불명확 — Q 앞에 B+C 덩어리가 서지 않는다', () => {
    const c = node('c', 'C');
    const d = 봉인13_정교화진단(엔진단위(논제([node('p', 'P'), c, node('q', 'Q')], { ok: true, pivot: pv(c, 0, '서술형태') })), []);
    assert.deepEqual(d.map((x) => x.갈래), ['급소불명확']);
    assert.match(d[0].근거, /B\+C 덩어리가 서지 않음/);
  });

  it('④ 사족 — 4단계 결과(연결선 없는 논제 급소)를 그 소문항 진단으로 싣는다', () => {
    const b = node('b', 'B');
    const d = 봉인13_정교화진단(엔진단위(논제([b, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(b, 1) })), [{ 소문항: '2-1', 급소: '구조적 약점' }]);
    assert.deepEqual(d, [{ 갈래: '사족', 단위: '2-1', 근거: '논제 급소「구조적 약점」 — 제시문 어느 단락 급소와도 연결선 없음' }]);
  });

  it('소문항(단위)마다 진단하고 단위 이름을 단다', () => {
    const b1 = node('b1', 'B');
    const b2 = node('b2', 'B');
    const u1 = 논제([b1, node('q1', 'Q')], { ok: true, pivot: pv(b1, 1) });
    const u2 = 논제([b2, node('c', 'C'), node('q2', 'Q')], { ok: true, pivot: pv(b2, 1) });
    const d = 봉인13_정교화진단([{ 이름: '1-1', 인식: u1 }, { 이름: '1-2', 인식: u2 }], []);
    assert.deepEqual(d.map((x) => [x.단위, x.갈래]), [['1-1', '일방흐름']]);
  });

  it('엔진단위 — 엔진이 나눈 단위는 순번, 안 나눴으면 전체 하나', () => {
    const b = node('b', 'B');
    const a = 논제([b, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(b, 1) });
    assert.deepEqual(엔진단위(a).map((u) => u.이름), [null]);
    assert.deepEqual(엔진단위({ ...a, units: [a, a] }).map((u) => u.이름), ['단위 1', '단위 2']);
  });

  it('신호가 없으면 빈 배열', () => {
    const b = node('b', 'B');
    assert.deepEqual(갈래들(논제([b, node('c', 'C'), node('q', 'Q')], { ok: true, pivot: pv(b, 1) })), []);
  });
});
