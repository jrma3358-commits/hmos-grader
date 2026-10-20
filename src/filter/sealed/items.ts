// [봉인⑩~⑬] 필터 판정 중 판단이 드는 항목 (문항분석 명세서-2 §5) — 오종래가 채운다.
// 구조만으로 가릴 수 있는 항목(급소 명확·재료 완결·논술형 관계 적절)은 judge.ts에 있다.
// 코드가 대신 판단하지 않는다. 비어 있으면 소리 내어 실패한다.
// ⑬은 채워졌다 (오종래 2026-10-13) — C·논술 5단계 정교화 4갈래 진단 (조립설명서 C·논술 9단계).
// ⑩은 채워졌다 (오종래 2026-10-20) — 서술형 바탕→도달: 급소 앞 배경의 숫자·조건 표지.
// ⑪은 채워졌다 (오종래 2026-10-20) — 요소 결손: 계열별 파트 조각이 모두 0개인가.
// ⑫는 채워졌다 (오종래 2026-10-20) — 중의성: 한 소문항 안에서 같은 실체가 색이 다른 노드로 잡히는가.
import type { V2Analysis } from '../../fq/pipeline.ts';
import { essay_pivot_chunks } from '../../thesis/chunk.ts';
import { 기호뿐 } from '../../thesis/sign.ts';
import { SealedError } from '../../fq/sealed/index.ts';
import type { 계열, 급소K, 파트 } from '../../rubric/types.ts';
import type { 서술형분석 } from '../descriptive.ts';
import type { 논술형분석 } from '../essay.ts';
import type { 서술형실체 } from '../substance.ts';

/** [봉인⑩] 바탕→도달 판정 — 연결 완료 | 보완 권장, 근거는 걸린 노드 */
export interface 관계판정 {
  결과: '연결 완료' | '보완 권장';
  근거: string;
}

/** 봉인⑩ 조건 표지 (오종래 2026-10-20 확정) */
const 조건표지 = /라고\s*한다면|일\s*때|이면|경우/;

/**
 * [봉인⑩] 서술형 관계 적절 — 이 바탕에서 이 급소로 가는 관계가 서는가.
 * [오종래 2026-10-20 확정] 급소 앞 배경(급소보다 앞에 놓인 노드의 실체·표지)에 다음 중 하나라도 있으면 연결 완료:
 *   · 숫자 (단위 포함: 10 m/s · 200 g · 0.1초 등)
 *   · 조건 표지: 「라고 한다면」 · 「일 때」 · 「이면」 · 「경우」
 * 없으면 보완 권장 — 배경과 무관하게 급소만 단독으로 있다. 판정은 재판정(교사가 다시 본다, judge.ts)
 */
export function 봉인10_관계적절(실체: 서술형실체, k: 급소K): 관계판정 {
  const 앞 = [...실체.바탕.map((e) => e.node), ...실체.도달.map((e) => e.node), ...실체.미결]
    .filter((n) => n.id !== k.node.id && n.index < k.node.index)
    .sort((a, b) => a.index - b.index);
  const 숫자 = 앞.find((n) => /\d/.test(n.entity + n.surface));
  if (숫자) return { 결과: '연결 완료', 근거: `급소 앞 배경의 숫자 「${숫자.entity.trim()}」(${숫자.id})` };
  const 조건 = 앞.find((n) => 조건표지.test(n.entity + n.surface));
  if (조건) return { 결과: '연결 완료', 근거: `급소 앞 배경의 조건 표지 「${조건.entity.trim()}${조건.surface}」(${조건.id})` };
  return { 결과: '보완 권장', 근거: `급소 「${k.실체}」 앞 배경에 숫자·조건 표지가 없음 — 급소만 단독` };
}

/**
 * [봉인⑪] 요소 결손 — 문항이 엔진 조각(봉인②)을 낼 재료를 갖췄는가. 빠진 요소를 돌려준다 (빈 배열 = 결손 없음).
 * [오종래 2026-10-20 확정]
 *   · 수리계산형(B-s · C-2, 계열 수리): 세우기 · 풀기 · 답구하기 조각이 모두 0개면 요소 결손, 하나라도 있으면 통과
 *   · 논리서술형(B-h · C-1, 계열 인문사회국어): 근거대기 · 논지 · 서술 조각이 모두 0개면 요소 결손, 하나라도 있으면 통과
 *     — 논지 = 세우기, 서술 = 풀기 · 답구하기 (인문 4축 논리 펼치기 · 답표현하기 자리)
 * 계열을 모르면 수리 구조 (봉인② 기본과 같다). 논술형 필터 분석에는 조각이 없어 비어 있는 채로 둔다 (C는 9단계 흐름이 루브릭 조각을 낸다)
 */
