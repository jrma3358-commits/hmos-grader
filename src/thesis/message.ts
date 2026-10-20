// 제시문 핵심 메시지 [오종래 2026-10-20 확정] — 에피소드·상황형 제시문(정의문 「A는 B이다」가 없는 것)은
//   마지막 결론 문장(또는 주제문)에서 핵심 메시지를 뽑는다. 단락 첫 문장 B 우선은 정의문이 있을 때만이다.
//
// 메시지 잡는 차례 (오종래 2026-10-20 확정 안):
//   0. 「하지만 … 때문이다」 — 반론 전환 뒤 원인 단정이면 원인절 (아래 반론원인)
//   1. 메시지 문장 = 결론 연결어(따라서·그래서·결국·그러므로·이처럼·요컨대·즉·이제)로 여는 마지막 문장, 없으면 마지막 문장
//   2. 실체 = 그 문장의 주어(은·는·이·가로 선 엔진 B, 결론 연결어를 뗀 것)
//   3. 주어가 지시어(「거기」 등)면 — 제시문 안 정의꼴 문장(「…은/는 … 이다.」·「…은/는 …의 X다.」)의 주어, 그 문장이 메시지 문장
//
// 「모두 활용하여」 (오종래 2026-10-20 확정) — 논제에 있으면 제시문마다 세우기 조각 최소 하나 (그 제시문의 메시지)
//
// 이 파일은 글의 모양(문장 끝·연결어·「은/는」)과 엔진 5색 노드만 읽는다. 뜻을 풀지 않는다.

import { recognizeV2Analysis } from '../fq/index.ts';
import { DEICTICS } from '../fq/v2/pivot.ts';

export interface 제시문메시지 {
  실체: string;
  문장: string;
  근거: '반론 원인' | '결론 문장' | '마지막 문장' | '정의꼴 문장';
}

// 「하지만 … 때문이다」 [오종래 2026-10-20 확정] (숭실대 경상계열 [라]) — 반론 전환(하지만·그러나로 여는 문장) 뒤 원인 단정(「…때문이다.」로 끝나는 문장)이면
//   「때문이다」 앞 원인절이 핵심 메시지다. 결론 문장보다 먼저 본다. 3단계 단락 급소도 이 원인절로 바꾼다 (화면 최종입장)
const 반론어re = /^(?:하지만|그러나)\s+/;
const 원인단정re = /\s*때문이다[.。]$/;
function 반론원인(줄: string[]): 제시문메시지 | null {
  const k = 줄.map((s, i) => (반론어re.test(s) ? i : -1)).filter((i) => i >= 0).at(-1);
  if (k === undefined) return null;
  const 문장 = 줄.slice(k).find((s) => 원인단정re.test(s));
  if (!문장) return null;
  const 실체 = 문장.replace(원인단정re, '').replace(반론어re, '').trim();
  return 실체 ? { 실체, 문장, 근거: '반론 원인' } : null;
}

const 결론어 = ['따라서', '그래서', '결국', '그러므로', '이처럼', '요컨대', '즉', '이제'];
const 결론어re = new RegExp(`^(?:${결론어.join('|')})\\s+`);
const 지시어 = [...DEICTICS, '거기', '여기', '저기', '이곳', '그곳', '저곳'];
/** 정의꼴 문장 — 「…은/는 … 이다.」 · 「…은/는 …의 X다.」 (「여러모로 다르다」 같은 용언 끝은 아니다) */
const 정의꼴 = /(?:은|는)\s.*(?:\S이다|의\s+\S+다)[.。]$/;
/** 앞에서 떼는 어절 — 부사어(「청소년들에게」「이 공간에서」)로 끝난 어절 */
const 부사어절 = /(?:에게|에서|에는|에|으로|로|께)$/;

const 문장들 = (t: string) => t.trim().split(/(?<=[.?!。])\s+/).map((x) => x.trim()).filter(Boolean);

/**
 * 문장의 주어 — 은·는으로 선 엔진 B 가운데 마지막 것(서술어 바로 앞 주제어 — 「많은 청소년들에게」의 관형 「많은」이 아니라), 없으면 이·가로 선 첫 B.
 * 결론 연결어·앞 부사어 어절을 뗀다. 없거나 지시어면 null
 */
function 주어of(문장: string): string | null {
  const bs = recognizeV2Analysis(문장).graph.nodes.filter((n) => n.color === 'B');
  const b = bs.filter((n) => ['은', '는'].includes(n.surface.trim())).at(-1) ?? bs.find((n) => ['이', '가'].includes(n.surface.trim()));
  if (!b) return null;
  const 어절 = b.entity.trim().replace(결론어re, '').split(/\s+/);
  while (어절.length > 1 && 부사어절.test(어절[0])) 어절.shift();
  const 실체 = 어절.join(' ').trim();
  if (!실체 || 지시어.some((d) => 실체 === d || 실체.startsWith(d + '에') || 실체.startsWith(d + ' '))) return null;
  return 실체;
}

/** 제시문 글 → 핵심 메시지 (실체·문장). 아무것도 서지 않으면 null */
export function passage_message(글: string): 제시문메시지 | null {
  const 줄 = 문장들(글);
  if (!줄.length) return null;
  const 원인 = 반론원인(줄);
  if (원인) return 원인;
  const 결론 =[...줄].reverse().find((s) => 결론어re.test(s));
  const 문장 = 결론 ?? 줄.at(-1)!;
  const 실체 = 주어of(문장);
  if (실체) return { 실체, 문장, 근거: 결론 ? '결론 문장' : '마지막 문장' };
  for (const s of 줄) {
    if (!정의꼴.test(s)) continue;
    const 주어 = 주어of(s);
    if (주어) return { 실체: 주어, 문장: s, 근거: '정의꼴 문장' };
  }
  return null;
}

/** 「모두 활용하여」 — 논제가 제시문을 모두 쓰라고 하면 제시문마다 세우기 조각 최소 하나 */
export const all_passages_required = (논제: string) => /모두\s*활용/.test(논제);
