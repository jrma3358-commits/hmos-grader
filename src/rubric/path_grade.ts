// ── 학생 경로 채점 (오종래 2026-10-21 확정 B · Hybrid) ──
// [오종래 2026-10-21 확정 — Claude는 조각 분리만, O/X 판단은 엔진] 이 파일이 단계마다 O/X를 정하는 유일한 자리다 — 결과는 계산 검증 · 정답 대조 · 엔진 조각 판정(G1)에서만 나오고,
//   Claude가 준 다경로 · 까닭 · 대응은 표시와 같은 단계 값 찾기에만 쓴다 (결과를 바꾸지 않는다). 바꾸려면 오종래 확정을 먼저 받는다
//   1. Claude가 학생 답을 파트(근거대기 · 세우기 · 풀기 · 답구하기)별 단계로 나눈다 — 모범답안과 다른 경로면 「다경로」 표시만, O/X는 판단하지 않는다
//   2. 엔진이 단계마다 대조한다 — 계산(「=」 양변이 같은가) · 같은 단계 모범 값(일치 · 불일치는 교사 참고, O/X를 바꾸지 않는다)
//      계산식이 없는 단계는 엔진 조각 판정(G1)을 그대로 쓴다
//   3. 답구하기는 엔진이 학생 최종값을 정답과 대조한다 (모범답안은 정답 값이 없을 때의 참고)
//   4. 점수는 코드가 — 파트 배점(엔진 루브릭)을 그 파트의 학생 단계 수로 나눈다. 최종 확정은 교사(⑤ 교사 확정)
//   5. [오종래 2026-10-21 확정] 파트에 학생 조각이 없는데 최종 답구하기가 정답과 일치하면 — 그 파트는 엔진 조각 판정(G1, 답 전체를 본 판정)으로 복원해
//      조각마다 점수를 준다 (「답은 맞으나 풀이 조각 없음 — 엔진 복원」). 답이 틀리면 그 파트는 「단계 없음」 X 그대로
//   6. [오종래 2026-10-21 확정] 세우기 · 풀기 단계는 화살표(→ · ⇒) 앞 글을 떼고 계산식만 양변 검증한다 — 「[a] v v v v [e] → 4!=24」는 「4!=24」.
//      계산식이 읽히면 Claude가 고른 대응 조각과 상관없이 계산으로 판정한다 (대응 조각의 엔진 판정은 계산식이 없을 때만)
import { counting_line_value, verify_calculation } from './multipath.ts';
import { final_value } from './solve_lines.ts';

export type 경로파트 = '근거대기' | '세우기' | '풀기' | '답구하기';
const 파트순서: 경로파트[] = ['근거대기', '세우기', '풀기', '답구하기'];

/** Claude가 나눈 학생 단계 — 글은 학생 답 줄 그대로 · 대응 = 같은 단계의 엔진 조각 id (없으면 null) */
export interface 학생단계 {
  파트: 경로파트;
  글: string;
  대응: string | null;
  다경로: boolean;
  까닭: string;
}

/** 엔진 루브릭 조각 — 파트 · 배점 · 모범 줄(줄글) · ④ 모범 값(모범답) */
export interface 경로루브릭조각 {
  id: string;
  파트: string;
  배점: number;
  줄글?: string | null;
  모범답?: { 값: string[] } | null;
}

/** 엔진 조각 판정(G1) — 계산식이 없는 단계에 쓴다 */
export interface 엔진조각판정 {
  조각id: string;
  파트: string;
  결과: 'O' | 'X' | '판정불가';
  판단근거?: string;
}

export interface 단계판정 {
  조각id: string;
  파트: 경로파트;
  결과: 'O' | 'X' | '판정불가';
  득점: number;
  배점: number;
  판단근거: string;
  글: string;
  대응: string | null;
  학생값?: string;
  모범값?: string;
  같은단계?: '일치' | '불일치';
  다경로?: string;
  다경로까닭?: string;
  /** 답은 맞으나 풀이 조각 없음 — 엔진 조각 판정으로 복원한 줄 (2026-10-21) */
  복원?: boolean;
}

export interface 경로채점결과 {
  조각별: 단계판정[];
  부분점수: number;
  만점: number;
  파트별: Record<string, { 배점합: number; 파트점수: number }>;
  무너진지점: string | null;
  판정불가: string[];
  경고: string[];
}

const 둘째자리 = (x: number) => Math.round(x * 100) / 100;
const 같은수 = (a: string, b: string) => Math.abs(Number(a) - Number(b)) < 1e-9;