export function 봉인11_요소결손(분석: 서술형분석 | 논술형분석, 계열?: 계열): string[] {
  if (!('조각들' in 분석)) throw new SealedError('[봉인⑪] 논술형 필터 분석에는 엔진 조각이 없어 요소 결손을 셀 수 없습니다 — C는 9단계 루브릭에서 봅니다.');
  const 센다 = (파트들: 파트[]) => 분석.조각들.filter((c) => 파트들.includes(c.파트)).length;
  if (계열 === '인문사회국어') {
    return 센다(['근거대기', '세우기', '풀기', '답구하기']) ? [] : ['근거대기 · 논지(세우기) · 서술(풀기 · 답구하기) 조각이 모두 0개'];
  }
  return 센다(['세우기', '풀기', '답구하기']) ? [] : ['세우기 · 풀기 · 답구하기 조각이 모두 0개'];
}

/**
 * [봉인⑫] 중의성 — 한 실체가 하나의 소문항 안에서 두 가지 다른 의미로 쓰이는가. 걸린 실체를 돌려준다 (빈 배열 = 없음).
 * [오종래 2026-10-20 확정]
 *   · 한 실체가 여러 소문항 논제에 걸쳐 있어도 각 소문항이 독립된 논제를 가지면 중의성 아님 — 이 판정은 소문항(단독문제면 문항) 하나씩 받으므로
 *     소문항 사이 겹침은 보지 않는다 (judge.ts가 소문항마다 부른다)
 *   · 한 소문항 안에서 같은 실체가 두 가지 다른 의미로 쓰일 때만 중의성 — 의미 = 엔진 5색(역할).
 *     같은 실체 글(앞 쉼표·공백 뗌)이 색이 다른 노드 둘 이상으로 잡히면 중의성. 색 미결 노드는 세지 않는다 (추측하지 않는다)
 * 논술형 필터 분석에는 노드가 없어 비어 있는 채로 둔다 (봉인⑪과 같다)
 */
export function 봉인12_중의성(분석: 서술형분석 | 논술형분석): string[] {
  if (!('조각들' in 분석)) throw new SealedError('[봉인⑫] 논술형 필터 분석에는 엔진 노드가 없어 중의성을 볼 수 없습니다 — C는 9단계 흐름에서 봅니다.');
  const 노드들 = [...분석.실체.바탕, ...분석.실체.도달].map((e) => e.node);
  const 묶음 = new Map<string, typeof 노드들>();
  for (const n of 노드들) {
    const 글 = displayEntity(n.entity);
    if (!글 || n.color === null) continue;
    묶음.set(글, [...(묶음.get(글) ?? []), n]);
  }
  return [...묶음]
    .filter(([, ns]) => new Set(ns.map((n) => n.color)).size > 1)
    .map(([글, ns]) => `「${글}」 ${ns.map((n) => `${n.color}(${n.id})`).join(' · ')}`);
}

/** 실체 글 비교용 — 앞 쉼표·공백 뗌 */
const displayEntity = (s: string) => s.trim().replace(/^[,，]\s*/, '');

/** 정교화 4갈래 (논제생성 명세서-2 §3) */
export type 정교화갈래 = '일방흐름' | '서술복잡' | '급소불명확' | '사족';

/** 4단계 ④사족 — 제시문 어느 단락 급소와도 연결선이 없는 논제 급소 (오종래 2026-10-13, thesis/align.ts) */
export interface 사족노드 {
  소문항: string | null;
  급소: string;
}

export interface 정교화진단 {
  갈래: 정교화갈래;
  /** 진단한 단위(소문항). 단위가 하나뿐인 논제면 null */
  단위: string | null;
  근거: string;
}

type 인식단위 = Pick<V2Analysis, 'question' | 'graph' | 'pivot'>;

/** 진단 단위 — 소문항 하나의 인식. C 논제는 split_thesis가 나눈 소문항마다 (오종래 2026-10-13) */
export interface 진단단위 {
  이름: string | null;
  인식: 인식단위;
  /** 자료 분석형 — 소문항(공통 발문 포함)이 〈자료 N〉·[자료 N]을 부른다 (오종래 2026-10-20, 서술복잡을 내리지 않는다) */
  자료분석?: boolean;
  /** 자료 분석형 병렬 소문항 — 자료분석이고 앞 소문항을 이어받지 않는다 (오종래 2026-10-20, 일방흐름도 내리지 않는다) */
  병렬자료?: boolean;
}

