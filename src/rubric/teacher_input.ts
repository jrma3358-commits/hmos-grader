// 교사 입력 — 문항 등록창의 정답 · 질문의 핵심 · 모범답안 (오종래 2026-10-16).
//   소문항몫   : 한 칸에 쓴 글을 소문항 (1)(2)…으로 나눈다 — 줄 머리 「(1)」「(2)」. 머리가 없으면 정답·핵심은 모든 소문항, 모범답안은 첫 소문항
//   질문의 핵심 : 엔진 급소가 서지 않았을 때(NO_B·MULTIPLE_CONVERGENCE)만, 엔진이 잡은 노드 중 그 글자를 담은 노드를 급소로 고른다.
//                 엔진 급소가 서 있으면 건드리지 않고, 노드에 없는 말을 급소로 지어내지 않는다
//   정답 검증   : 정답은 채점 기준이 아니라 검증이다 — 모범답안의 답구하기 줄(solve_lines.ts 답 줄)과 대조해
//                 일치하면 통과, 불일치하면 「문항 오류 또는 정답 오류」로 교사 확인에 넘긴다
//                 C 논술 9단계 모범답안은 한 문단이라 줄 대신 문장 단위로 본다 (답 문장 = 급소 핵심어가 마지막으로 나온 문장, 2026-10-16)
import type { recognizeV2Analysis } from '../fq/pipeline.ts';
import type { PathNode } from '../fq/v2/graph.ts';
import { split_sentences } from './f2.ts';
import { split_solve_lines } from './solve_lines.ts';
import type { 조각뼈대 } from './types.ts';

type V2Analysis = ReturnType<typeof recognizeV2Analysis>;

const 소문항머리 = /^[ \t]*\((\d+(?:-\d+)?)\)[ \t]*/gm;

/** 한 칸 글 → 이 소문항(번호, 몇째)의 몫. 배열이면 n째 그대로 */
export function item_portion(값: unknown, 번호: string | null, n: number, 모범답안 = false): string {
  if (Array.isArray(값)) return 값[n] == null ? '' : String(값[n]);
  const 글 = String(값 ?? '');
  const 머리 = [...글.matchAll(소문항머리)];
  if (!머리.length) return 모범답안 && n > 0 ? '' : 글.trim();
  const i = 머리.findIndex((m) => m[1] === 번호);
  if (i < 0) return '';
  const 끝 = i + 1 < 머리.length ? 머리[i + 1].index : 글.length;
  return 글.slice(머리[i].index! + 머리[i][0].length, 끝).trim();
}

/** 쉼표·가운뎃점·줄바꿈으로 나눈 낱말들 */
const 낱말들 = (글: string) => 글.split(/[,，·\n]/).map((t) => t.trim()).filter(Boolean);
const 붙여 = (t: string) => t.replace(/\s+/g, '');

// 괄호 (오종래 2026-10-16) — 정답 검증은 괄호를 보지 않는다: 기호만 뗀 꼴(「연구개발(R&D) 지원」 → 「연구개발R&D지원」 ⊃ 「R&D 지원」)과
//   괄호 안 내용까지 뗀 꼴(→ 「연구개발지원」 ⊃ 「연구개발 지원」) 가운데 하나라도 맞으면 일치
const 괄호기호 = /[()（）[\]［］]/g;
const 괄호구간 = /[(（[［][^()（）[\]［］]*[)）\]］]/g;
const 꼴들 = (t: string) => [...new Set([t, t.replace(괄호기호, ''), t.replace(괄호구간, '')].map(붙여))].filter(Boolean);
/** 정답 낱말이 답 줄에 있는가 — 띄어쓰기·괄호 무시 */
const 담겼나 = (줄: string, 낱말: string) => 꼴들(낱말).some((k) => 꼴들(줄).some((l) => l.includes(k)));

/**
 * 질문의 핵심 — 급소가 서지 않은 인식에만. 그 실패의 후보 노드부터, 없으면 Q가 아닌 모든 노드에서
 * 핵심 낱말을 담은 노드를 찾는다 (B 먼저, 같으면 뒤 노드 — 물음에 가까운 쪽). 못 찾으면 인식 그대로
 */
export function apply_core_hint(a: V2Analysis, 핵심: string): V2Analysis {
  const 낱말 = 낱말들(핵심).map(붙여);
  if (a.pivot.ok || !낱말.length) return a;
  const 담음 = (n: PathNode) => 낱말.some((t) => 붙여(n.entity).includes(t));
  const 고름 = (ns: PathNode[]) => {
    const 맞음 = ns.filter((n) => n.color !== 'Q' && 담음(n));
    return 맞음.filter((n) => n.color === 'B').at(-1) ?? 맞음.at(-1);
  };
  const node = 고름(a.pivot.candidates) ?? 고름(a.graph.nodes);
  if (!node) return a;
  return { ...a, pivot: { ok: true, pivot: { node, reason: '질문의 핵심', keyword: node.entity.trim().replace(/^[\s,]+/, ''), convergence: 0, sameAsDeepest: false } } };
}

export interface 정답검증 {
  결과: '일치' | '불일치' | '검증 안 함';
  정답: string;
  /** 모범답안에서 답구하기로 본 줄 (문장 단위면 문장) */
  답줄글: string | null;
  단위: '줄' | '문장';
  /** 답 줄에 없는 정답 낱말 */
  빠진: string[];
  사유: string;
}

/**
 * 정답 ↔ 모범답안 답구하기 줄 — 정답 낱말(쉼표·줄바꿈으로 나눔)이 모두 답 줄에 있으면 일치 (띄어쓰기·괄호는 보지 않는다).
 * 단위 「문장」이면 모범답안을 문장으로 나눠 답 문장과 대조한다 (C 논술 9단계 — 한 문단 모범답안)
 */
export function verify_answer(정답: string, 모범답안: string, 조각들: 조각뼈대[], 단위: '줄' | '문장' = '줄'): 정답검증 {
  const 답 = String(정답 ?? '').trim();
  const 이름 = 단위 === '문장' ? '문장' : '줄';
  if (!답) return { 결과: '검증 안 함', 정답: '', 답줄글: null, 단위, 빠진: [], 사유: '정답이 없습니다' };
  if (!String(모범답안 ?? '').trim()) return { 결과: '검증 안 함', 정답: 답, 답줄글: null, 단위, 빠진: [], 사유: '모범답안이 없어 대조하지 않았습니다' };
  const 글 = 단위 === '문장' ? String(모범답안).split(/\r?\n/).flatMap(split_sentences).join('\n') : 모범답안;
  const 줄 = split_solve_lines(글, 조각들).답글;
  const 빠진 = 낱말들(답).filter((t) => !담겼나(줄, t));
  return 빠진.length
    ? { 결과: '불일치', 정답: 답, 답줄글: 줄, 단위, 빠진, 사유: '문항 오류 또는 정답 오류 — 교사 확인이 필요합니다' }
    : { 결과: '일치', 정답: 답, 답줄글: 줄, 단위, 빠진: [], 사유: `모범답안 답구하기 ${이름}과 정답이 맞습니다` };
}
