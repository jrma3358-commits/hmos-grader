// 제시문 핵심 한 줄 · 제시문 간 관계 — 5단계 정교화 · 6단계 추가 논제 화면의 키워드 입력창 위 (오종래 2026-10-21).
// [오종래 2026-10-21 확정] 순서 — 제시문을 먼저 분해해 핵심을 뽑지 않는다. 논제가 먼저다:
//   1 논제 인식 (소문항 급소 · 논제 B)
//   2 논제가 제시문마다 요구하는 역할 — 봉인⑨ 요구 종류(표적 · 관계 · 도구) 그대로
//   3 그 요구에 닿는 제시문 부분 = 제시문 핵심 (깃발). 닿는다 = 조사 뗀 어절 단위 겹침 (통째 포함 아님)
//        · 소문항 급소가 닿으면 → 논제 덩어리 표기 (4단계 연결 단락 급소가 먼저, 없으면 급소 덩어리 어절 겹침)
//        · 급소가 아닌 논제 B만 닿으면 → 제시문 쪽 겹친 실체
//        · 아무것도 안 닿으면 → 「도구 — 논제가 짚은 부분 없음」 (제시문 전체 급소로 돌아가지 않는다)
//   4 제시문 간 관계 — 같은 소문항에 함께 걸린 제시문 쌍만 봉인⑧ 대조 (유사 → 실증 → 대비)
//   적용 범위: 소문항 창이면 그 소문항만, 전체면 모든 소문항을 합쳐 (들어온 소문항 목록 그대로)
// 엔진만 쓴다 (Claude 없음). 조사는 봉인 표지사전의 조사·어미 표지(노드 표지, 한두 글자)로 뗀다.
//   [오종래 2026-10-21 확정] B 실체끼리 맞댈 때는 봉인 「B수렴」(「~으로」「~로」「~에」 — B 안에서 B로 종속·수렴하는 표지)도 뗀다.
//   노드 표지가 아니라 노드 색은 그대로이고, C·P 노드 실체에는 쓰지 않는다 (「정책으로」 ↔ 「정책이」 → 「정책」)
import { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import { loadSealedTable } from '../fq/sealed/index.ts';
import { 봉인8_관계대조, type 관계유형 } from '../filter/sealed/relation.ts';
import type { 요구종류 } from '../filter/sealed/thesis.ts';
import type { 급소단락 } from './relate.ts';

export interface 제시문핵심줄 {
  id: string;
  /** 화면에 보일 핵심 (급소면 논제 덩어리 표기, 논제 B면 제시문 쪽 겹친 실체). 안 닿으면 빈 배열 */
  핵심: string[];
  /** 무엇이 닿았나 — 소문항 급소 · 급소 아닌 논제 B. 안 닿으면 null */
  출처: '급소' | '논제 B' | null;
  /** 논제가 이 제시문에 요구하는 역할 (봉인⑨). 안 닿으면 도구 */
  역할: 요구종류;
  /** 닿은 소문항 */
  소문항: (string | null)[];
}

export interface 제시문관계줄 {
  a: string;
  b: string;
  유형: 관계유형;
  /** 대조한 두 핵심 */
  핵심: [string, string];
  /** 두 제시문을 함께 붙든 소문항 */
  소문항: string | null;
}

/** 소문항 하나 — 논제 글 · 급소 덩어리(4단계 연결) · 봉인⑨ 요구 */
export interface 핵심소문항 {
  번호: string | null;
  텍스트: string;
  급소: string[];
  요구: { 종류: 요구종류; 제시문: string[] }[];
}

const clean = (s: string) => s.trim().replace(/^[\s,，]+/, '');

/** 봉인 조사·어미 표지 가운데 노드 표지(어휘형 아님)의 한두 글자 꼬리 — 긴 것부터 */
let 조사목록: string[] | undefined;
function 조사들(): string[] {
  if (조사목록) return 조사목록;
  const out = new Set<string>();
  for (const sw of loadSealedTable().switches) {
    if (sw.kind !== '조사·어미') continue;
    for (const m of sw.markers ?? []) {
      const lexical = sw.lexical === true || (Array.isArray(sw.lexical) && sw.lexical.includes(m));
      if (!lexical && /^~[가-힣]{1,2}$/.test(m)) out.add(m.slice(1));
    }
  }
  return (조사목록 = [...out].sort((a, b) => b.length - a.length));
}

/** 봉인 「B수렴」 꼬리 — 없으면 빈 목록 (B 실체 맞대기만 덜 뗀다) */
let 수렴목록: string[] | undefined;
function B수렴(): string[] {
  if (수렴목록) return 수렴목록;
  const t = (loadSealedTable() as unknown as Record<string, unknown>)['B수렴'];
  const 표지 = Array.isArray(t) ? t.filter((m): m is string => typeof m === 'string').map((m) => m.replace(/^~/, '')).filter(Boolean) : [];
  return (수렴목록 = 표지.sort((a, b) => b.length - a.length));
}

/** 어절 → 조사 뗀 줄기. 떼고 두 글자 이상 남을 때만 뗀다 (「국가」의 「가」는 그대로). B면 「B수렴」 표지도 뗀다 */
function 줄기(어절: string, B = false): string {
  const w = 어절.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9)]+$/g, '');
  const 조사 = [...(B ? B수렴() : []), ...조사들()].sort((a, b) => b.length - a.length).find((j) => w.endsWith(j) && w.length - j.length >= 2);
  return 조사 ? w.slice(0, -조사.length) : w;
}