/** 엔진이 나눈 단위(split_units)로 — 나누지 않았으면 전체가 한 단위 */
export function 엔진단위(a: V2Analysis & { units?: V2Analysis[] }): 진단단위[] {
  if (!a.units?.length) return [{ 이름: null, 인식: a }];
  return a.units.map((u, i) => ({ 이름: `단위 ${i + 1}`, 인식: u }));
}

/** 서술복잡에서 세지 않는 기호 B — 실체가 기호(나열·범위 포함)뿐 (오종래 2026-10-15, thesis/sign.ts) */
const 기호B = 기호뿐;

/** 서술복잡에서 세지 않는 수치 B — 숫자(+단위)를 다 떼면 구분 기호(쉼표·공백·가운뎃점·물결·괄호)만 남는다 (오종래 2026-10-20) */
const 수치 = /[-+]?\d+(?:[.,]\d+)*\s*(?:[a-zA-Zμ°℃℉Ω%‰/²³⁻¹·]+|[가-힣]{1,2})?/g;
const 수치B = (실체: string) => /\d/.test(실체) && 실체.replace(수치, '').replace(/[\s,，·~∼\-()（）]/g, '') === '';

/** 서술복잡에서 세지 않는 알파벳 기호 B — 단일 알파벳(「A」「C」, 나열·범위 「A~C」「A, B」 포함)뿐 (오종래 2026-10-20, 수치 B와 같은 구분 기호) */
const 알파벳B = (실체: string) => /^[A-Za-z](?:[\s,，·~∼\-]+[A-Za-z])*$/.test(실체.trim().replace(/^[,，]\s*/, ''));

/** 물음 앞 배경 문장의 B — 표지 뒤부터 다음 Q 노드까지 사이에 평서 종결 「~다.」가 있다 (오종래 2026-10-15) */
function 배경문장B(question: string, n: { index: number; surface: string }, nodes: readonly { index: number; color: string | null }[]): boolean {
  const q = nodes.find((x) => x.color === 'Q' && x.index > n.index);
  if (!q) return false;
  return /다\s*[.。](?=\s|$)/.test(question.slice(n.index + n.surface.length, q.index));
}

