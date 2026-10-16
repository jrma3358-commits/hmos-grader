// q4 엔진 규칙 6가지 (오종래 2026-10-16)
//   ① 소문항 글에 물음이 없으면 공통 발문 급소를 물려받는다 (급소와 그 물음만)
//   ② 부등식 답 대조 — k<2 · k>2 · k=2
//   ③ 줄 중간 「∴」 뒤도 결론
//   ④ 등호 없는 부등식 계산 줄(-4k+8>0)도 풀기
//   ⑤ 한 줄에 이어 쓴 「(n)」도 소문항 머리
//   ⑥ 공통 발문 「[총 N점]」은 소문항마다 N (처음 확정한 나누기는 같은 날 취소)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { common_question, derive_pieces, f2_input_inherit, has_question } from '../src/rubric/f2.ts';
import { grade } from '../src/rubric/g1.ts';
import { 판별식썼나, 판별식조건 } from '../src/rubric/sealed/g1.ts';
import { answer_values, classify_math_lines, solve_segments, split_conclusion, student_answer_line } from '../src/rubric/solve_lines.ts';
import { item_portion, sub_item_points } from '../src/rubric/teacher_input.ts';
import { split_thesis } from '../src/thesis/split.ts';
import type { 조각 } from '../src/rubric/types.ts';

const 논제 = '이차함수 y=x²+x+k와 직선 y=-x+1이\n다음 조건을 만족시키도록 하는 k의 값 또는 k의 범위를 구하시오. [총 2점]\n(1) 서로 다른 두 점에서 만난다.\n(2) 접한다. (한 점에서 만난다.)\n(3) 만나지 않는다.';

describe('① 공통 발문 급소 물려받기', () => {
  const 소문항들 = split_thesis(논제);
  it('(1)(2)(3) 모두 물음이 없어 공통 발문 급소 「k의 범위」를 물려받는다', () => {
    for (const s of 소문항들) {
      const a = recognizeV2Analysis(s.텍스트);
      assert.equal(has_question(a), false);
      const 입력 = f2_input_inherit(a, recognizeV2Analysis(common_question(s.공통발문)));
      assert.ok(입력.ok);
      assert.equal(입력.k.실체.trim(), 'k의 범위');
      assert.match(입력.k.node.id, /^공통-/);
    }
  });
  it('공통 발문의 다른 노드(「직선 y=-x+1」)는 조각이 되지 않는다 — ④는 물려받은 급소 하나', () => {
    const s = 소문항들[0];
    const 입력 = f2_input_inherit(recognizeV2Analysis(s.텍스트), recognizeV2Analysis(common_question(s.공통발문)));
    assert.ok(입력.ok);
    const cs = derive_pieces(입력.물음, 입력.k, 입력.인식, '수리');
    assert.ok(!cs.some((c) => /직선|다음 조건/.test(c.node?.entity ?? '')));
    assert.deepEqual(cs.filter((c) => c.파트 === '답구하기').map((c) => c.node!.entity.trim()), ['k의 범위']);
  });
  it('물음이 있는 소문항은 물려받지 않는다', () => {
    assert.equal(has_question(recognizeV2Analysis('x의 값을 구하시오.')), true);
  });
});

describe('② 부등식 답 · ③ 줄 중간 ∴', () => {
  it('부등식은 기호째 값 — k<2 · k>2 · k=2는 서로 다르다', () => {
    assert.deepEqual(answer_values('∴ k<2'), ['k<2']);
    assert.deepEqual(answer_values('∴ k > 2'), ['k>2']);
    assert.deepEqual(answer_values('∴ k≧1'), ['k≥1']);
    assert.notDeepEqual(answer_values('∴ k<2'), answer_values('∴ k>2'));
  });
  it('줄 중간 「∴」 뒤가 결론, 앞은 여느 줄', () => {
    assert.deepEqual(split_conclusion('D=-4k+8=0 ∴ k=2'), { 앞: 'D=-4k+8=0', 결론: '∴ k=2' });
    assert.equal(student_answer_line('x²+2x+k-1=0\nD=-4k+8<0 ∴ k>2'), '∴ k>2');
    const r = classify_math_lines('x²+2x+k-1=0\nD=-4k+8=0 ∴ k=2');
    assert.deepEqual(r.세우기, ['x²+2x+k-1=0', 'D=-4k+8=0']);
    assert.deepEqual(r.답?.값, ['k=2']);
  });
});

describe('④ 부등식 계산 줄 풀기', () => {
  it('등호 없는 부등식 「-4k+8>0」은 풀기, 등호 있는 「D=…>0」은 세우기', () => {
    const r = classify_math_lines('x²+2x+k-1=0\nD=2²-4×1×(k-1)>0\n-4k+8>0\n∴ k<2');
    assert.deepEqual(r.풀기, ['-4k+8>0']);
    assert.deepEqual(r.세우기, ['x²+2x+k-1=0', 'D=2²-4×1×(k-1)>0']);
    assert.deepEqual(solve_segments('D=-4k+8<0 ∴ k>2\n-4k+8>0'), ['-4k+8>0']);
  });
});

describe('⑤ 한 줄 소문항 머리', () => {
  it('「(1) k<2, (2) k=2, (3) k>2」를 소문항마다 나눈다', () => {
    const 정답 = '(1) k<2, (2) k=2, (3) k>2';
    assert.equal(item_portion(정답, '1', 0), 'k<2');
    assert.equal(item_portion(정답, '2', 1), 'k=2');
    assert.equal(item_portion(정답, '3', 2), 'k>2');
  });
  it('줄 머리 「(n)」은 그대로', () => {
    assert.equal(item_portion('(1) 가\n(2) 나', '2', 1), '나');
  });
});