const 어절들 = (s: string) => clean(s).split(/\s+/).filter(Boolean);

/** 논제 쪽 글과 제시문 노드 실체의 가장 긴 연속 겹침 (조사 뗀 줄기로) — 제시문 쪽 어절 [시작, 끝) */
function 겹침(논제글: string, 실체: string, B: boolean): { 길이: number; 시작: number } | null {
  const a = 어절들(논제글).map((w) => 줄기(w, B));
  const b = 어절들(실체).map((w) => 줄기(w, B));
  let best: { 길이: number; 시작: number } | null = null;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] && a[i + k] === b[j + k]) k++;
      if (k && (!best || k > best.길이)) best = { 길이: k, 시작: j };
    }
  }
  return best;
}

/** 닿음 판정 — 연속 2어절 이상. 1어절 겹침은 닿음으로 보지 않는다 — 주체 이름(「A국」)·흔한 머리 명사(「정책」)
 *  하나만 겹쳐도 다른 소문항의 급소가 엉뚱한 제시문에 꽂힌다 (문제1 (2-2) 「D국이 시행한 정책」 → [나] 「…보호무역 정책이」) */
const 닿음 = (x: ReturnType<typeof 겹침>) => !!x && x.길이 >= 2;

const 색순 = { B: 0, P: 1, C: 2, D: 3, Q: 4 } as Record<string, number>;

/** 제시문 노드 가운데 논제 글(논제 B · 급소 덩어리 — B 실체)에 가장 길게 닿은 것 — 길이 → 색(B → P → C) → 앞 순.
 *  「B수렴」 표지는 제시문 노드도 B일 때만 뗀다 */
function 닿은노드(논제글: string, 노드: readonly PathNode[]): { node: PathNode; 실체: string; 길이: number } | null {
  let best: { node: PathNode; 실체: string; 길이: number } | null = null;
  for (const n of 노드) {
    if (!n.color || n.color === 'Q') continue;
    const e = clean(n.entity);
    const B = n.color === 'B';
    const x = 겹침(논제글, e, B);
    if (!x || !닿음(x)) continue;
    const 조각 = 어절들(e).slice(x.시작, x.시작 + x.길이);
    조각[조각.length - 1] = 줄기(조각[조각.length - 1], B);
    const 후보 = { node: n, 실체: 조각.join(' '), 길이: x.길이 };
    if (!best || 후보.길이 > best.길이 || (후보.길이 === best.길이 && (색순[n.color] ?? 9) < (색순[best.node.color!] ?? 9))) best = 후보;
  }
  return best;
}

type 깃발 = { 소문항: string | null; 출처: '급소' | '논제 B'; 표기: string; 실체: string; node: PathNode };

