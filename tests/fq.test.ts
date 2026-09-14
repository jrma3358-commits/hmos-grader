import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fQ, type FQResult } from '../src/fq/index.ts';
import { formFromColors } from '../src/fq/pipeline.ts';

function run(question: string): FQResult {
  const r = fQ(question);
  assert.ok(r.ok, `f(Q) 실패: ${JSON.stringify(r)}`);
  return r;
}

// ENGINE_LOGIC.md 마지막 — 테스트 입력 / 기대 출력
describe('ENGINE_LOGIC 테스트 케이스: a,a,b,c,d,e 카드', () => {
  const r = run(`a,a,b,c,d,e 카드를 나열할 때
   양 끝에 모음이 오는 경우의 수를 구하고
   풀이 과정을 서술하시오`);

  it('colors', () => {
    assert.equal(r.B, 'a,a,b,c,d,e (모음 a,a,e, a가 중복)');
    assert.equal(r.C, '양 끝에 모음');
    assert.equal(r.Q, '경우의 수+서술');
    assert.equal(r.P, undefined);
    assert.equal(r.D, undefined);
  });

  it('form: 5형식 (B+C+Q, 준킬러형) — 4형식이 아님', () => {
    assert.equal(r.form.id, 5);
    assert.equal(r.form.label, '5형식 (B+C+Q, 준킬러형)');
    assert.equal(r.form.logicSwitch, 'OFF');
  });

  it('K', () => {
    assert.equal(r.K.text, 'a가 2개 — (a,a) 경우가 존재');
  });

  it('path: B는 연산요소라 양 날개 대칭', () => {
    assert.equal(r.path.notation, 'θ°→B→C→K→C→B→θ*');
    assert.deepEqual(r.path.shortened, []);
  });

  it('예상 θ*: (a,a)+(a,e)+(e,a) = 72 (CLAUDE.md §7.2)', () => {
    assert.equal(r.theta.value, 72);
    assert.deepEqual(r.theta.formats, ['수치', '서술']);
  });
});

describe('같은 문제의 CLAUDE.md §7.1 표기', () => {
  it('조사·어미 구조가 같으면 같은 결과', () => {
    const r = run('a, a, b, c, d, e가 적힌 6장의 카드를 일렬로 나열할 때, 양 끝에 모음이 오는 경우의 수를 구하고, 풀이 과정을 서술하시오.');
    assert.equal(r.B, 'a,a,b,c,d,e (모음 a,a,e, a가 중복)');
    assert.equal(r.C, '양 끝에 모음');
    assert.equal(r.Q, '경우의 수+서술');
    assert.equal(r.form.id, 5);
    assert.equal(r.K.text, 'a가 2개 — (a,a) 경우가 존재');
    assert.equal(r.path.notation, 'θ°→B→C→K→C→B→θ*');
  });
});

describe('7형식 정본 (논문2 §4)', () => {
  it('색 조합 → 형식', () => {
    assert.equal(formFromColors(['Q']), 1);
    assert.equal(formFromColors(['B', 'Q']), 2);
    assert.equal(formFromColors(['P', 'Q']), 3);
    assert.equal(formFromColors(['C', 'Q']), 4);
    assert.equal(formFromColors(['B', 'C', 'Q']), 5);
    assert.equal(formFromColors(['P', 'C', 'Q']), 6);
    assert.equal(formFromColors(['D', 'C', 'Q']), 7);
  });

  it('조작 동사가 아닌 "~을 ~할 때"는 C로 남는다', () => {
    const r = run('f(x)가 최댓값을 가질 때, x의 값을 구하시오.');
    assert.equal(r.C, 'f(x)가 최댓값을 가질 때');
    assert.equal(r.B, undefined);
    assert.equal(r.form.id, 4);
  });
});

