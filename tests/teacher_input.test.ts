// 문항 등록창 교사 입력 (오종래 2026-10-16) — 소문항 나누기 · 질문의 핵심(급소가 서지 않을 때만) · 정답 검증(채점 기준 아님)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { apply_core_hint, item_portion, verify_answer } from '../src/rubric/teacher_input.ts';

describe('소문항 나누기 — 줄 머리 「(1)」「(2)」', () => {
  const 글 = '(1)\n첫째 답\n둘째 줄\n\n(2) 둘째 답';
  it('머리가 있으면 그 번호 몫', () => {
    assert.equal(item_portion(글, '1', 0), '첫째 답\n둘째 줄');
    assert.equal(item_portion(글, '2', 1), '둘째 답');
    assert.equal(item_portion(글, '3', 2), '');
  });
  it('머리가 없으면 정답·핵심은 모든 소문항, 모범답안은 첫 소문항만', () => {
    assert.equal(item_portion('sinx ≥ xcosx', '2', 1), 'sinx ≥ xcosx');
    assert.equal(item_portion('한 줄 답안', '1', 0, true), '한 줄 답안');
    assert.equal(item_portion('한 줄 답안', '2', 1, true), '');
  });
  it('배열이면 n째 그대로', () => {
    assert.equal(item_portion(['가', null], '2', 1), '');
    assert.equal(item_portion(['가', '나'], '2', 1), '나');
  });
});

describe('질문의 핵심 — 엔진 급소가 서지 않을 때만, 엔진 노드 중에서', () => {
  it('NO_B → 핵심 글자를 담은 노드가 급소 (띄어쓰기 무시)', () => {
    const a = recognizeV2Analysis('평등하고 자유로운 사회인 것을 설명하시오.');
    assert.equal(a.pivot.ok, false);
    const b = apply_core_hint(a, '자유로운사회');
    assert.ok(b.pivot.ok);
    assert.equal(b.pivot.pivot.reason, '질문의 핵심');
    assert.equal(b.pivot.pivot.node.entity.trim(), '평등하고 자유로운 사회');
  });
  it('엔진 급소가 서 있으면 그대로 · 노드에 없는 말은 급소로 짓지 않는다', () => {
    const a = recognizeV2Analysis("철수의 방법으로 '0 ≤ x < π/2일 때 부등식 sinx ≥ xcosx가 성립한다.'를 증명하시오.");
    assert.equal(apply_core_hint(a, '철수'), a);
    const f = recognizeV2Analysis('평등하고 자유로운 사회인 것을 설명하시오.');
    assert.equal(apply_core_hint(f, '정의').pivot.ok, false);
  });
});

describe('정답 검증 — 모범답안 답구하기 줄과 대조', () => {
  const 뼈 = (파트: any, 더: object = {}) => ({ id: 파트, 파트, 요소: null, 수행질: null, 확인물음: '', is_중심: false, node: null, ...더 }) as any;
  const 조각 = [뼈('세우기', { 근거: { 단락: '철수', 단락급소: '증가, 감소', 문장: '' } }), 뼈('답구하기', { 경로: [{ 출처: '논제', 색: 'k', 실체: '부등식', 핵심어: '부등식' }] })];
  const 답안 = '증가, 감소를 본다.\n풀이\n따라서 부등식 sinx ≥ xcosx가 성립한다.';
  it('정답 낱말이 답 줄에 다 있으면 일치 (띄어쓰기 무시)', () => {
    const r = verify_answer('sinx≥xcosx', 답안, 조각);
    assert.equal(r.결과, '일치');
    assert.equal(r.답줄글, '따라서 부등식 sinx ≥ xcosx가 성립한다.');
  });
  it('없으면 불일치 — 「문항 오류 또는 정답 오류」, 빠진 낱말', () => {
    const r = verify_answer('sinx ≥ xcosx, tanx ≥ x', 답안, 조각);
    assert.equal(r.결과, '불일치');
    assert.deepEqual(r.빠진, ['tanx ≥ x']);
    assert.match(r.사유, /문항 오류 또는 정답 오류/);
  });
  it('모범답안·정답이 없으면 검증 안 함', () => {
    assert.equal(verify_answer('3', '', 조각).결과, '검증 안 함');
    assert.equal(verify_answer('', 답안, 조각).결과, '검증 안 함');
  });
});

describe('정답 검증 — 문장 단위 (C 논술 9단계 한 문단 모범답안, 2026-10-16)', () => {
  const 뼈 = (파트: any, 더: object = {}) => ({ id: 파트, 파트, 요소: null, 수행질: null, 확인물음: '', is_중심: false, node: null, ...더 }) as any;
  const 조각 = [뼈('답구하기', { 경로: [{ 출처: '논제', 색: 'k', 실체: '대응조치', 핵심어: '대응조치' }] })];
  const 문단 = 'B국은 수출이 줄었다. 그래서 R&D 지원을 늘렸다. 따라서 B국의 대응조치는 FTA 다변화이다. 이는 장기 전략이다.';
  it('답 문장 = 급소 핵심어가 마지막으로 나온 문장 — 다른 문장에만 있는 정답 낱말은 일치가 아니다', () => {
    const r = verify_answer('FTA 다변화', 문단, 조각, '문장');
    assert.equal(r.결과, '일치');
    assert.equal(r.답줄글, '따라서 B국의 대응조치는 FTA 다변화이다.');
    assert.equal(verify_answer('R&D 지원', 문단, 조각, '문장').결과, '불일치');
  });
  it('줄 단위면 한 문단 전체가 답 줄', () => {
    assert.equal(verify_answer('R&D 지원', 문단, 조각).결과, '일치');
  });
});

describe('정답 검증 — 괄호 무시 (오종래 2026-10-16)', () => {
  const 뼈 = (파트: any, 더: object = {}) => ({ id: 파트, 파트, 요소: null, 수행질: null, 확인물음: '', is_중심: false, node: null, ...더 }) as any;
  const 조각 = [뼈('답구하기', { 경로: [{ 출처: '논제', 색: 'k', 실체: '대응조치', 핵심어: '대응조치' }] })];
  // 브라우저 시험(10-16) C 9단계 Claude 잇기 답 문장
  const 문단 = '정리하면, B국이 A국의 보호무역 정책으로 인한 손실을 줄이려고 시행한 대응조치는 직접적인 무역보복이 아니라 연구개발(R&D) 지원을 통한 기업 경쟁력 강화와 자유무역협정(FTA) 다변화 정책의 추진이다.';
  it('「연구개발(R&D) 지원」 ⊃ 「R&D 지원」 · 「자유무역협정(FTA) 다변화」 ⊃ 「FTA 다변화」', () => {
    assert.equal(verify_answer('R&D 지원, FTA 다변화', 문단, 조각, '문장').결과, '일치');
  });
  it('괄호 안 내용을 뺀 꼴도 — 「연구개발 지원」 · 정답 쪽 괄호도', () => {
    assert.equal(verify_answer('연구개발 지원, 자유무역협정 다변화', 문단, 조각, '문장').결과, '일치');
    assert.equal(verify_answer('연구개발(R&D) 지원', 문단, 조각, '문장').결과, '일치');
  });
  it('없는 말은 그대로 불일치', () => {
    assert.deepEqual(verify_answer('R&D 지원, 관세 인상', 문단, 조각, '문장').빠진, ['관세 인상']);
  });
});