export function passage_cores(
  제시문: { id: string; 텍스트: string }[],
  급소단락: readonly 급소단락[] = [],
  소문항: readonly 핵심소문항[] = [],
): { 핵심: 제시문핵심줄[]; 관계: 제시문관계줄[] } {
  const 노드 = new Map(제시문.map(({ id, 텍스트 }) => [id, recognizeV2Analysis(텍스트).graph.nodes as readonly PathNode[]]));
  // 1 논제 인식 — 소문항마다 급소 아닌 논제 B (급소 덩어리를 품은 B는 뺀다)
  const 논제B = new Map(소문항.map((s) => {
    const bs = recognizeV2Analysis(s.텍스트).graph.nodes.filter((n) => n.color === 'B').map((n) => clean(n.entity));
    return [s, [...new Set(bs)].filter((b) => !s.급소.some((g) => clean(g).includes(b) || b.includes(clean(g))))];
  }));

  const 깃발들 = new Map<string, 깃발[]>(제시문.map((p) => [p.id, []]));
  const 역할들 = new Map<string, 요구종류[]>(제시문.map((p) => [p.id, []]));
  for (const s of 소문항) {
    for (const p of 제시문) {
      // 2 요구 — 이 소문항이 이 제시문을 부르지 않으면 보지 않는다
      const 요구 = s.요구.find((r) => r.제시문.includes(p.id));
      if (!요구) continue;
      const ns = 노드.get(p.id)!;
      // 3 닿는 부분 — 4단계 연결 단락 급소 → 급소 덩어리 어절 겹침 → 논제 B 어절 겹침
      const 연결 = 급소단락.filter((x) => x.단락 === p.id && x.소문항.includes(s.번호));
      let 닿은: 깃발[] = 연결.map((x) => {
        const g = clean(x.급소);
        return { 소문항: s.번호, 출처: '급소' as const, 표기: clean(x.표기 ?? x.급소), 실체: g, node: ns.find((n) => clean(n.entity) === g) ?? ({ id: `#${g}`, entity: g } as PathNode) };
      });
      if (!닿은.length) {
        닿은 = s.급소.flatMap((g) => {
          const hit = 닿은노드(g, ns);
          return hit ? [{ 소문항: s.번호, 출처: '급소' as const, 표기: clean(g), 실체: hit.실체, node: hit.node }] : [];
        });
      }
      if (!닿은.length) {
        닿은 = 논제B.get(s)!.flatMap((b) => {
          const hit = 닿은노드(b, ns);
          return hit ? [{ 소문항: s.번호, 출처: '논제 B' as const, 표기: hit.실체, 실체: hit.실체, node: hit.node }] : [];
        });
      }
      if (!닿은.length) continue;
      깃발들.get(p.id)!.push(...닿은);
      역할들.get(p.id)!.push(요구.종류);
    }
  }

  const 핵심 = 제시문.map(({ id }): 제시문핵심줄 => {
    const fs = 깃발들.get(id)!;
    // 급소가 닿았으면 급소 깃발만 보인다 — 논제 B는 급소가 안 닿은 제시문의 깃발이다
    const 보일 = fs.some((f) => f.출처 === '급소') ? fs.filter((f) => f.출처 === '급소') : fs;
    if (!보일.length) return { id, 핵심: [], 출처: null, 역할: '도구', 소문항: [] };
    const 역할 = 역할들.get(id)!;
    return {
      id,
      핵심: [...new Set(보일.map((f) => f.표기))],
      출처: 보일[0].출처,
      // 요구 종류가 여럿이면 표적 → 관계 → 도구 (봉인⑨ 순서) 가운데 앞의 것
      역할: (['표적', '관계', '도구'] as 요구종류[]).find((k) => 역할.includes(k)) ?? '도구',
      소문항: [...new Set(보일.map((f) => f.소문항))],
    };
  });

  // 4 관계 — 같은 소문항에 함께 걸린 쌍만. 같은 쌍·같은 유형·같은 소문항은 하나로
  const 관계: 제시문관계줄[] = [];
  for (const s of 소문항) {
    const 걸린 = 제시문.map((p) => ({ id: p.id, 깃: 깃발들.get(p.id)!.filter((f) => f.소문항 === s.번호) })).filter((x) => x.깃.length);
    for (let i = 0; i < 걸린.length; i++) {
      for (const b of 걸린.slice(i + 1)) {
        const a = 걸린[i];
        for (const ka of a.깃) {
          for (const kb of b.깃) {
            const 유형 = 봉인8_관계대조({ id: a.id, 핵심: { 실체: ka.실체, node: ka.node }, 노드: 노드.get(a.id) }, { id: b.id, 핵심: { 실체: kb.실체, node: kb.node }, 노드: 노드.get(b.id) });
            if (!관계.some((r) => r.a === a.id && r.b === b.id && r.유형 === 유형 && r.소문항 === s.번호)) 관계.push({ a: a.id, b: b.id, 유형, 핵심: [ka.실체, kb.실체], 소문항: s.번호 });
          }
        }
      }
    }
  }
  return { 핵심, 관계 };
}