describe('⑥ 공통 발문 「[총 N점]」 — 소문항마다 N (나누기 취소, 오종래 2026-10-16)', () => {
  it('q4 [총 2점] → (1)(2)(3) 각 2점, 총 6점', () => {
    const ps = sub_item_points(split_thesis(논제), 10);
    assert.deepEqual(ps, [2, 2, 2]);
  });
  it('자기 「[N점]」이 있으면 그 값, 둘 다 없으면 요청 총배점', () => {
    assert.deepEqual(sub_item_points([{ 텍스트: '(가) [3점]', 공통발문: '[총 9점]' }, { 텍스트: '(나)', 공통발문: '[총 9점]' }], 10), [3, 9]);
    assert.deepEqual(sub_item_points([{ 텍스트: 'x를 구하시오.', 공통발문: '' }], 5), [5]);
  });
});

describe('q4 (1) 모범답안 자기 채점 — ④ 부등식 값 O', () => {
  it('k<2 일치 → O, k>2면 X', () => {
    const k = { 실체: 'k의 범위', node: { id: '공통-n6', entity: 'k의 범위', color: 'B', surface: '', switchId: '', index: 0 } } as any;
    const 루브릭: 조각[] = [
      { id: '답구하기-1', 파트: '답구하기', 요소: 'k', 수행질: null, 확인물음: '', 충족조건: '', is_중심: true, node: null, 모범조각: '', 배점: 0.2, 모범답: { 줄: '∴ k<2', 값: ['k<2'] } },
    ];
    assert.equal(grade('-4k+8>0\n∴ k<2', 루브릭, '', k, '수리').파트별.답구하기.조각별[0].결과, 'O');
    assert.equal(grade('-4k+8<0\n∴ k>2', 루브릭, '', k, '수리').파트별.답구하기.조각별[0].결과, 'X');
  });
});

// q4 학생 1 (2026-10-16) — 공통 풀이 뒤 (1)(2)(3). 소문항 몫마다 결론 값이 모범 값과 같다
describe('q4 학생 1 — 소문항 몫과 결론 값', () => {
  const 학생1 = 'x²+x+k=-x+1에서 x²+2x+k-1=0\n의 판별식을 D라 하면\nD=2²-4×1×(k-1)=-4k+8\n\n(1) 서로 다른 두 점에서 만나므로 D>0에서\nD=-4k+8>0, 4k<8 ∴ k<2\n\n(2) 접하므로 D=0에서\nD=-4k+8=0 ∴ k=2\n\n(3) 만나지 않으므로 D<0에서\nD=-4k+8<0, 4k>8 ∴ k>2';
  it('(1)(2)(3) 몫의 결론 — k<2 · k=2 · k>2', () => {
    const 값 = ['1', '2', '3'].map((b, n) => answer_values(student_answer_line(item_portion(학생1, b, n))));
    assert.deepEqual(값, [['k<2'], ['k=2'], ['k>2']]);
  });
});

// 2026-10-16 — ① 만남 조건 조각은 판별식 조건으로 엔진이 판정 · 「~에서」 조건 문장은 풀기 아님
describe('① 만남 조건 ↔ 판별식', () => {
  it('조건 문장 → D 기호', () => {
    assert.equal(판별식조건('서로 다른 두 점'), '>');
    assert.equal(판별식조건('한 점에서 만난다.'), '=');
    assert.equal(판별식조건('접한다'), '=');
    assert.equal(판별식조건('만나지 않는다.'), '<');
    assert.equal(판별식조건('직선 y=-x+1'), null);
  });
  it('「D>0」 「D=-4k+8>0」 모두 D>0으로 본다 · 줄을 넘어 잇지 않는다', () => {
    assert.equal(판별식썼나('D>0에서', '>'), true);
    assert.equal(판별식썼나('D=-4k+8>0, 4k<8', '>'), true);
    assert.equal(판별식썼나('D=-4k+8=0 ∴ k=2', '='), true);
    assert.equal(판별식썼나('D=2²-4×1×(k-1)=-4k+8', '='), false);
    assert.equal(판별식썼나('D=-4k+8\n만나지 않으므로 x<0', '<'), false);
  });
  it('조각 판정 — 조건과 판별식이 맞으면 O, 없으면 X', () => {
    const k = { 실체: 'k의 범위', node: { id: '공통-n6', entity: 'k의 범위', color: 'B', surface: '', switchId: '', index: 0 } } as any;
    const 조건조각 = (entity: string): 조각 => ({ id: '근거대기-1', 파트: '근거대기', 요소: 'b', 수행질: null, 확인물음: '', 충족조건: '', is_중심: false, node: { id: 'n1', entity, color: 'B', surface: '', switchId: '', index: 0 } as any, 모범조각: '', 배점: 0.4 });
    assert.equal(grade('서로 다른 두 점에서 만나므로 D>0에서\n∴ k<2', [조건조각('서로 다른 두 점')], '', k, '수리').파트별.근거대기.조각별[0].결과, 'O');
    assert.equal(grade('∴ k<2', [조건조각('서로 다른 두 점')], '', k, '수리').파트별.근거대기.조각별[0].결과, 'X');
    assert.equal(grade('접하므로 D>0에서', [조건조각('한 점에서 만난다.')], '', k, '수리').파트별.근거대기.조각별[0].결과, 'X');
  });
  it('「~에서」로 끝나는 조건 문장은 풀기가 아니다', () => {
    assert.deepEqual(solve_segments('서로 다른 두 점에서 만나므로 D>0에서\nD=-4k+8>0, 4k<8 ∴ k<2'), ['4k<8']);
  });
});
