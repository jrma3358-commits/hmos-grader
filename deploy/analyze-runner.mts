// /analyze 러너 — 엔진(hmos-grader/)을 부르기만 한다. 엔진에 없는 판단은 하지 않는다 (안 1, 오종래 2026-10-11).
// 사용: node analyze-runner.mts <요청.json> <결과.json>
//   요청: { 문항원문, 파이프라인: 'A'|'B'|'C', 논제?, 제시문?, 사족? }
//   A·B 흐름: 인식 → 1차 필터 확인화면 → [교사 ① 승인 대기]
//   C 흐름 (조립설명서 C·논술 9단계, HMOS 절대 원칙 — 엔진이 잡는다): 2단계 소문항별 인식
//     → 3·4단계 제시문 단락 급소 ↔ 논제 급소 연결·사족 (제시문이 오면) → 5단계 정교화 진단[봉인⑬]
//     → 6단계 단락 급소 관계·6유형·추가/보완[봉인⑭ 초안] (제시문이 오면). 1차 필터는 타지 않는다
//   사족: 제시문 없이 진단할 때 [{소문항, 급소}]
// 엔진이 멈추면(SealedError·급소 실패) 그 자리와 사유를 그대로 싣고 끝낸다 — 어디서 멈췄는지가 곧 다음에 채울 봉인이다.
// 루브릭·모범답안(generate_rubric)은 교사가 확인화면에서 ①로 승인한 문항만 받는다 (명세서-2 §6) — 여기서는 승인하지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const GRADER = process.env.HMOS_GRADER ?? join(import.meta.dirname, 'hmos-grader');
const load = (p: string) => import(pathToFileURL(join(GRADER, p)).href);
const fq = await load('src/fq/index.ts');
const { recognizePassage, passageLabels } = await load('src/fq/v2/passage.ts');
const { make_screen } = await load('src/filter/confirm.ts');
const { 봉인13_정교화진단 } = await load('src/filter/sealed/items.ts');
const { split_thesis } = await load('src/thesis/split.ts');
const { align_passage } = await load('src/thesis/align.ts');
const { essay_pivot_chunks } = await load('src/thesis/chunk.ts');
const { 급소단락들, 봉인14_단락관계 } = await load('src/thesis/relate.ts');

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
    노드: a.graph.nodes.map((n: any) => ({ id: n.id, 색: n.color, 실체: n.entity, 표지: n.surface ?? '', 스위치: n.switchId, ...(n.foldedFrom != null ? { foldedFrom: n.foldedFrom } : {}) })),
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

  const 제시문목록: { id: string; 텍스트: string }[] | null = Array.isArray(req.제시문) ? req.제시문 : typeof req.제시문 === 'string' && req.제시문.trim() ? [{ id: '제시문', 텍스트: req.제시문 }] : null;

  if (파이프라인 === 'C') {
    // ── C·논술 (조립설명서 C·논술 9단계) — 논제를 먼저 읽는다. 1차 필터는 타지 않는다 (2026-10-13 확정 4) ──
    const 논제글 = String(req.논제 ?? 문항원문);

    // 2단계 — 소문항마다 따로 인식. 공통 발문은 떼어 낸다 (오종래 2026-10-13)
    const 소문항 = split_thesis(논제글).map((s: any) => ({ ...s, a: fq.recognizeV2Analysis(s.텍스트) }));
    if (!소문항.length) throw Object.assign(new Error('논제가 비어 있습니다'), { name: '입력오류' });
    const 전체 = 소문항.length === 1 ? 소문항[0].a : fq.recognizeV2Analysis(논제글);
    out.단계.인식 = {
      입력: '논제',
      전체: 인식of(전체),
      단위: [],
      // 급소덩어리 — 논술 논제 급소 = Q 앞 B+C (오종래 2026-10-13). 급소(엔진 pivot)는 그대로 함께 싣는다
      소문항: 소문항.map((s: any) => ({
        번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, 참조: s.참조, ...인식of(s.a),
        급소덩어리: essay_pivot_chunks(s.a.graph).map((d: any) => ({ B: d.B.id, C: d.C.map((n: any) => n.id), Q: d.Q.map((n: any) => n.id), 실체: d.실체 })),
      })),
    };

    // 3·4단계 — 제시문 단락 급소(엔진 connectPassage) ↔ 논제 급소 연결, 사족 (HMOS 절대 원칙: 엔진이 잡는다)
    if (제시문목록) {
      try {
        // 제시문 id가 한 글자 라벨(가·나…)이면 [가] 머리를 붙여 단락 라벨로 읽히게 한다
        const 본문 = 제시문목록.map((p) => (/^[가-하]$/.test(p.id) ? `[${p.id}] ${p.텍스트}` : p.텍스트)).join('\n\n');
        const passage = recognizePassage(본문, fq.markerTable());
        const 정합 = align_passage(소문항.map((s: any) => ({ 번호: s.번호, 참조: s.참조, 인식: s.a })), passage);
        const 라벨들 = passageLabels(passage.paragraphs);
        out.단계.제시문 = {
          // 라벨 = align_passage가 연결에 쓰는 단락 이름 (기호 없는 단락은 앞 기호를 잇고, 그것도 없으면 「#순번」)
          단락: passage.paragraphs.map((p: any, i: number) => ({ label: p.label ?? null, 라벨: 라벨들[i] ?? `#${i + 1}`, 텍스트: p.text, 색: p.colors })),
          전체급소: passage.pivot ? { 실체: passage.pivot.node.entity, keyword: passage.pivot.keyword ?? '' } : null,
          flag: passage.flag ?? null,
        };
        out.단계.정합 = { 연결: 정합.연결, 사족: 정합.사족, 소문항: 정합.소문항.map((x: any) => ({ 번호: x.번호, 배경: x.연결.background, 범위밖: x.연결.outOfScope })) };
        // 6단계 — 단락 급소 관계 → 6유형 → 기존 논제와 비교 [봉인⑭ 초안, 오종래 2026-10-14]. 보완은 5단계로 넘긴다
        out.단계.관계 = { 초안: true, 급소단락: 급소단락들(정합, passage), 관계: 봉인14_단락관계(정합, passage) };
      } catch (e) {
        stop('제시문', 멈춤of(e));
      }
    }

    // 5단계 — 정교화 4갈래 진단 [봉인⑬]. ④사족은 4단계 결과, 제시문이 없으면 요청의 사족
    const 사족 = out.단계.정합?.사족 ?? (Array.isArray(req.사족) ? req.사족 : []);
    out.단계.정교화 = { 진단: 봉인13_정교화진단(소문항.map((s: any) => ({ 이름: s.번호, 인식: s.a })), 사족) };
  } else {
    // ── A·B ──
    // ① 인식
    const a = fq.recognizeV2Analysis(문항원문);
    out.단계.인식 = { 입력: '문항원문', 전체: 인식of(a), 단위: (a.units ?? []).map(인식of) };
    out.단계.타입 = fq.confirmType(문항원문, a, undefined);

    // ② 1차 필터 → 확인화면. A·B는 소문항 번호 구조(detectType subType 단계형)면 계단식 단계형
    const 단계형 = fq.detectType(문항원문).subType === '단계형';
    const 입력 = { 유형: 단계형 ? '계단식 단계형' : '단독문제', 텍스트: 문항원문 };
    try {
      const 화면 = make_screen(입력);
      out.단계.필터 = { 유형: 입력.유형, 필터판정: 화면.필터판정, 급소: 화면.급소, 실체요약: 화면.실체요약, 선택지: 화면.선택지 };
      stop('루브릭', { 멈춤: '교사 ① 승인 대기', 종류: '승인대기', 사유: '루브릭·모범답안은 교사가 확인화면에서 ①로 승인한 문항만 생성합니다 (명세서-2 §6)' });
    } catch (e) {
      stop('필터', { 유형: 입력.유형, ...멈춤of(e) });
    }
    out.단계.루브릭 ??= { 멈춤: `앞 단계(${out.멈춘곳?.단계})에서 멈춤` };
    out.단계.모범답안 = { 멈춤: `앞 단계(${out.멈춘곳?.단계})에서 멈춤 — 모범답안은 루브릭과 함께 생성됩니다 (assemble.ts)` };
  }
} catch (e: any) {
  out.ok = false;
  out.error = 멈춤of(e);
}

writeFileSync(outPath, JSON.stringify(out));