/** 소문항(단위) 하나의 ①②③ */
function 단위진단(u: 인식단위, 단위: string | null, 자료분석 = false, 병렬자료 = false): 정교화진단[] {
  const nodes = [...u.graph.nodes].sort((a, b) => a.index - b.index);
  const 진단: 정교화진단[] = [];
  const pivots = u.pivot.ok ? (u.pivot.pivots ?? [u.pivot.pivot]) : [];

  // ① 일방흐름 — 급소 B 바로 다음이 Q이고, 이 단위에 C 노드가 없다
  //   [오종래 2026-10-20 확정] 자료 분석형 병렬 소문항(소문항마다 다른 자료·제시문 참조)은 내리지 않는다 — 자료 분석 → 논지 전개는 정상 구조
  if (!병렬자료 && !nodes.some((n) => n.color === 'C')) {
    for (const p of pivots) {
      if (p.node.color !== 'B') continue;
      const 다음 = nodes[nodes.findIndex((n) => n.id === p.node.id) + 1];
      if (다음?.color === 'Q') {
        진단.push({ 갈래: '일방흐름', 단위, 근거: `급소 B「${p.node.entity.trim()}」(${p.node.id}) → Q「${다음.surface}」(${다음.id}), C 노드 없음` });
      }
    }
  }

  // ② 서술복잡 — B 노드 3개 이상이고 C-F 노드가 없다
  //   [오종래 2026-10-15 안 A] 기호 B는 세지 않는다 — 실체가 제시문 기호(「(나)」「[가]」)·원문자 기호(「ⓐ」「㉠」, 나열·범위 포함)뿐인 B는
  //   대상이 아니라 가리키는 표시다. 「ⓐ~ⓓ에 담긴 차별적 인식」처럼 기호 뒤에 명사구가 붙으면 그대로 센다.
  //   [오종래 2026-10-15 안 B] 물음 문장 밖 B는 세지 않는다 — B 표지 뒤부터 다음 Q까지 사이에 평서 종결(「~다.」)이 있으면
  //   그 B는 물음 앞 배경 문장(「…주장이 제기되고 있다.」)에 있다. 인용 명제(「'…해야 한다.'는」)는 노드 표지가 인용 전체라 걸리지 않는다.
  //   [오종래 2026-10-20] 급소를 꾸미는 관형절 안 B는 세지 않는다 — 급소 B 바로 앞이 관형형 C(「~는」 LS-21b, 「살아가는」)면
  //   같은 물음(앞 Q 뒤 ~ 급소 앞)의 B는 급소 명사구를 꾸미는 말이다 (「'포장'의 역할이 소비주의 시대를 살아가는 인간의 삶에 미칠 수 있는 영향」 → B 하나)
  const 꾸밈B = new Set<string>();
  for (const p of pivots) {
    const at = nodes.findIndex((n) => n.id === p.node.id);
    const 앞 = nodes[at - 1];
    if (p.node.color !== 'B' || !앞 || 앞.color !== 'C' || 앞.switchId !== 'LS-21b') continue;
    for (let k = at - 2; k >= 0 && nodes[k].color !== 'Q'; k--) if (nodes[k].color === 'B') 꾸밈B.add(nodes[k].id);
  }
  //   [오종래 2026-10-20 확정] 수치 B는 세지 않는다 — 실체가 수치(숫자·단위, 「10 m/s」「200 g」「0.1초」「25℃, 1기압」)뿐인 B는 조건 값이지 실체 명사가 아니다.
  //   「10 m/s의 속도로 굴러오」처럼 수치에 명사·서술이 붙으면 그대로 센다
  //   [오종래 2026-10-20 확정] 알파벳 기호 B도 세지 않는다 — 「A」「C」(신경 A~C 같은 이름표)는 대상을 가리키는 기호다. 「A의 속도」처럼 말이 붙으면 센다
  const bs = nodes.filter((n) => n.color === 'B' && !기호B(n.entity) && !수치B(n.entity) && !알파벳B(n.entity) && !배경문장B(u.question, n, nodes) && !꾸밈B.has(n.id));
  //   [오종래 2026-10-20 확정] 자료 분석형 소문항(〈자료 N〉·[자료 N]을 부른다)은 서술복잡을 내리지 않는다 — 자료 분석 → 논지 전개는 상경계열 논술의 정상 구조
  if (!자료분석 && bs.length >= 3 && !nodes.some((n) => n.switchId === 'C-F')) {
    진단.push({ 갈래: '서술복잡', 단위, 근거: `B 노드 ${bs.length}개 (${bs.map((n) => n.id).join('·')}), C-F 없음` });
  }

  // ③ 급소불명확 — MULTIPLE_CONVERGENCE, 또는 Q 앞에 B+C 덩어리가 서지 않음 (수렴도는 보지 않는다, 오종래 2026-10-13)
  if (!u.pivot.ok && u.pivot.flag === 'MULTIPLE_CONVERGENCE') {
    진단.push({ 갈래: '급소불명확', 단위, 근거: `MULTIPLE_CONVERGENCE — 후보 ${u.pivot.candidates.map((n) => `「${n.entity.trim()}」`).join(' ')}` });
  }
  if (!essay_pivot_chunks(u.graph).length) {
    진단.push({ 갈래: '급소불명확', 단위, 근거: 'Q 앞에 B+C 덩어리가 서지 않음 — 무엇을(B) 묻는지 없음' });
  }
  return 진단;
}

/**
 * [봉인⑬] 정교화 진단 — 논제 인식(엔진)과 4단계 ④사족에서 정교화 4갈래를 가린다. 빈 배열 = 정교화 신호 없음.
 * [오종래 2026-10-13]
 *   ① 일방흐름: 논제 B노드가 C노드 없이 Q로 바로 연결될 때 — 급소 B만 본다. 길 순서상 급소 B 바로 다음이 Q이고, 단위에 C 노드가 없다
 *   ② 서술복잡: B노드가 3개 이상이고 C-F 없을 때 — 소문항(단위)마다 센다
 *   ③ 급소불명확: MULTIPLE_CONVERGENCE이거나, Q 앞에 B+C 덩어리가 서지 않을 때 (thesis/chunk.ts).
 *      [오종래 2026-10-13] 논술 논제의 Q는 형식, 급소는 Q 앞 B+C 덩어리 — 수렴도 0 기준은 거둔다
 *   ④ 사족: 논제가 요구하는 실체의 근거가 제시문에 없는 것 — 논제 급소가 제시문 어느 단락 급소와도 연결되지 않을 때.
 *      4단계(thesis/align.ts) 결과를 받아 그대로 싣는다 (생성 없음)
 * ①②③은 단위(소문항)마다 본다. C 논제는 split_thesis로 나눈 소문항, 그 밖은 엔진단위().
 */
export function 봉인13_정교화진단(단위들: 진단단위[], 사족: 사족노드[]): 정교화진단[] {
  const 진단 = 단위들.flatMap((u) => 단위진단(u.인식, u.이름, !!u.자료분석, !!u.병렬자료));
  for (const s of 사족) {
    진단.push({ 갈래: '사족', 단위: s.소문항, 근거: `논제 급소「${s.급소}」 — 제시문 어느 단락 급소와도 연결선 없음` });
  }
  return 진단;
}
