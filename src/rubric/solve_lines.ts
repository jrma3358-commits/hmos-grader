// 서술형 B 교사 모범답안 → ③ 풀기 줄 (오종래 2026-10-16) — 교사는 라벨 없이 줄바꿈으로 쓰기만 한다.
// ①②④ 조각은 엔진 F2 그대로. 풀기 = 세우기 이후 ~ 답구하기 이전 구간, 줄 하나 = 풀기 조각 하나 (인식결과.교사풀기 → 봉인2_풀기).
//   답 줄     = 엔진 ④ 급소 K 핵심어가 마지막으로 나온 줄 — 없으면 마지막 줄 (오종래 2026-10-16)
//   세우기 끝 = 답 줄 앞에서 엔진 ② 세우기 조각의 실체(단락 급소·노드)가 마지막으로 나온 줄
//              (답 줄을 먼저 잡는다 — 세우기 실체는 대개 논제 주어라 답 줄에도 나온다, 오종래 2026-10-16 보완)
//   풀기      = 그 사이의 빈 줄 아닌 줄들
import type { 조각뼈대 } from './types.ts';

export interface 풀기구간 {
  /** 빈 줄을 뺀 줄 수 */
  줄수: number;
  /** 세우기 끝 줄 (1부터). 세우기 실체가 답 줄 앞 어느 줄에도 없으면 null — 첫 줄까지를 앞 구간으로 본다 */
  세우기끝: number | null;
  /** 답 시작 줄 (1부터) */
  답줄: number;
  /** K 핵심어가 나오는 줄이 없어 마지막 줄을 답으로 보았다 */
  답대체: boolean;
  풀기: string[];
}

/** 조건에 맞는 마지막 줄의 번호 (0부터), 없으면 -1 */
const 마지막 = (줄: string[], f: (l: string) => boolean) => {
  for (let i = 줄.length - 1; i >= 0; i--) if (f(줄[i])) return i;
  return -1;
};

const 깨끗이 =(t: string | null | undefined) => String(t ?? '').trim().replace(/^[,，]\s*/, '');

/** 세우기 조각의 실체 — 인문은 근거 문장의 단락 급소, 수리 구조면 노드 */
const 세우기실체 = (c: 조각뼈대) => 깨끗이(c.근거?.단락급소 ?? c.node?.entity);
/** 답구하기 조각의 급소 글자 — 경로 K 핵심어, 없으면 K 실체 · 노드 */
const 답글자 = (c: 조각뼈대) => {
  const K = c.경로?.length ? c.경로[c.경로.length - 1] : null;
  return 깨끗이(K ? K.핵심어 || K.실체 : c.node?.entity);
};

export function split_solve_lines(답안: string, 조각들: 조각뼈대[]): 풀기구간 {
  const 줄 = String(답안 ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const 세우기 = 조각들.filter((c) => c.파트 === '세우기').map(세우기실체).filter(Boolean);
  const 답 = 조각들.filter((c) => c.파트 === '답구하기').map(답글자).filter(Boolean);
  let 답i = 마지막(줄, (l) => 답.some((t) => l.includes(t)));
  const 답대체 = 답i < 0;
  if (답대체) 답i = 줄.length - 1;
  const 끝 = 마지막(줄.slice(0, Math.max(답i, 0)), (l) => 세우기.some((t) => l.includes(t)));
  // 세우기 실체가 답 줄 앞 어느 줄에도 없으면 첫 줄까지를 앞 구간(근거·세우기)으로 본다
  const 앞끝 = 끝 >= 0 ? 끝 : 0;
  return {
    줄수: 줄.length,
    세우기끝: 끝 >= 0 ? 끝 + 1 : null,
    답줄: 답i + 1,
    답대체,
    풀기: 답i > 앞끝 ? 줄.slice(앞끝 + 1, 답i) : [],
  };
}