describe('Q 수식어 속 목적어', () => {
  it('"~를 나열하는 경우의 수" — 조작 동사의 목적어는 B', () => {
    const r = run('a, b, c를 나열하는 경우의 수를 구하시오.');
    assert.equal(r.B, 'a,b,c');
    assert.equal(r.C, undefined);
    assert.equal(r.Q, '경우의 수');
    assert.equal(r.form.id, 2);
    assert.equal(r.path.notation, 'θ°→B→K→B→θ*');
    assert.equal(r.theta.value, 6);
  });

  it('조작 동사가 아닌 수식어 속 목적어는 C로 남는다', () => {
    const r = run('f(x)가 최댓값을 갖는 x의 값을 구하시오.');
    assert.equal(r.B, undefined);
    assert.equal(r.C, 'f(x)가 최댓값을 갖는');
    assert.equal(r.form.id, 4);
  });
});

describe('Q 수식어에서 C 내용 추출', () => {
  const cases: [string, string][] = [
    ['양 끝에 모음이 오는 경우의 수를 구하시오.', '양 끝에 모음'], // 주어 뒤 동사는 뗀다
    ['합이 10인 경우의 수를 구하시오.', '합이 10'],
    ['1부터 100까지의 자연수 중 3으로 나누어떨어지는 수의 개수를 구하시오.', '1부터 100까지의 자연수 중 3으로 나누어떨어지는'],
    ['원점을 지나는 직선의 기울기를 구하시오.', '원점을 지나는'],
    ['이웃하는 두 수의 합을 구하시오.', '이웃하는'], // 한 단어 수식어가 빈 문자열이 되지 않는다
  ];
  for (const [q, c] of cases) {
    it(q, () => {
      const r = run(q);
      assert.equal(r.C, c);
      assert.equal(r.form.id, 4);
    });
  }
});

describe('원소 목록', () => {
  it('두 자리 이상 정수도 원소로 읽는다', () => {
    const r = run('10, 20, 30을 나열할 때, 경우의 수를 구하시오.');
    assert.deepEqual(r.detail.items, ['10', '20', '30']);
    assert.equal(r.B, '10,20,30');
    assert.equal(r.theta.value, 6);
  });

  it('두 자리 수 + 범주 + 자리', () => {
    const r = run('11, 12, 13, 14가 적힌 카드를 일렬로 나열할 때, 양 끝에 짝수가 오는 경우의 수를 구하시오.');
    assert.equal(r.B, '11,12,13,14 (짝수 12,14)');
    assert.equal(r.form.id, 5);
    assert.equal(r.theta.value, 4); // (12,14) 2 + (14,12) 2
  });
});

describe('애매한 색은 7형식으로 확정', () => {
  it('"이때" — 4형식(C+Q) 맥락이면 C', () => {
    const r = run('x가 양수일 때, 이때 f(x)는 증가한다. f(1)의 값을 구하시오.');
    assert.equal(r.form.id, 4);
    assert.equal(r.P, undefined);
  });

  it('"이때" — 제약 없이 무대만 서면 P (3형식)', () => {
    const r = run('이때 점 A는 원 위에 있다. 선분 OA의 길이를 구하시오.');
    assert.equal(r.form.id, 3);
    assert.equal(r.P, '점 A는 원 위에 있다');
  });
});

describe('확정요소(D·P)는 아웃바운드에서 단축', () => {
  it('D가 있으면 θ°→B→D→C→K→C→B→θ*', () => {
    const r = run('함수 f(x)에 대하여 g(x) = f(x+4)라 하자. g(x)가 x=a에서 연속일 때, a의 값을 구하시오.');
    assert.equal(r.form.id, 7);
    assert.equal(r.form.logicSwitch, 'ON');
    assert.equal(r.path.notation, 'θ°→B→D→C→K→C→B→θ*');
    assert.deepEqual(r.path.shortened, ['D']);
    assert.equal(r.K.color, 'D');
  });
});

describe('질문 무결 게이트', () => {
  it('Q가 없으면 INVALID_QUESTION', () => {
    const r = fQ('a,a,b,c,d,e 카드를 나열할 때 양 끝에 모음이 온다.');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.type, 'INVALID_QUESTION');
  });
});
