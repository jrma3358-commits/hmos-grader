import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fQ, type FQOptions, type FQResult } from '../src/fq/index.ts';
import { formFromColors } from '../src/fq/pipeline.ts';

function run(question: string, options?: FQOptions): FQResult {
  const r = fQ(question, options);
  assert.ok(r.ok, `f(Q) 실패: ${JSON.stringify(r)}`);
  return r as FQResult;
}

// ENGINE_LOGIC.md 마지막 테스트 입력. G는 θ—B—C₁—C₂ (스위치 "~할 때"를 C₁로 살린다, §2 결정성)
describe('ENGINE_LOGIC 테스트 케이스: a,a,b,c,d,e 카드', () => {
  const r = run(`a,a,b,c,d,e 카드를 나열할 때
   양 끝에 모음이 오는 경우의 수를 구하고
   풀이 과정을 서술하시오`);

  it('colors — "카드를"(B)과 "나열할 때"(C₁)는 서로 다른 스위치', () => {
    assert.equal(r.B, 'a,a,b,c,d,e (모음 a,a,e, a가 중복)');
    assert.equal(r.C, '나열할 때, 양 끝에 모음');
    assert.equal(r.Q, '경우의 수+서술');
    assert.equal(r.P, undefined);
    assert.equal(r.D, undefined);
  });

  it('출력 순서 B·C·P·D·Q', () => {
    const keys = Object.keys(r).filter((k) => ['B', 'C', 'P', 'D', 'Q'].includes(k));
    assert.deepEqual(keys, ['B', 'C', 'Q']);
  });

  it('form: 5형식 (B+C+Q, 준킬러형)', () => {
    assert.equal(r.form.id, 5);
    assert.equal(r.form.label, '5형식 (B+C+Q, 준킬러형)');
    assert.equal(r.form.logicSwitch, 'OFF');
  });

  it('K = 최심 요소 C₂', () => {
    assert.equal(r.K.id, 'C₂');
    assert.equal(r.K.content, '양 끝에 모음');
  });

  it('path: 논문4 표기, 연산요소 양 날개 대칭', () => {
    assert.equal(r.path.notation, 'θ°→B→C₁→[C₂]→C₁→B→θ*');
    assert.deepEqual(r.path.inbound, ['B', 'C₁']);
    assert.deepEqual(r.path.outbound, ['C₁', 'B']);
    assert.deepEqual(r.path.shortened, []);
    assert.equal(r.methods.length, 1);
    assert.equal(r.methods[0].estimated, true);
  });

  it('예상 θ*: (a,a)+(a,e)+(e,a) = 72', () => {
    assert.equal(r.theta.value, 72);
    assert.deepEqual(r.theta.formats, ['수치', '서술']);
  });
});

