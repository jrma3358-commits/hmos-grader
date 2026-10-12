// /analyze 러너 — 엔진(hmos-grader/)을 부르기만 한다. 엔진에 없는 판단은 하지 않는다 (안 1, 오종래 2026-10-11).
// 사용: node analyze-runner.mts <요청.json> <결과.json>
//   요청: { 문항원문, 파이프라인: 'A'|'B'|'C', 논제?, 제시문? }
//   흐름: 인식 → (C) 제시문 인식·연결 → 1차 필터 확인화면 → [교사 ① 승인 대기]
// 엔진이 멈추면(SealedError·급소 실패) 그 자리와 사유를 그대로 싣고 끝낸다 — 어디서 멈췄는지가 곧 다음에 채울 봉인이다.
// 루브릭·모범답안(generate_rubric)은 교사가 확인화면에서 ①로 승인한 문항만 받는다 (명세서-2 §6) — 여기서는 승인하지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const GRADER = process.env.HMOS_GRADER ?? join(import.meta.dirname, 'hmos-grader');
const load = (p: string) => import(pathToFileURL(join(GRADER, p)).href);
const fq = await load('src/fq/index.ts');
const { recognizePassage, connectPassage } = await load('src/fq/v2/passage.ts');
const { make_screen } = await load('src/filter/confirm.ts');

const [reqPath, outPath] = process.argv.slice(2);
const req = JSON.parse(readFileSync(reqPath, 'utf8'));
const 파이프라인 = String(req.파이프라인 ?? '').trim().charAt(0).toUpperCase();
const 문항원문 = String(req.문항원문 ?? '').trim();

/** 엔진이 던진 멈춤 — 봉인 번호가 있으면 함께 */
function 멈춤of(e: any) {
  const 봉인 = /\[(봉인[^\]]+)\]/.exec(e?.message ?? '')?.[1];
  return { 멈춤: 봉인 ?? e?.name ?? 'Error', 종류: e?.name ?? 'Error', 사유: String(e?.message ?? e) };
}