/** 단계 글의 값 — 「=」가 있는 마지막 줄의 끝 값, 없으면 경우의 수 줄 값, 그것도 없으면 마지막 줄 끝 수(「∴ 72가지」) */
function 단계값(글: string): string | null {
  const 줄들 = String(글 ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of [...줄들.filter((x) => x.includes('='))].reverse()) {
    const v = final_value(l);
    if (v !== null) return v;
  }
  const c = counting_line_value(글);
  if (c !== null) return String(c);
  const 끝 = (줄들.at(-1) ?? '').replace(/[−–]/g, '-').match(/(-?\d+(?:\.\d+)?)\s*(?:\(?[가-힣]+\)?)?\s*[.。]?\s*$/);
  return 끝 ? 끝[1] : null;
}

/** 화살표 앞 글 떼기 — 줄에 화살표 뒤 「=」 계산식이 있으면 마지막 화살표까지 뗀다 (「[a] v v v v [e] → 4!=24」 → 「4!=24」, 2026-10-21) */
const 화살표뗌 = (글: string) => String(글 ?? '').split(/\r?\n/).map((l) => l.replace(/^.*[→⇒](?=[^→⇒]*=)/, '')).join('\n');

/** 정답 글의 값 — 「72가지」 → 72. 수가 없으면 null */
function 정답값of(정답: string | null | undefined): string | null {
  const m = String(정답 ?? '').replace(/[−–]/g, '-').match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

/** 파트 배점을 단계 수로 나눈다 — 0.01 단위, 나머지는 끝 단계에 (합이 파트 배점) */
function 나눔(배점합: number, 수: number): number[] {
  if (!수) return [];
  const 몫 = Math.floor((배점합 / 수) * 100) / 100;
  return Array.from({ length: 수 }, (_, i) => (i < 수 - 1 ? 몫 : 둘째자리(배점합 - 몫 * (수 - 1))));
}

export function grade_student_path(단계들: 학생단계[], 조각들: 경로루브릭조각[], 엔진판정들: 엔진조각판정[], 정답: string | null): 경로채점결과 {
  const 배점합 = Object.fromEntries(파트순서.map((p) => [p, 둘째자리(조각들.filter((c) => c.파트 === p).reduce((a, c) => a + (Number(c.배점) || 0), 0))])) as Record<경로파트, number>;
  const 끝모범 = 조각들.find((c) => c.파트 === '답구하기' && c.모범답?.값.length)?.모범답!.값[0] ?? null;
  const 정답값 = 정답값of(정답) ?? (끝모범 !== null && /^-?\d+(\.\d+)?$/.test(끝모범) ? 끝모범 : null);
  const 조각별: 단계판정[] = [];
  const 빈파트: 경로파트[] = [];
  for (const 파트 of 파트순서) {
    if (!배점합[파트]) continue;
    const 내단계 = 단계들.filter((d) => d.파트 === 파트 && String(d.글 ?? '').trim());
    if (!내단계.length) {
      빈파트.push(파트); // 답구하기를 본 뒤 정한다 — 답이 맞으면 엔진 복원
      조각별.push({ 조각id: `${파트}-1`, 파트, 결과: 'X', 득점: 0, 배점: 배점합[파트], 판단근거: '학생 답에 이 파트 단계가 없다', 글: '', 대응: null });
      continue;
    }
    const 배점들 = 나눔(배점합[파트], 내단계.length);
    내단계.forEach((d, i) => {
      const 배점 = 배점들[i];
      const 모범조각 = 조각들.find((c) => c.id === d.대응) ?? null;
      // 세우기 · 풀기는 화살표 앞 글을 떼고 계산식만 (오종래 2026-10-21 확정)
      const 계산 = verify_calculation(파트 === '세우기' || 파트 === '풀기' ? 화살표뗌(d.글) : d.글);
      const 학생값 = 단계값(d.글);
      const 짝글 = 계산.짝.map((p) => `${p.왼}=${p.오른}${p.같음 ? '' : ' ✗'}`).join(' · ');
      const 경로 = d.다경로 ? { 다경로: '학생 경로', 다경로까닭: d.까닭 } : {};
      let 결과: 단계판정['결과'];
      let 판단근거: string;
      let 값: Pick<단계판정, '학생값' | '모범값' | '같은단계'> = {};
      if (파트 === '답구하기') {
        // 최종값 — 학생 끝 값을 정답과 대조 (모범답안은 정답이 없을 때만)
        값 = { ...(학생값 !== null ? { 학생값 } : {}), ...(정답값 !== null ? { 모범값: 정답값 } : {}) };
        if (정답값 === null) { 결과 = '판정불가'; 판단근거 = '정답 값이 없어 대조하지 못함 — 교사 판정'; }
        else if (학생값 === null) { 결과 = 'X'; 판단근거 = `학생 최종값을 찾지 못함 — 정답 ${정답값}`; }
        else {
          결과 = 같은수(학생값, 정답값) ? 'O' : 'X';
          판단근거 = `정답 값 ${정답값} · 학생 최종값 ${학생값} — ${결과 === 'O' ? '일치' : '불일치'}${계산.결과 === 'X' ? ` · 계산 틀림 (${짝글})` : ''}`;
        }
      } else {
        const 모범값 = 모범조각?.줄글 ? (counting_line_value(모범조각.줄글) ?? (final_value(모범조각.줄글) !== null ? Number(final_value(모범조각.줄글)) : null)) : null;
        const 같은단계 = 모범값 !== null && 학생값 !== null ? (같은수(학생값, String(모범값)) ? '일치' : '불일치') : undefined;
        값 = { ...(학생값 !== null ? { 학생값 } : {}), ...(모범값 !== null ? { 모범값: String(모범값) } : {}), ...(같은단계 ? { 같은단계 } : {}) };
        const 참고 = 같은단계 === '불일치' ? ` · 모범답안 같은 단계 값 ${모범값}과 다름 — 학생 경로 안에서 판정 (교사 확인)` : 같은단계 === '일치' ? ` · 모범답안 같은 단계 값 ${모범값}과 같다` : '';
        if (계산.결과 === 'O') { 결과 = 'O'; 판단근거 = `계산 맞음 — ${짝글}${참고}`; }
        else if (계산.결과 === 'X') { 결과 = 'X'; 판단근거 = `계산 틀림 — ${짝글}${참고}`; }
        else {
          // 계산식이 없는 단계(개념 · 조건 확인) — 엔진 조각 판정을 그대로 (대응 조각, 없으면 같은 파트 첫 조각)
          const e = 엔진판정들.find((x) => x.조각id === d.대응) ?? 엔진판정들.find((x) => x.파트 === 파트);
          결과 = e ? e.결과 : '판정불가';
          판단근거 = e ? `계산식 없음 — 엔진 조각 판정 ${e.조각id}: ${e.판단근거 ?? e.결과}` : '계산식 없음 — 교사 판정';
        }
      }
      조각별.push({ 조각id: `${파트}-${i + 1}`, 파트, 결과, 득점: 결과 === 'O' ? 배점 : 0, 배점, 판단근거, 글: d.글.trim(), 대응: d.대응, ...값, ...경로 });
    });
  }
  // 답은 맞으나 풀이 조각 없음 — 엔진 복원 (오종래 2026-10-21 확정). 답구하기 단계가 있고 모두 O일 때만
  const 답단계 = 조각별.filter((x) => x.파트 === '답구하기' && x.글);
  const 답맞음 = 답단계.length > 0 && 답단계.every((x) => x.결과 === 'O');
  if (답맞음) {
    for (const 파트 of 빈파트.filter((p) => p !== '답구하기')) {
      const 자리 = 조각별.findIndex((x) => x.파트 === 파트 && !x.글);
      const 복원 = 조각들.filter((c) => c.파트 === 파트).map((c): 단계판정 => {
        const e = 엔진판정들.find((x) => x.조각id === c.id);
        const 결과 = e ? e.결과 : '판정불가';
        const 배점 = Number(c.배점) || 0;
        return { 조각id: c.id, 파트, 결과, 득점: 결과 === 'O' ? 배점 : 0, 배점, 판단근거: `답은 맞으나 풀이 조각 없음 — 엔진 복원 (${c.id}: ${e?.판단근거 ?? e?.결과 ?? '엔진 판정 없음'})`, 글: '', 대응: c.id, 복원: true };
      });
      조각별.splice(자리, 1, ...복원);
    }
  }
  const 만점 = 둘째자리(Object.values(배점합).reduce((a, b) => a + b, 0));
  const 부분점수 = 둘째자리(조각별.reduce((a, x) => a + x.득점, 0));
  const 파트별 = Object.fromEntries(파트순서.filter((p) => 배점합[p]).map((p) => [p, { 배점합: 배점합[p], 파트점수: 둘째자리(조각별.filter((x) => x.파트 === p).reduce((a, x) => a + x.득점, 0)) }]));
  const 경고: string[] = [];
  if (조각별.some((x) => x.결과 === 'O' && x.같은단계 === '불일치')) 경고.push('모범답안과 다른 값으로 세운 단계가 있습니다 — 학생 경로 안에서는 맞음, 교사 확인을 권합니다');
  if (조각별.some((x) => x.복원)) 경고.push(`답은 맞으나 풀이 조각 없음 — 엔진 복원 (${[...new Set(조각별.filter((x) => x.복원).map((x) => x.파트))].join(' · ')})`);
  if (조각별.some((x) => x.파트 === '답구하기' && x.결과 === 'X') && 조각별.filter((x) => x.파트 !== '답구하기').every((x) => x.결과 !== 'X')) 경고.push('경로 안 계산은 맞으나 최종값이 정답과 다릅니다');
  return {
    조각별, 부분점수, 만점, 파트별,
    무너진지점: 조각별.find((x) => x.결과 === 'X')?.파트 ?? null,
    판정불가: 조각별.filter((x) => x.결과 === '판정불가').map((x) => x.조각id),
    경고,
  };
}