describe('같은 문제의 CLAUDE.md §7.1 표기', () => {
  it('같은 대상·같은 최심 제약·같은 경로', () => {
    const r = run('a, a, b, c, d, e가 적힌 6장의 카드를 일렬로 나열할 때, 양 끝에 모음이 오는 경우의 수를 구하고, 풀이 과정을 서술하시오.');
    assert.equal(r.B, 'a,a,b,c,d,e (모음 a,a,e, a가 중복)');
    assert.equal(r.form.id, 5);
    assert.equal(r.K.content, '양 끝에 모음');
    assert.equal(r.path.notation, 'θ°→B→C₁→[C₂]→C₁→B→θ*');
    assert.equal(r.theta.value, 72);
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
});

describe('B 스위치 ~가(이)·~의·~를 (CORE_SPEC §3.1)', () => {
  it('~가: "f(x)가 최댓값을 가질 때" → B + C', () => {
    const r = run('f(x)가 최댓값을 가질 때, x의 값을 구하시오.');
    assert.equal(r.B, 'f(x)');
    assert.equal(r.C, '최댓값을 가질 때');
    assert.equal(r.form.id, 5);
  });

  it('~가: Q 수식어 안에서도 같다', () => {
    const r = run('f(x)가 최댓값을 갖는 x의 값을 구하시오.');
    assert.equal(r.B, 'f(x)');
    assert.equal(r.C, '최댓값을 갖는');
    assert.equal(r.Q, 'x의 값');
  });

  it('~를: "a, b, c를 나열하는" → B + C', () => {
    const r = run('a, b, c를 나열하는 경우의 수를 구하시오.');
    assert.equal(r.B, 'a,b,c');
    assert.equal(r.C, '나열하는');
    assert.equal(r.form.id, 5);
    assert.equal(r.theta.value, 6);
  });

  it('~의: 수식 뒤의 ~의 값 → B', () => {
    const r = run('cos(π/2+θ)=−1/5일 때, sinθ/(1−cos²θ)의 값은?');
    assert.equal(r.B, 'sinθ/(1−cos²θ)');
  });

  it('단일 문자 미지수·한글 명사 뒤의 조사는 B를 부르지 않는다', () => {
    assert.equal(run('x가 양수일 때, x의 값을 구하시오.').B, undefined);
    assert.equal(run('양 끝에 모음이 오는 경우의 수를 구하시오.').B, undefined);
  });

  it('같은 함수 기호의 B는 하나, D가 정의한 기호는 D에 흡수', () => {
    const r = run('함수 f(x)에 대하여 g(x) = f(x+4)라 하자. g(x)가 x=a에서 연속일 때, a의 값을 구하시오.');
    assert.equal(r.B, '함수 f(x)');
    assert.equal(r.D, 'g(x) = f(x+4)라 하자');
  });
});

describe('Q 수식어에서 C 내용 추출', () => {
  const cases: [string, string][] = [
    ['양 끝에 모음이 오는 경우의 수를 구하시오.', '양 끝에 모음'], // 주어 뒤 동사는 뗀다
    ['합이 10인 경우의 수를 구하시오.', '합이 10'],
    ['1부터 100까지의 자연수 중 3으로 나누어떨어지는 수의 개수를 구하시오.', '1부터 100까지의 자연수 중 3으로 나누어떨어지는'],
    ['이웃하는 두 수의 합을 구하시오.', '이웃하는'], // 한 단어 수식어가 빈 문자열이 되지 않는다
  ];
  for (const [q, c] of cases) {
    it(q, () => {
      const r = run(q);
      assert.equal(r.C, c);
      assert.equal(r.form.id, 4);
    });
  }

  it('수식어 속 목적어는 B, 나머지가 C', () => {
    const r = run('원점을 지나는 직선의 기울기를 구하시오.');
    assert.equal(r.B, '원점');
    assert.equal(r.C, '지나는');
  });
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
  it('"이때" — 제약(C) 맥락이면 C', () => {
    const r = run('x가 양수일 때, 이때 f(x)는 증가한다. f(1)의 값을 구하시오.');
    assert.equal(r.P, undefined);
    assert.equal(r.C, 'x가 양수일 때, f(x)는 증가한다');
  });

  it('"이때" — 제약 없이 무대만 서면 P (3형식)', () => {
    const r = run('이때 점 A는 원 위에 있다. 선분 OA의 길이를 구하시오.');
    assert.equal(r.form.id, 3);
    assert.equal(r.P, '점 A는 원 위에 있다');
  });

  it('~이다 서술문은 맥락이 없으면 P (CORE_SPEC §3.1)', () => {
    const r = run('점 A는 원 위에 있다. 선분 OA의 길이를 구하시오.');
    assert.equal(r.P, '점 A는 원 위에 있다');
    assert.equal(r.form.id, 3);
  });
});

// 논문4 §5 예시 — 문장에서 기본 G를 추정한 결과
describe('논문4 §5 — 기본 G(추정)', () => {
  it('§5.2 6번: θ B C B θ, 급소 C', () => {
    const r = run('cos(π/2+θ)=−1/5일 때, sinθ/(1−cos²θ)의 값은?');
    assert.equal(r.path.notation, 'θ°→B→[C]→B→θ*');
    assert.equal(r.K.color, 'C');
  });

  it('§5.4 19번: θ B D C B θ, 급소 C, D 단축', () => {
    const r = run('양수 a에 대하여 f(x)=2x³−3ax²−12a²x의 극댓값이 7/27일 때, f(3)의 값을 구하시오.');
    assert.equal(r.D, '양수 a');
    assert.equal(r.B, 'f(x)=2x³−3ax²−12a²x');
    assert.equal(r.form.id, 7);
    assert.equal(r.path.notation, 'θ°→B→D→[C]→B→θ*');
    assert.deepEqual(r.path.shortened, ['D']);
    assert.equal(r.K.content, '극댓값이 7/27일 때');
  });

  it('§3.4: 정의를 먼저 거쳐도 최심이 C면 급소는 C', () => {
    const r = run('함수 f(x)에 대하여 g(x) = f(x+4)라 하자. g(x)가 x=a에서 연속일 때, a의 값을 구하시오.');
    assert.equal(r.form.logicSwitch, 'ON');
    assert.equal(r.path.notation, 'θ°→B→D→[C]→B→θ*');
    assert.equal(r.K.color, 'C');
  });

  it('확정요소 P도 인바운드에만', () => {
    const r = run('그림과 같이 좌표평면 위에 점 A가 있다. 단, 점 A는 제1사분면 위에 있다. 선분 OA의 길이의 최솟값을 구하시오.');
    assert.equal(r.path.notation, 'θ°→P→[C]→θ*');
    assert.deepEqual(r.path.shortened, ['P']);
  });

  it('§5.1 4번 분해: 조각별 대상은 B₁·B₂ (논문1 §4) — 의존 순서는 추정', () => {
    const r = run('f(x)=5x+a (x<−2), x²−a (x≥−2)가 실수 전체에서 연속일 때, 상수 a의 값은?');
    assert.deepEqual(
      r.methods[0].G.nodes.map((n) => [n.id, n.content]),
      [
        ['B₁', 'f(x)=5x+a (x<−2)'],
        ['B₂', 'x²−a (x≥−2)'],
        ['C', '실수 전체에서 연속일 때'],
      ],
    );
    assert.equal(r.methods[0].estimated, true);
  });

  it('1형식: G가 비면 θ°→[Q]→θ*', () => {
    assert.equal(run('x의 값은?').path.notation, 'θ°→[Q]→θ*');
  });
});

// 논문4 정리2·명제4 — 풀이법 G를 직접 줄 때
describe('논문4 — 풀이법 G', () => {
  it('§5.1 4번: θ B₂ C B₁ C B₂ θ (문장 순서와 다른 의존 순서)', () => {
    const r = run('f(x)=5x+a (x<−2), x²−a (x≥−2)가 실수 전체에서 연속일 때, 상수 a의 값은?', {
      methods: [
        {
          name: '경계 연속',
          G: {
            nodes: [
              { id: 'B₂', color: 'B', content: 'x²−a (x≥−2)' },
              { id: 'C', color: 'C', content: '실수 전체에서 연속' },
              { id: 'B₁', color: 'B', content: '5x+a (x<−2)' },
            ],
          },
        },
      ],
    });
    assert.equal(r.path.notation, 'θ°→B₂→C→[B₁]→C→B₂→θ*');
    assert.equal(r.K.id, 'B₁');
    assert.equal(r.methods[0].estimated, false);
  });

  it('정리2 "생략될 수 있다": 확정요소를 재경유하는 G도 표현한다', () => {
    const r = run('양수 a에 대하여 f(x)=2x³−3ax²−12a²x의 극댓값이 7/27일 때, f(3)의 값을 구하시오.', {
      methods: [
        {
          name: 'a 재대입',
          G: {
            nodes: [
              { id: 'B', color: 'B', content: 'f(x)' },
              { id: 'D', color: 'D', content: '양수 a', skipOutbound: false },
              { id: 'C', color: 'C', content: '극댓값 = 7/27' },
            ],
          },
        },
      ],
    });
    assert.equal(r.path.notation, 'θ°→B→D→[C]→D→B→θ*');
    assert.deepEqual(r.path.shortened, []);
  });

  it('§5.4 14번 꼴: 연산요소 C₁도 급소 확정 후 역할이 끝나면 생략', () => {
    const r = run('x의 값은?', {
      methods: [
        {
          name: '14번 꼴',
          G: {
            nodes: [
              { id: 'B', color: 'B', content: '대상' },
              { id: 'P', color: 'P', content: '상황' },
              { id: 'D', color: 'D', content: '정의' },
              { id: 'C₁', color: 'C', content: '제약1', skipOutbound: true },
              { id: 'C₂', color: 'C', content: '제약2' },
            ],
          },
        },
      ],
    });
    assert.equal(r.path.notation, 'θ°→B→P→D→C₁→[C₂]→B→θ*');
    assert.deepEqual(r.path.shortened, ['P', 'D', 'C₁']);
  });

  it('명제4: 급소는 방법 상대적, θ*는 공통', () => {
    const q = 'a,a,b,c,d,e 카드를 나열할 때 양 끝에 모음이 오는 경우의 수를 구하시오';
    const r = run(q, {
      methods: [
        { name: 'M1', G: { nodes: [{ id: 'B', color: 'B', content: 'a,a,b,c,d,e' }, { id: 'C', color: 'C', content: '양 끝에 모음' }] } },
        { name: 'M2', G: { nodes: [{ id: 'C', color: 'C', content: '양 끝에 모음' }, { id: 'B', color: 'B', content: '모음 a,a,e' }] } },
      ],
    });
    assert.deepEqual(
      r.methods.map((m) => [m.name, m.K.id, m.path.notation]),
      [
        ['M1', 'C', 'θ°→B→[C]→B→θ*'],
        ['M2', 'B', 'θ°→C→[B]→C→θ*'],
      ],
    );
    assert.equal(r.K, r.methods[0].K);
    assert.equal(r.theta.value, 72);
  });

  it('명제3 §5.3 8번: 독립 가지는 묶고 병합점이 급소, 연산요소는 양 날개에', () => {
    const r = run('x의 값은?', {
      methods: [
        {
          name: '8번',
          G: {
            nodes: [],
            branches: [[{ id: 'B₁', color: 'B', content: 'a' }], [{ id: 'B₂', color: 'B', content: 'b' }]],
            merge: { id: '×', color: 'B', content: 'a×b' },
          },
        },
      ],
    });
    assert.equal(r.path.kind, 'branch');
    assert.equal(r.path.notation, 'θ°→(B₁ | B₂)→[×]→(B₁ | B₂)→θ*');
    assert.equal(r.K.id, '×');
  });

  it('명제3: 가지 안 사슬·공통 앞부분·확정요소 단축', () => {
    const r = run('x의 값은?', {
      methods: [
        {
          name: '분기',
          G: {
            nodes: [{ id: 'P', color: 'P', content: '무대' }],
            branches: [
              [
                { id: 'B₁', color: 'B', content: 'a' },
                { id: 'C₁', color: 'C', content: 'a의 조건' },
              ],
              [
                { id: 'D', color: 'D', content: 'b의 정의' },
                { id: 'C₂', color: 'C', content: 'b의 조건' },
              ],
            ],
            merge: { id: '×', color: 'B', content: 'a×b' },
          },
        },
      ],
    });
    assert.equal(r.path.notation, 'θ°→P→(B₁→C₁ | D→C₂)→[×]→(C₁→B₁ | C₂)→θ*');
    assert.deepEqual(r.path.shortened, ['P', 'D']);
  });

  it('가지가 하나뿐이거나 병합점이 없으면 INVALID_GRAPH', () => {
    const one = fQ('x의 값은?', {
      methods: [{ name: 'M', G: { nodes: [], branches: [[{ id: 'B', color: 'B', content: 'a' }]], merge: { id: 'K', color: 'B', content: 'k' } } }],
    });
    const noMerge = fQ('x의 값은?', {
      methods: [{ name: 'M', G: { nodes: [], branches: [[{ id: 'B₁', color: 'B', content: 'a' }], [{ id: 'B₂', color: 'B', content: 'b' }]] } }],
    });
    assert.equal(one.ok, false);
    assert.equal(noMerge.ok, false);
  });

  describe('branches 검사 경계', () => {
    const B = { id: 'B', color: 'B', content: 'b' } as const;
    const C = { id: 'C', color: 'C', content: 'c' } as const;
    const q = 'f(x)가 최댓값을 가질 때, x의 값을 구하시오.';

    it('(1) branches: [] 빈 배열은 사슬 → valid', () => {
      const r = run(q, { methods: [{ name: 'M', G: { nodes: [B, C], branches: [] } }] });
      assert.equal(r.path.kind, 'chain');
      assert.equal(r.path.notation, 'θ°→B→[C]→B→θ*');
    });

    it('(2) 가지가 하나라도 있으면 명제3 검사 유지 — 가지 1개·merge 없음 → INVALID', () => {
      const r = fQ(q, { methods: [{ name: 'M', G: { nodes: [B], branches: [[C]] } }] });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.type, 'INVALID_GRAPH');
    });

    it('(3) 가지 둘 + merge → valid', () => {
      const r = run(q, {
        methods: [
          {
            name: 'M',
            G: {
              nodes: [B],
              branches: [[C], [{ id: 'C₂', color: 'C', content: 'c₂' }]],
              merge: { id: '×', color: 'B', content: '병합' },
            },
          },
        ],
      });
      assert.equal(r.path.kind, 'branch');
      assert.equal(r.path.notation, 'θ°→B→(C | C₂)→[×]→(C | C₂)→B→θ*');
    });
  });

  it('잘못된 G는 INVALID_GRAPH', () => {
    const r = fQ('x의 값은?', {
      methods: [{ name: 'M', G: { nodes: [{ id: 'Q', color: 'Q' as never, content: '값' }] } }],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.type, 'INVALID_GRAPH');
  });
});

describe('질문 무결 게이트', () => {
  it('Q가 없으면 INVALID_QUESTION', () => {
    const r = fQ('a,a,b,c,d,e 카드를 나열할 때 양 끝에 모음이 온다.');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.type, 'INVALID_QUESTION');
  });
});