function 엔진버전() {
  try {
    const git = (...a: string[]) => execFileSync('git', a, { cwd: GRADER, encoding: 'utf8' }).trim();
    return { commit: git('rev-parse', '--short', 'HEAD'), 수정된파일: git('status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).length };
  } catch {
    return null;
  }
}

/** 인식 결과에서 화면에 쓸 것만 — 값은 엔진 출력 그대로 */
function 인식of(a: any) {
  const ev = fq.evaluate_pivot(a.pivot, a.graph);
  const pivots = a.pivot.ok ? (a.pivot.pivots ?? [a.pivot.pivot]) : [];
  return {
    조합: a.graph.combination,
    노드: a.graph.nodes.map((n: any) => ({ id: n.id, 색: n.color, 실체: n.entity, 표지: n.surface ?? '', ...(n.foldedFrom != null ? { foldedFrom: n.foldedFrom } : {}) })),
    급소: pivots.map((p: any) => ({ 노드: p.node.id, 색: p.node.color, 실체: p.node.entity, keyword: p.keyword ?? '', reason: p.reason })),
    급소실패: a.pivot.ok ? null : { flag: a.pivot.flag },
    평가: ev.ok
      ? ev.items.map((it: any) => ({ 급소: it.pivot.node.entity, 실체: it.substance, 정합: it.coherence, 결론: it.verdict, 대안: it.alternatives.map((x: any) => ({ rule: x.rule, from: x.from, to: x.to })) }))
      : { 판정불가: ev.flag },
  };
}

const out: any = { ok: true, 파이프라인, 엔진: 엔진버전(), 단계: {} as Record<string, unknown>, 멈춘곳: null };
const stop = (단계: string, why: unknown) => {
  out.단계[단계] = why;
  out.멈춘곳 ??= { 단계, ...(why as object) };
};

try {
  if (!문항원문 && !req.논제) throw Object.assign(new Error('문항원문이 비어 있습니다'), { name: '입력오류' });
  if (!['A', 'B', 'C'].includes(파이프라인)) throw Object.assign(new Error(`파이프라인은 A·B·C 중 하나여야 합니다 (받은 값: ${req.파이프라인})`), { name: '입력오류' });

  // C는 논제를 따로 받으면 논제로 인식한다 (조립설명서: 논제를 먼저 읽는다). 아니면 원문 전체
  const 제시문목록: { id: string; 텍스트: string }[] | null = Array.isArray(req.제시문) ? req.제시문 : typeof req.제시문 === 'string' && req.제시문.trim() ? [{ id: '제시문', 텍스트: req.제시문 }] : null;
  const 인식텍스트 = 파이프라인 === 'C' && req.논제 ? String(req.논제) : 문항원문;

  // ① 인식
  const a = fq.recognizeV2Analysis(인식텍스트);
  out.단계.인식 = { 입력: 파이프라인 === 'C' && req.논제 ? '논제' : '문항원문', 전체: 인식of(a), 단위: (a.units ?? []).map(인식of) };

  // 타입 — 1단계 겉모습 판정 (C에 제시문이 있으면 2단계 확정까지)
  let passage: any;
  if (파이프라인 === 'C' && 제시문목록) {
    try {
      // 제시문 id가 한 글자 라벨(가·나…)이면 [가] 머리를 붙여 단락 라벨로 읽히게 한다
      const 본문 = 제시문목록.map((p) => (/^[가-하]$/.test(p.id) ? `[${p.id}] ${p.텍스트}` : p.텍스트)).join('\n\n');
      passage = recognizePassage(본문, fq.markerTable());
      const 연결 = connectPassage(a, passage);
      out.단계.제시문 = {
        단락: passage.paragraphs.map((p: any) => ({ label: p.label ?? null, 텍스트: p.text, 색: p.colors })),
        전체급소: passage.pivot ? { 실체: passage.pivot.node.entity, keyword: passage.pivot.keyword ?? '' } : null,
        flag: passage.flag ?? null,
        연결,
      };
    } catch (e) {
      stop('제시문', 멈춤of(e));
    }
  }
  out.단계.타입 = 문항원문 ? fq.confirmType(문항원문, a, passage) : null;

  // ② 1차 필터 → 확인화면. 필터 유형: C=인문사회논술, A·B는 소문항 번호 구조(detectType subType 단계형)면 계단식 단계형
  if (!out.멈춘곳) {
    let 입력: any;
    if (파이프라인 === 'C') {
      if (!req.논제 || !제시문목록) {
        stop('필터', { 멈춤: '입력 부족', 종류: '입력오류', 사유: '인문사회논술 필터는 논제와 제시문을 따로 받아야 합니다 — 요청에 논제·제시문 필드가 없습니다' });
      } else {
        입력 = { 유형: '인문사회논술', 논제: String(req.논제), 제시문: 제시문목록 };
      }
    } else {
      const 단계형 = fq.detectType(문항원문).subType === '단계형';
      입력 = { 유형: 단계형 ? '계단식 단계형' : '단독문제', 텍스트: 문항원문 };
    }
    if (입력) {
      try {
        const 화면 = make_screen(입력);
        out.단계.필터 = { 유형: 입력.유형, 필터판정: 화면.필터판정, 급소: 화면.급소, 실체요약: 화면.실체요약, 선택지: 화면.선택지 };
        stop('루브릭', { 멈춤: '교사 ① 승인 대기', 종류: '승인대기', 사유: '루브릭·모범답안은 교사가 확인화면에서 ①로 승인한 문항만 생성합니다 (명세서-2 §6)' });
      } catch (e) {
        stop('필터', { 유형: 입력.유형, ...멈춤of(e) });
      }
    }
  }
  out.단계.루브릭 ??= { 멈춤: `앞 단계(${out.멈춘곳?.단계})에서 멈춤` };
  out.단계.모범답안 = { 멈춤: `앞 단계(${out.멈춘곳?.단계})에서 멈춤 — 모범답안은 루브릭과 함께 생성됩니다 (assemble.ts)` };
} catch (e: any) {
  out.ok = false;
  out.error = 멈춤of(e);
}

writeFileSync(outPath, JSON.stringify(out));
