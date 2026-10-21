// /analyze 러너 — 엔진(hmos-grader/)을 부르기만 한다. 엔진에 없는 판단은 하지 않는다 (안 1, 오종래 2026-10-11).
// 사용: node analyze-runner.mts <요청.json> <결과.json>
//   요청: { 문항원문, 파이프라인: 'A'|'B'|'C', 논제?, 제시문?, 사족?, 참조? }
//   참조: C 논제를 다시 인식할 때 원 소문항의 참조 제시문 — 자기 참조가 없는 소문항에 물려준다 (5단계 보완 재인식, 2026-10-14)
//   A·B 흐름: 인식 → 1차 필터 확인화면 → [교사 ① 승인 대기]
//   C 흐름 (조립설명서 C·논술 9단계, HMOS 절대 원칙 — 엔진이 잡는다): 2단계 소문항별 인식
//     → 3·4단계 제시문 단락 급소 ↔ 논제 급소 연결·사족 (제시문이 오면) → 5단계 정교화 진단[봉인⑬]
//     → 6단계 단락 급소 관계·6유형 뼈대·추가/보완[봉인⑭] (제시문이 오면) — 보완은 5단계 진단(갈래 「보완」)으로 넘긴다. 1차 필터는 타지 않는다
//   사족: 제시문 없이 진단할 때 [{소문항, 급소}]
//   C 대표 발문은 상황 P 블록(단계.상황)으로만 — 인식하지 않는다. 6단계 말고는 소논제마다 따로 (2026-10-15)
//   작업: '소논제' → 엔진 split_thesis 결과만 (1단계 소논제 미리보기, 2026-10-15)
// 엔진이 멈추면(SealedError·급소 실패) 그 자리와 사유를 그대로 싣고 끝낸다 — 어디서 멈췄는지가 곧 다음에 채울 봉인이다.
// 루브릭·모범답안(generate_rubric)은 교사가 확인화면에서 ①로 승인한 문항만 받는다 (명세서-2 §6) — 여기서는 승인하지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const GRADER = process.env.HMOS_GRADER ?? join(import.meta.dirname, 'hmos-grader');
const load = (p: string) => import(pathToFileURL(join(GRADER, p)).href);
const fq = await load('src/fq/index.ts');
const { recognizePassage, passageLabels, PASSAGE_REFERENCE, referenceGroup, designatedLabels } = await load('src/fq/v2/passage.ts');
const { make_screen } = await load('src/filter/confirm.ts');
const { 봉인13_정교화진단 } = await load('src/filter/sealed/items.ts');
// 봉인⑦ 이어달리기 표지 — 「(1)에서 구한」 · 「위에서 구한」이 있는 소문항만 앞 소문항을 이어받는다 (오종래 2026-10-20 확정)
const { 이어달리기 } = await load('src/filter/sealed/stepwise.ts');
// 형식 → 엔진 계열 (B-s → 수리 · B-h → 인문사회국어, 오종래 2026-10-20) — 서버와 같은 format-detect.js (러너 옆 파일)
const 형식계열 = (형식: unknown): string | null => createRequire(import.meta.url)('./format-detect.js').엔진계열(형식);
const { split_thesis } = await load('src/thesis/split.ts');
// 수리논술 C-2 인식 규칙 — 제약 C · 이어달리기 · 「각각」 조각 조합 (오종래 2026-10-19 확정)
const { math_constraints, block_constraints, relay_constraint, constraint_links, math_symbols } = await load('src/thesis/math_essay.ts');
// 논리 펼치기 표지 — 인문 채점 3축 도달 조건 ② (오종래 2026-10-19). 표지 목록은 봉인 표지사전 「논리펼치기」, 찾기는 엔진 logic_markers
const { find_logic_markers } = await load('src/fq/logic_markers.ts');
// 답구하기 · 답표현하기 표지 — 채점 4축 (오종래 2026-10-19). 표지 목록은 봉인 표지사전, 찾기는 엔진 answer_markers
const { check_math_answer, check_human_answer } = await load('src/fq/answer_markers.ts');
// 제시문 B 극성 — 논술 3단계 (오종래 2026-10-19). 표지 목록은 봉인 표지사전 「극성」, 찾기는 엔진 polarity_markers. Claude 판정 없음
const { passage_polarity } = await load('src/fq/polarity_markers.ts');
const { align_passage, background_passage, box_passages, data_calls, strip_passage_notes } = await load('src/thesis/align.ts');
// 배경 제시문 단락 실체 — 단락마다 실체 하나 = ② 세우기 조각 (오종래 2026-10-20 확정, 정의문 우선)
const { background_paragraphs } = await load('src/thesis/background.ts');
// 제시문 핵심 메시지 · 「모두 활용하여」 세우기 하한 (오종래 2026-10-20 확정)
const { passage_message, all_passages_required, contrast_cause } = await load('src/thesis/message.ts');
const { essay_pivot_chunks } = await load('src/thesis/chunk.ts');
const { passage_cores } = await load('src/thesis/passage_core.ts');
const { 봉인9_논제요구 } = await load('src/filter/sealed/thesis.ts');
const { 봉인14_6단계 } = await load('src/thesis/relate.ts');
// 8단계 루브릭 — 엔진 F1~F5·문항평가 (src/rubric). GJ는 쓰지 않는다 (오종래 2026-10-14: GJ 검산 대신 조각 충족 여부)
const { derive_pieces, f2_input_from_v2, f2_input_inherit, has_question, common_question, link_sentences, thesis_polarity, speaker_lines } = await load('src/rubric/f2.ts');
const { judge_element } = await load('src/rubric/f3.ts');
const { specify_condition } = await load('src/rubric/f4.ts');
const { allocate_points } = await load('src/rubric/f5.ts');
const { spread_piece } = await load('src/rubric/f6.ts');
const { evaluate_item } = await load('src/rubric/item_eval.ts');
// 서술형 B 교사 모범답안 — 세우기 이후 ~ 답구하기 이전 줄이 ③ 풀기 조각 (오종래 2026-10-16)
// 수리 모범답안 줄 나누기 — 「~하면」 ① · 등식 ② · 「∴」 ④ 모범 값, 풀기 없음 (오종래 2026-10-16 q5)
const { split_solve_lines, classify_math_lines } = await load('src/rubric/solve_lines.ts');
// 문항 등록창의 정답(검증) · 출제의도(루브릭 참고 표시만) · 모범답안 소문항 나누기 (오종래 2026-10-16)
const { item_portion, verify_answer, verify_answer_values, sub_item_points } = await load('src/rubric/teacher_input.ts');
// 수리 다경로 검증 — 문항의 이차방정식(원식)을 ② 세우기 줄 조각에 붙인다 (오종래 2026-10-16)
const { parse_quadratic, parse_polynomial_conditions, parse_counting_item, resolve_subject, is_science_calc } = await load('src/rubric/multipath.ts');
// 8단계 학생 답안 채점 — 엔진 G1 (봉인⑥ 조각 대조 · 봉인④-b 게이트, 계열별, 오종래 2026-10-14)
const { grade } = await load('src/rubric/g1.ts');
const { 게이트사슬, 상한비 } = await load('src/rubric/sealed/g1.ts');
const { grade_student_path } = await load('src/rubric/path_grade.ts'); // 학생 경로 채점 (오종래 2026-10-21 B · Hybrid)

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

const 파트순서 = ['근거대기', '세우기', '풀기', '답구하기'];

/**
 * 8단계 루브릭 (요청 작업: '루브릭') — 확정 논제의 소문항마다 엔진 F1 파트투영 → F2 조각역산 → F3 요소색판정 → F4 충족조건
 * → F5 배점(봉인④ 그대로) → F6 모범조각 틀 → 문항평가. assemble.ts generate_rubric과 같은 순서로 부른다.
 * generate_rubric은 1차 필터 확인화면(①) 입장권을 받는데, C는 1차 필터를 타지 않고 7단계 교사 확정이 승인이다 (2026-10-13 확정 4) —
 * 대시보드는 7단계에서 확정한 논제만 보낸다. 소문항 하나가 멈춰도 나머지는 낸다
 * 인문논술(계열 인문사회국어) ② 세우기 = 소문항 급소와 엔진이 연결한 제시문 단락(정합 연결)의 문장 수 — 3·4단계와 같은 정합을 다시 돌려 연결을 얻는다 (봉인②, 오종래 2026-10-14)
 */
/** 요청 소문항배점 → 소문항마다 배점 (dashboard2, 오종래 2026-10-21). 쓸 수 없으면 null */
function 소문항배점(값: unknown, 수: number, 총배점: number): number[] | null {
  if (!수) return null;
  if (Array.isArray(값) && 값.length === 수 && 값.every((x) => Number(x) > 0)) return 값.map(Number);
  if (값 !== '균등') return null;
  const 몫 = Math.floor((총배점 / 수) * 100) / 100;
  return Array.from({ length: 수 }, (_, i) => (i < 수 - 1 ? 몫 : Math.round((총배점 - 몫 * (수 - 1)) * 100) / 100));
}

function 루브릭작업(논제글: string, 계열: string, 총배점: number, 제시문목록: { id: string; 텍스트: string }[] | null, 공통자료 = false, 이어받기 = false, 모범답안: unknown = [], 정답: unknown = '', 핵심: unknown = '', 세우기남길: unknown = null, 서술형 = false, 수리논술형식 = false, 요청소배점: unknown = null) {
  // 서술형 B 급소 (오종래 2026-10-19 확정) — 서술 방식(C-F)은 급소 후보가 아니고 실체 명사(배경·이유 등) B가 급소다 (pivot.ts)
  const 인식 = (글: string) => fq.recognizeV2Analysis(글, { 서술형 });
  // 출제의도는 급소를 고르거나 바꾸지 않는다 — 소문항 몫을 루브릭 화면 참고 정보로만 낸다 (오종래 2026-10-16, 급소 대체 제거)
  const 소문항들 = split_thesis(논제글).map((s: any) => ({ ...s, a: 인식(s.텍스트) }));
  // 서술형 B (오종래 2026-10-14) — 제시문을 따로 받지 않는다. 소문항 공통발문의 첫 빈 줄 뒤 글(대화·자료)을 제시문으로 본다
  if (공통자료 && !제시문목록) {
    const 자료 = String(소문항들[0]?.공통발문 ?? '').split(/\r?\n\s*\r?\n/).slice(1).join('\n\n').trim();
    제시문목록 = 자료 ? [{ id: '제시문', 텍스트: 자료 }] : null;
  }
  // 화자 지정 — 「X의 방법으로」가 지목한 「X : …」 줄 (단락 급소 = 그 줄의 엔진 급소, 서지 않으면 화자 이름)
  const 자료글 = (제시문목록 ?? []).map((p) => p.텍스트).join('\n');
  const 화자of = (s: any) => (계열 === '인문사회국어' ? speaker_lines(s.텍스트, 자료글) : []).map((l: any) => {
    const p = fq.recognizeV2Analysis(l.텍스트).pivot;
    return { ...l, 단락급소: p.ok ? p.pivot.node.entity : l.라벨 };
  });
  // 인문논술 연결 문장 — 제시문이 없으면 연결도 없다(세우기 0). 정합이 멈추면 그 사유로 소문항마다 멈춘다
  let 연결of: (번호: string | null) => any[] | undefined = () => undefined;
  // 서술·논술형 ④ 경로의 제시문 부분 — 정합이 급소 노드와 이은 단락급소 (봉인②, 오종래 2026-10-14)
  let 단락연결of: (번호: string | null) => any[] = () => [];
  let 연결멈춤: unknown = null;
  if (계열 === '인문사회국어') {
    연결of = () => [];
    // 라벨 없는 단일 제시문은 배경 P — 논제 급소와 잇지 않는다 (2026-10-20). 서술형 B 공통자료(대화·자료 한 덩어리)는 그대로 잇는다
    //   대신 단락마다 실체 하나가 ② 세우기 조각 (오종래 2026-10-20 확정 — background_paragraphs, 정의문 우선)
    const 배경글 = 제시문목록 && !공통자료 ? background_passage(제시문목록) : null;
    if (배경글) {
      연결of = (번호) => {
        const s = 소문항들.find((x: any) => x.번호 === 번호);
        return background_paragraphs(배경글, s ? s.a.graph.nodes.map((n: any) => String(n.entity)) : []).map((p: any) => ({ 단락: p.라벨, 단락급소: p.실체, 문장: p.문장, 배경: true }));
      };
    } else if (제시문목록) {
      try {
        const 본문 = 제시문목록.map((p) => (/^(?:[가-하ㄱ-ㅎ]|I{1,3}|IV|VI{0,3}|IX|X)$/.test(p.id) ? `[${p.id}] ${p.텍스트}` : p.텍스트)).join('\n\n');
        const passage = recognizePassage(본문, fq.markerTable());
        // 「[자료 N]」 호출(오종래 2026-10-20)은 공통 발문(문항 발문 줄)에도 있다
        const 정합 = align_passage(소문항들.map((s: any) => ({ 번호: s.번호, 참조: s.참조, 인식: s.a, 호출글: [s.공통발문, s.텍스트].filter(Boolean).join('\n') })), passage);
        const 라벨들 = passageLabels(passage.paragraphs);
        const 단락들 = passage.paragraphs.map((p: any, i: number) => ({ 라벨: 라벨들[i] ?? `#${i + 1}`, 텍스트: p.text }));
        // 논제 요구와 맞는 문장만 — 소문항이 긍정·부정 한쪽을 지정하면 역접 뒤(앞) 반대쪽 문장을 뺀다 (오종래 2026-10-14)
        const 극성of = (번호: string | null) => thesis_polarity(소문항들.find((s: any) => s.번호 === 번호)?.텍스트 ?? '');
        // 지정 연결(자리 「지정」, 단락 급소 없음) — 화자 지정(10-14)과 같은 방식으로 실체를 세운다 (오종래 2026-10-15 1·2번 (a)):
        //   그 단락 자체 급소(엔진 analyze_pivot, 논제 열쇠 없이)가 서면 그것, 서지 않으면 단락 기호 「[나]」.
        //   그 실체로 ② 세우기 문장·① 제시문 조각·④ 경로에 단락 급소 연결과 똑같이 들어간다
        const 자체급소 = new Map<string, string>();
        passage.paragraphs.forEach((p: any, i: number) => {
          const 라벨 = 라벨들[i] ?? `#${i + 1}`;
          if (자체급소.has(라벨)) return;
          const pv = fq.analyze_pivot(p.graph, fq.markerTable());
          if (pv.ok) 자체급소.set(라벨, pv.pivot.node.entity.trim());
        });
        const 지정실체 = (라벨: string) => 자체급소.get(라벨) ?? `[${라벨}]`;
        const 급소단락of = (번호: string | null) => 정합.연결.filter((x: any) => x.소문항 === 번호)
          .map((x: any) => ({ ...x, 단락: x.단락.map((d: any) => (d.자리 === '지정' ? { ...d, 단락급소: 지정실체(d.단락) } : d)) }));
        // 병렬 자료 표(자리 「자료」, 오종래 2026-10-20 확정) — 논제가 부른 표는 표 전체가 세우기 문장 하나 (실체 = 표 제목). 세우기 필터가 거르지 않는다(보장)
        연결of = (번호) => {
          const 단락 = 급소단락of(번호).flatMap((x: any) => x.단락);
          const 자료 = [...new Map(단락.filter((d: any) => d.자리 === '자료').map((d: any) => [d.단락, d])).values()] as any[];
          return [
            ...자료.map((d) => ({ 단락: d.단락, 단락급소: d.단락급소, 문장: passage.paragraphs[d.문단].text.trim(), 보장: true })),
            ...link_sentences(단락들, 단락.filter((d: any) => d.자리 !== '자료'), 극성of(번호)),
          ];
        };
        // 「모두 활용하여」 (오종래 2026-10-20 확정) — 제시문마다 세우기 조각 최소 하나 = 그 제시문의 핵심 메시지 문장(message.ts).
        //   근거.보장 — 서버 세우기 필터가 거르지 않고, 거를 때 제시문 수를 하한으로 둔다
        const 기본연결of = 연결of;
        연결of = (번호) => {
          const 연결 = 기본연결of(번호) ?? [];
          const s = 소문항들.find((x: any) => x.번호 === 번호);
          if (!s || !all_passages_required(s.텍스트)) return 연결;
          const 대상 = s.참조.length ? 제시문목록.filter((p) => s.참조.includes(p.id)) : 제시문목록;
          const 보장 = 대상.flatMap((p) => { const m = passage_message(p.텍스트); return m ? [{ 단락: p.id, 단락급소: m.실체, 문장: m.문장, 보장: true }] : []; });
          const 보장문장 = new Set(보장.map((x) => x.문장));
          return [...보장, ...연결.filter((x: any) => !보장문장.has(x.문장))];
        };
        단락연결of = (번호) => 급소단락of(번호).flatMap((x: any) => x.단락.map((d: any) => ({ 노드: x.노드, 단락: d.단락, 단락급소: d.단락급소 })));
      } catch (e) {
        연결멈춤 = 멈춤of(e);
      }
    }
  }
  // 단계형 이어받기 (서술형 B, 오종래 2026-10-14) — (n)은 (n-1)의 급소 K를 ① 「앞 결과」 조각으로 받는다. 2026-10-20부터 계단식 소문항만 (봉인⑦)
  const 급소들of = (s: any) => (s.a.pivot.ok ? (s.a.pivot.pivots ?? [s.a.pivot.pivot]).map((p: any) => ({ 번호: s.번호, 실체: p.node.entity })) : []);
  // 소문항 배점 — 소문항 글에 「[N점]」이 있으면 그 값, 없으면 요청 총배점 (2026-10-14)
  //   [오종래 2026-10-15 ③] 괄호 안 「N점」도 — 「(200자 내외, 4점)」. 여럿이면 마지막 것 (앞에 붙은 공통 발문의 「(16점)」이 아니라)
  //   [오종래 2026-10-16 q4] 자기 「[N점]」이 없고 공통 발문에 「[총 N점]」이 있으면 소문항마다 N (나누기는 취소)
  //   [오종래 2026-10-21] 채점 대시보드(dashboard2)는 소문항배점을 함께 보낸다 — 수 배열이면 소문항 차례대로 그 값, 「균등」이면 총배점 ÷ 소문항 수
  //   (0.01 단위, 나머지는 끝 소문항에 — 합이 총배점). 없으면 위 규칙 그대로 (문항 분석 /dashboard는 안 보낸다)
  const 소배점들 = 소문항배점(요청소배점, 소문항들.length, 총배점) ?? sub_item_points(소문항들, 총배점);
  return 소문항들.map((s: any, n: number) => {
    const 소배점 = 소배점들[n];
    const 답안글 = item_portion(모범답안, s.번호, n, true);
    const 의도 = item_portion(핵심, s.번호, n).trim();
    // 텍스트 = 학생이 보는 소문항 글 — 엔진이 인식에서 뗀 조건 블록·이어받기 표지까지 (모범답안·채점 프롬프트가 조건을 봐야 한다, 2026-10-20). 인식은 s.a 그대로
    const 소 = { 번호: s.번호, 텍스트: s.원문 ?? s.텍스트, 공통발문: s.공통발문, 배점: 소배점, ...(의도 ? { 출제의도: 의도 } : {}) };
    if (연결멈춤) return { ...소, 멈춤: 연결멈춤 };
    try {
      // [오종래 2026-10-16 q4 ①] 소문항 글에 물음이 없으면 공통 발문 급소를 물려받는다 (급소와 그 물음만 — ①② 노드는 소문항 자기 것)
      const 물려받을물음 = !has_question(s.a) ? common_question(s.공통발문) : '';
      const 입력 = 물려받을물음 ? f2_input_inherit(s.a, 인식(물려받을물음)) : f2_input_from_v2(s.a);
      if (!입력.ok) return { ...소, 멈춤: { 멈춤: 입력.flag, 종류: '급소', 사유: `급소가 서지 않아 조각을 뽑지 못했습니다 (${입력.flag})` } };
      const { 물음, k } = 입력;
      let 연결문장 = 연결of(s.번호);
      let 단락연결 = 단락연결of(s.번호);
      const 화자 = 화자of(s);
      if (화자.length) {
        // 화자 지정 줄도 연결 단락 — 세우기 문장 · ① 제시문 단락 급소 · ④ 경로에 같이 쓴다 (급소 K마다)
        const K노드 = s.a.pivot.ok ? (s.a.pivot.pivots ?? [s.a.pivot.pivot]).map((p: any) => p.node.id) : [];
        연결문장 = [...(연결문장 ?? []), ...link_sentences(화자.map((l: any) => ({ 라벨: l.라벨, 텍스트: l.텍스트 })), 화자.map((l: any) => ({ 단락: l.라벨, 단락급소: l.단락급소 })), thesis_polarity(s.텍스트))];
        단락연결 = [...단락연결, ...화자.flatMap((l: any) => K노드.map((id: string) => ({ 노드: id, 단락: l.라벨, 단락급소: l.단락급소 })))];
      }
      // 세우기 필터 (오종래 2026-10-19) — 서버가 filterSeuwogi로 고른 문장만 ② 세우기로 남긴다. F5 배점 전에 걸러 배점이 남은 조각에 나뉜다
      const 남길 = Array.isArray(세우기남길) ? 세우기남길[n] : null;
      if (연결문장 && Array.isArray(남길)) 연결문장 = 연결문장.filter((x: any) => 남길.includes(x.문장));
      // [봉인⑦ 오종래 2026-10-20 확정] 계단식(이어달리기 표지 있음)만 앞 결과를 잇는다 — 표지가 없으면 병렬 독립. 표지가 번호를 가리키면 그 소문항
      const 표지 = n > 0 ? (이어달리기(s.원문 ?? s.텍스트) ?? (s.이어받기 ? { 번호: s.이어받기.번호 } : null)) : null;
      const 앞소문항 = 표지 ? (소문항들.find((x: any, i: number) => i < n && 표지.번호 && x.번호 === 표지.번호) ?? 소문항들[n - 1]) : null;
      const 앞급소 = 이어받기 && 앞소문항 ? 급소들of(앞소문항) : [];
      // 원식 — 소문항 글(없으면 공통 발문)의 수 계수 이차방정식. 수리만 (2026-10-16 다경로)
      const 원식 = 계열 === '수리' ? (parse_quadratic(소.텍스트) ?? parse_quadratic(String(s.공통발문 ?? ''))) : null;
      // 다항식 · 나머지 조건 (「다항식 …를 x-2로 나누었을 때 나머지가 1」) — 수 계수 이차방정식이 없는 수리 문항 (2026-10-16 q7)
      const 문항글 = [s.공통발문, 소.텍스트].filter(Boolean).join('\n');
      const 다항식 = 계열 === '수리' && !원식 ? parse_polynomial_conditions(문항글) : null;
      // 경우의 수 문항 (「a,a,b,c,d,e … 경우의 수」) — 모범답안 줄 조각으로 채점 (2026-10-17 q3 안 A)
      const 경우의수 = 계열 === '수리' && !원식 && !다항식 ? parse_counting_item(문항글) : null;
      // 조각인식 — 이름 「인식」은 위 인식 함수(물려받을물음)와 겹쳐 ReferenceError가 났다 (오종래 2026-10-20 수정)
      const 조각인식 = { ...입력.인식, ...(연결문장 ? { 연결문장, 단락연결 } : {}), ...(앞급소.length ? { 앞급소 } : {}), ...(원식 ? { 원식 } : {}), ...(다항식 ? { 다항식 } : {}), ...(경우의수 ? { 경우의수 } : {}) };
      // 계열이 ④ 답구하기를 가른다 — 인문사회국어 = 급소 K마다 경로 추적, 수리 = Q 대상 값 일치
      let 뼈대 = derive_pieces(물음, k, 조각인식, 계열).map((c: any) => ({ ...c, 요소: judge_element(c, 계열) }));
      // 서술형 B — 교사 모범답안(소문항 순서)에서 엔진 ② 세우기 실체 줄 뒤 ~ ④ 급소 K 줄 앞을 줄마다 풀기 조각으로 (오종래 2026-10-16)
      //   수리 계열도 같다 (같은 날 확대 — 줄이 있으면 봉인2_풀기가 세우기 1:1 대신 줄 조각을 낸다)
      //   [오종래 2026-10-16 q5] 수리는 줄 나누기 규칙으로 바뀜 — 「~하면」 줄 ① · 등식 줄 ② · 「∴」 줄 ④ 모범 값 · 풀기 없음 (세우기=풀기)
      // 문항 글을 넘긴다 — 「∴」 말고도 문항 문자로 시작해 수로 끝나는 줄을 답 값에 (답이 둘인 문항, q7)
      // 수리논술 C-2a·C-2b는 세우기(첫 식) → 풀기(이후 전개) → 답구하기(끝 값 줄)로 가른다 (오종래 2026-10-20 확정 안 A)
      const 수리줄 = 계열 === '수리' && 답안글.trim() ? classify_math_lines(답안글, 문항글, 수리논술형식) : null;
      if (수리줄) 뼈대 = derive_pieces(물음, k, { ...조각인식, 교사줄: 수리줄 }, 계열).map((c: any) => ({ ...c, 요소: judge_element(c, 계열) }));
      const 풀기구간 = 답안글.trim() && !수리줄 ? split_solve_lines(답안글, 뼈대) : null;
      if (풀기구간 && 풀기구간.풀기.length) {
        뼈대 = derive_pieces(물음, k, { ...조각인식, 교사풀기: 풀기구간.풀기 }, 계열).map((c: any) => ({ ...c, 요소: judge_element(c, 계열) }));
      }
      const 배점 = allocate_points(뼈대, 소배점, 계열);
      const 조각 = 배점.조각들.map((c: any) => ({
        id: c.id, 파트: c.파트, 요소: c.요소, 수행질: c.수행질, is_중심: c.is_중심, 확인물음: c.확인물음,
        // ④ 경로가 있으면 실체 = 경로의 K (엔진 급소 핵심어)
        실체: c.경로 ? c.경로[c.경로.length - 1].실체 : c.node ? c.node.entity : c.근거 ? c.근거.단락급소 : c.제시문 ? c.제시문.단락급소 : c.앞결과 ? c.앞결과.실체 : c.줄글 ? c.줄글 : null,
        노드: c.node ? c.node.id : null, 근거: c.근거 ?? null, 경로: c.경로 ?? null, 제시문: c.제시문 ?? null, 앞결과: c.앞결과 ?? null, 풀기글: c.풀기글 ?? null, 줄글: c.줄글 ?? null, 모범답: c.모범답 ?? null, 원식: c.원식 ?? null, 판별식원식: c.판별식원식 ?? null, 방정식원식: c.방정식원식 ?? null, 나머지조건: c.나머지조건 ?? null, 정의다항식: c.정의다항식 ?? null, 나머지다항식: c.나머지다항식 ?? null, 경우의수: c.경우의수 ?? null, 배점: c.배점,
        충족조건: specify_condition(c, 계열), 모범조각틀: spread_piece(c, k, 계열),
      }));
      조각.sort((a: any, b: any) => 파트순서.indexOf(a.파트) - 파트순서.indexOf(b.파트));
      // 정답 검증 — 채점 기준이 아니다. 모범답안 답구하기 줄과 대조해 어긋나면 교사 확인 (오종래 2026-10-16)
      const 정답몫 = item_portion(정답, s.번호, n);
      return {
        ...소,
        급소: { 실체: k.실체, 노드: k.node.id, ...(물려받을물음 ? { 물려받음: '공통 발문' } : {}) },
        급소수: 입력.인식.급소들.length,
        // 5색 인식 — 모범답안이 없을 때 Claude가 이 인식·조각으로 모범답안을 쓴다 (오종래 2026-10-16)
        인식: { 조합: s.a.graph.combination, 노드: s.a.graph.nodes.map((x: any) => ({ 색: x.color, 실체: x.entity })) },
        ...(답안글.trim() ? { 모범답안글: 답안글 } : {}),
        ...(정답몫.trim() ? { 정답검증: (수리줄 ? verify_answer_values(정답몫, 수리줄.답) : null) ?? verify_answer(정답몫, 답안글, 뼈대) } : {}),
        물음,
        ...(풀기구간 ? { 풀기구간 } : {}),
        ...(수리줄 ? { 줄나누기: 수리줄 } : {}),
        ...(연결문장 ? { 연결단락: [...new Set(연결문장.map((x: any) => x.단락))] } : {}),
        조각,
        // 부분채점기준은 문항 분석에서 뽑지 않는다 — 부분점수는 학생 답안 채점(작업 '채점')에서만 (오종래 2026-10-14)
        문항평가: evaluate_item(뼈대, 배점.미배정),
      };
    } catch (e) {
      return { ...소, 멈춤: 멈춤of(e) };
    }
  });
}
const stop = (단계: string, why: unknown) => {
  out.단계[단계] = why;
  out.멈춘곳 ??= { 단계, ...(why as object) };
};

try {
  if (!문항원문 && !req.논제) throw Object.assign(new Error('문항원문이 비어 있습니다'), { name: '입력오류' });
  if (!['A', 'B', 'C'].includes(파이프라인)) throw Object.assign(new Error(`파이프라인은 A·B·C 중 하나여야 합니다 (받은 값: ${req.파이프라인})`), { name: '입력오류' });

  const 받은글: { id: string; 텍스트: string }[] | null = Array.isArray(req.제시문) ? req.제시문 : typeof req.제시문 === 'string' && req.제시문.trim() ? [{ id: '제시문', 텍스트: req.제시문 }] : null;
  // 각주 「※」 줄 · 〈주의사항〉 줄은 제시문 분석에서 뺀다 (오종래 2026-10-20 확정, align.ts strip_passage_notes)
  const 받은제시문 = 받은글 ? 받은글.map((p) => ({ ...p, 텍스트: strip_passage_notes(String(p.텍스트 ?? '')) })).filter((p) => p.텍스트) : null;
  // 〈보기〉 별도 배경 블록 (오종래 2026-10-20 확정) — id 「보기」는 제시문 정합·수렴·관계·루브릭 연결에서 빼고 C 2단계 상황 P로 싣는다 (align.ts box_passages)
  const 나눈제시문 = 받은제시문 ? box_passages(받은제시문) : { 보기: [], 제시문: [] };
  const 보기목록 = 나눈제시문.보기;
  const 제시문목록: { id: string; 텍스트: string }[] | null = 나눈제시문.제시문.length ? 나눈제시문.제시문 : null;

  if (req.작업 === '채점') {
    // ── 8단계 학생 답안 채점 ── 루브릭(러너 루브릭 작업 출력의 조각)을 엔진 조각으로 되살려 G1에 넣는다. Claude는 쓰지 않는다
    // 수학 문항은 수리로만 — 인문사회국어로 들어오면 계열오류 (오종래 2026-10-16). 논제 = 공통 발문 + 소문항 글 (서버가 잇는다)
    const 계열 = resolve_subject(req.계열, String(req.논제 ?? ''));
    const 학생답 = String(req.학생답 ?? '');
    if (!학생답.trim()) throw Object.assign(new Error('학생 답안이 비어 있습니다'), { name: '입력오류' });
    const 노드of = (id: string | null, 실체: string | null) => (id ? { id, entity: 실체 ?? '', color: null, surface: '', switchId: '', index: 0 } : null);
    const 조각들 = (Array.isArray(req.조각) ? req.조각 : []).map((c: any) => ({
      id: c.id, 파트: c.파트, 요소: c.요소 ?? null, 수행질: c.수행질 ?? null, 확인물음: c.확인물음 ?? '', 충족조건: c.충족조건 ?? '',
      is_중심: !!c.is_중심, 배점: Number(c.배점) || 0, 모범조각: '',
      node: 노드of(c.노드 ?? null, c.실체 ?? null),
      ...(c.근거 ? { 근거: c.근거 } : {}), ...(c.경로 ? { 경로: c.경로 } : {}), ...(c.제시문 ? { 제시문: c.제시문 } : {}),
      ...(c.풀기글 ? { 풀기글: c.풀기글 } : {}),
      ...(c.줄글 ? { 줄글: c.줄글 } : {}), ...(c.모범답 ? { 모범답: c.모범답 } : {}), // 수리 줄 조각 · ④ 모범 값 (2026-10-16 q5)
      ...(c.원식 ? { 원식: c.원식 } : {}), // ② 세우기 다경로 검증의 원식 (2026-10-16)
      ...(c.판별식원식 ? { 판별식원식: c.판별식원식 } : {}), // ② 판별식 줄의 문자 계수 원식 (2026-10-16 q4 학생 2)
      ...(c.방정식원식 ? { 방정식원식: c.방정식원식 } : {}), // ② 방정식 줄의 문자 계수 원식 (2026-10-16 q4 학생 2)
      ...(c.나머지조건 ? { 나머지조건: c.나머지조건 } : {}), ...(c.정의다항식 ? { 정의다항식: c.정의다항식 } : {}), ...(c.나머지다항식 ? { 나머지다항식: c.나머지다항식 } : {}), // q7 나머지 정리
      ...(c.경우의수 ? { 경우의수: c.경우의수 } : {}), // q3 경우의 수 — ① ÷n! · ② 줄의 식 검증 (2026-10-17)
      ...(c.앞결과 ? { 앞결과: c.앞결과 } : {}), // 단계형 앞 결과 조각 — 빠지면 실체가 없어 판정불가가 된다 (2026-10-14)
    }));
    if (!조각들.length) throw Object.assign(new Error('루브릭 조각이 없습니다'), { name: '입력오류' });
    const 급소 = { 실체: String(req.급소?.실체 ?? ''), node: 노드of(req.급소?.노드 ?? 'k', req.급소?.실체 ?? '') };
    // 앞 소문항들의 학생 답 — ② 방정식 세우기를 이 답에서 못 찾으면 앞 답에서 본다 (2026-10-16)
    const r = grade(학생답, 조각들, '', 급소, 계열, String(req.앞학생답 ?? ''));
    out.단계.채점 = {
      계열,
      조각별: Object.values(r.파트별).flatMap((p: any) => p.조각별),
      파트별: Object.fromEntries(Object.entries(r.파트별).map(([p, v]: [string, any]) => [p, { 배점합: v.배점합, 파트점수: v.파트점수, 상한: v.상한 }])),
      부분점수: r.부분점수, 만점: r.만점, 무너진지점: r.무너진지점, 약점: r.약점, 판정불가: r.판정불가,
      학생풀기: r.학생풀기, // 수리 — 학생 답에서 엔진이 잡은 풀기 마디 (2026-10-16 학생 1)
      경고: r.경고, // 답은 맞으나 세우기 과정 검증 실패 등 — 점수는 그대로, 교사 확인 표시 (2026-10-16 q4 학생 3)
      // 교사가 O/X를 고치면 대시보드가 이 사슬·비율로 다시 센다 (엔진 값 그대로)
      게이트: { 사슬: 게이트사슬(계열, r.풀기있음), 상한비 }, // 풀기(루브릭 조각 · 학생 풀기 마디) 없으면 ④X→② (2026-10-16)
    };
    // 학생 경로 채점 (오종래 2026-10-21 확정 B) — 서버가 Claude로 나눈 학생 단계(단계들)를 보내면 엔진이 단계마다 계산 · 같은 단계 값 · 최종값 정답을 대조한다.
    //   계산식 없는 단계는 위 엔진 조각 판정을 쓴다. 정답 = 이 소문항 몫 (「(1) 360가지 (2) 72가지」 → 번호로)
    //   [오종래 2026-10-21 확정 — Claude는 조각 분리만, O/X 판단은 엔진] 단계들(Claude)은 글 · 파트 · 대응 · 다경로뿐 — O/X는 grade_student_path가 정한다
    if (Array.isArray(req.단계들)) {
      out.단계.경로채점 = grade_student_path(req.단계들, req.조각 ?? [], out.단계.채점.조각별, item_portion(req.정답 ?? '', req.번호 ?? null, 0) || null);
    }
  } else if (req.작업 === '정답검증') {
    // ── C 9단계 정답 검증 (오종래 2026-10-16) ── 정답은 채점 기준이 아니라 검증. 모범답안(한 문단)을 문장으로 나눠
    //   답 문장(급소 핵심어가 마지막으로 나온 문장)과 정답을 대조한다. 조각은 루브릭 작업 출력 그대로 받아 엔진 조각으로 되살린다
    const 노드of = (실체: string | null) => (실체 ? { id: 'n', entity: 실체, color: null, surface: '', switchId: '', index: 0 } : null);
    const 조각들 = (Array.isArray(req.조각) ? req.조각 : []).map((c: any) => ({
      id: c.id, 파트: c.파트, 요소: c.요소 ?? null, 수행질: null, 확인물음: '', is_중심: false,
      node: c.노드 ? 노드of(c.실체 ?? null) : null, ...(c.근거 ? { 근거: c.근거 } : {}), ...(c.경로 ? { 경로: c.경로 } : {}),
    }));
    out.단계.정답검증 = verify_answer(item_portion(req.정답 ?? '', req.번호 ?? null, 0), String(req.모범답안 ?? ''), 조각들, req.단위 === '줄' ? '줄' : '문장');
  } else if (req.작업 === '논리표지') {
    // ── 인문 채점 3축 논리 펼치기 도달 조건 ② (오종래 2026-10-19, hmos-spec/논리펼치기_명세서.md) ── 봉인 표지사전 「논리펼치기」로 학생 답의 표지를 찾기만 한다
    const 봉인 = JSON.parse(readFileSync(fq.sealedPath(), 'utf8'));
    if (!봉인.논리펼치기 || typeof 봉인.논리펼치기 !== 'object') throw Object.assign(new Error('봉인 표지사전에 「논리펼치기」가 없습니다'), { name: 'SealedError' });
    out.단계.논리표지 = find_logic_markers(String(req.학생답 ?? ''), 봉인.논리펼치기);
  } else if (req.작업 === '답표지') {
    // ── 채점 4축 답구하기(수리) · 답표현하기(인문) — 엔진이 셀 수 있는 조건만 (오종래 2026-10-19, hmos-spec/답구하기_답표현하기_명세서.md) ──
    //   수리: ② 단위 · ③ 형식 / 인문: ① 서술 형식 표지 · ② 분량 · ④ 완결. 표지 목록은 봉인 표지사전 「답구하기」·「답표현하기」
    const 봉인 = JSON.parse(readFileSync(fq.sealedPath(), 'utf8'));
    const 수리 = req.계열 === '수리';
    const 칸 = 수리 ? 봉인.답구하기 : 봉인.답표현하기;
    if (!칸 || typeof 칸 !== 'object') throw Object.assign(new Error(`봉인 표지사전에 「${수리 ? '답구하기' : '답표현하기'}」가 없습니다`), { name: 'SealedError' });
    const 학생답 = String(req.학생답 ?? ''), 문항 = String(req.문항 ?? '');
    out.단계.답표지 = 수리
      ? { 축: '답구하기', ...check_math_answer(학생답, 문항, String(req.모범답안 ?? ''), 칸) }
      : { 축: '답표현하기', ...check_human_answer(학생답, 문항, 칸) };
  } else if (req.작업 === '소논제') {
    // ── 1단계 소논제 미리보기 (오종래 2026-10-15 안 a) ── 엔진 split_thesis로 나누기만 한다. 인식은 2단계에서
    out.단계.소논제 = split_thesis(String(req.논제 ?? 문항원문)).map((s: any) => ({ 번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, 참조: s.참조 }));
  } else if (req.작업 === '루브릭') {
    // ── 8단계 루브릭만 ── 인식·제시문·정교화는 다시 돌리지 않는다
    // 서술 방향 제외 급소 — 서술형 B(req.서술형) · 인문논술 C-1a(req.형식, 2026-10-20)는 2단계 인식과 같은 규칙으로
    // 수학 문항은 수리로만 (오종래 2026-10-16) — 「자동」이면 엔진이 고르고, 인문사회국어로 수학 문항이 오면 계열오류
    // 물리·과학 계산 문항(답에 단위 + 「F=…」 꼴 식, 오종래 2026-10-20)도 수리 — 모범답안을 함께 본다
    const 답안모두 = (Array.isArray(req.모범답안) ? req.모범답안 : [req.모범답안 ?? '']).map((x: unknown) => String(x ?? '')).join('\n');
    const 계열 = resolve_subject(req.계열, String(req.논제 ?? 문항원문), 답안모두);
    const 총배점 = Number(req.총배점) > 0 ? Number(req.총배점) : 10;
    out.단계.루브릭 = { 계열, 총배점, 소문항: 루브릭작업(String(req.논제 ?? 문항원문), 계열, 총배점, 제시문목록, !!req.공통자료, !!req.이어받기, req.모범답안 ?? [], req.정답 ?? '', req.핵심 ?? '', req.세우기남길 ?? null, !!req.서술형 || String(req.형식 ?? '') === 'C-1a',
      // 세우기 → 풀기 → 답구하기 줄 가르기 — 수리논술 C-2 · 물리·과학 계산 문항 (오종래 2026-10-20 확정)
      /^C-2/.test(String(req.형식 ?? '')) || (계열 === '수리' && is_science_calc(String(req.논제 ?? 문항원문), 답안모두)), req.소문항배점 ?? null) };
  } else if (파이프라인 === 'C') {
    // ── C·논술 (조립설명서 C·논술 9단계) — 논제를 먼저 읽는다. 1차 필터는 타지 않는다 (2026-10-13 확정 4) ──
    const 논제글 = String(req.논제 ?? 문항원문);

    // 2단계 — 소문항마다 따로 인식. 공통 발문은 떼어 낸다 (오종래 2026-10-13)
    const 물려줄참조: string[] = Array.isArray(req.참조) ? req.참조.map(String) : [];
    // 인문논술 C-1a 서술 방향 제외 (오종래 2026-10-20 확정) — 서술형 B와 같은 급소 규칙: 서술 방향(C-F)은 급소 후보가 아니고 실체 명사 B(「그 이유」)가 급소 (pivot.ts)
    const 서술방향제외 = String(req.형식 ?? '') === 'C-1a';
    const 소문항 = split_thesis(논제글).map((s: any) => ({ ...s, ...(!s.참조.length && 물려줄참조.length ? { 참조: 물려줄참조 } : {}), a: fq.recognizeV2Analysis(s.텍스트, { 서술형: 서술방향제외 }) }));
    if (!소문항.length) throw Object.assign(new Error('논제가 비어 있습니다'), { name: '입력오류' });
    // 상황 P (오종래 2026-10-15 ①(a)) — 대표 발문(공통 발문, 「(가)~(바)의 내용을 바탕으로 물음에 답하시오」)은 인식하지 않고
    //   P 블록 하나로 둔다. 소논제 그래프에는 붙이지 않는다 — 참조 범위만 소논제에 물려준다(split_thesis). 논제 전체 인식(옛 인식.전체)은 내지 않는다
    const 발문들 = [...new Set(소문항.map((s: any) => s.공통발문).filter(Boolean))] as string[];
    out.단계.상황 = 발문들.map((t) => {
      const last = [...t.matchAll(PASSAGE_REFERENCE)].at(-1);
      return { 색: 'P', 실체: t, 참조: last ? designatedLabels(referenceGroup(last)) : [], 소논제: 소문항.filter((s: any) => s.공통발문 === t).map((s: any) => s.번호) };
    });
    out.단계.인식 = {
      입력: '논제',
      단위: [],
      // 급소덩어리 — 논술 논제 급소 = Q 앞 B+C (오종래 2026-10-13). 급소(엔진 pivot)는 그대로 함께 싣는다
      소문항: 소문항.map((s: any) => ({
        번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, 참조: s.참조, 분량배점: s.분량배점 || '',
        ...(s.조건 ? { 조건: s.조건 } : {}), ...(s.이어받기 ? { 이어받기: s.이어받기 } : {}), ...(s.원문 ? { 원문: s.원문 } : {}), ...(s.문항 ? { 문항: s.문항 } : {}), ...인식of(s.a),
        급소덩어리: essay_pivot_chunks(s.a.graph, s.a.pivot).map((d: any) => ({ B: d.B.id, C: d.C.map((n: any) => n.id), Q: d.Q.map((n: any) => n.id), 실체: d.실체 })),
      })),
    };

    // 수리논술 C-2 [오종래 2026-10-19 확정] — 라벨 없는 글(공통 발문의 설정 · 제시문 [I] · 조건 (가))은 제약 C로 먼저 읽고 소문항에 얹는다.
    //   이어달리기: 앞 소문항 급소 B가 다음 소문항 제약 C로 (같은 공통 발문 안, 소문항 창 하나면 요청의 앞소문항). 제약 연결 = 함수 꼴이 노드에 나오는가
    const 수리논술 = /^C-2/.test(String(req.형식 ?? ''));
    if (수리논술) {
      const B들 = (u: any) => ((u.급소덩어리 && u.급소덩어리.length ? u.급소덩어리 : u.급소) ?? []).map((d: any) => String(d.실체).trim().replace(/^[\s,]+/, '')).filter(Boolean);
      const 앞꼴 = (x: any) => (x && typeof x === 'object' && Array.isArray(x.급소) ? { 번호: String(x.번호 ?? ''), B: x.급소.map(String) } : null);
      const 요청앞 = 앞꼴(req.앞소문항);
      // 소논제 이어달리기 [오종래 2026-10-21 확정] — 화면이 앞 소논제의 B 노드 실체 전부 · 연결 제시문을 함께 보내면,
      //   B 노드는 수학 기호가 있는 것(h(x)·lim …)만 제약 C(이어받기)로 얹고, 연결 제시문은 이어받은 연결로 싣는다 (요청 앞소문항일 때만)
      const 요청앞B노드 = Array.isArray(req.앞소문항?.B노드) ? [...new Set(req.앞소문항.B노드.map((t: unknown) => String(t).trim().replace(/^[\s,]+/, '')).filter((t: string) => t && math_symbols(t).length))] as string[] : [];
      const 요청앞제시문 = Array.isArray(req.앞소문항?.제시문) ? req.앞소문항.제시문.filter((x: any) => x && typeof x.출처 === 'string').map((x: any) => ({ 출처: x.출처, 말: String(x.말 ?? ''), 앞번호: 요청앞?.번호 ?? '' })) : [];
      // 소문항 창이면 앞 창들 결과 — 이어받기 표지가 가리킨 번호를 여기서 찾는다 (오종래 2026-10-20)
      const 요청앞들 = (Array.isArray(req.앞소문항들) ? req.앞소문항들.map(앞꼴) : []).filter(Boolean);
      out.단계.인식.소문항.forEach((u: any, i: number) => {
        const 앞u = i > 0 && 소문항[i - 1].공통발문 === 소문항[i].공통발문 ? out.단계.인식.소문항[i - 1] : null;
        let 앞 = 앞u ? { 번호: 앞u.번호, B: B들(앞u) } : i === 0 ? 요청앞 : null;
        // 이어달리기 참조 표지 (오종래 2026-10-20 규칙 2) — 「[N-M]에서 구한」은 그 번호 소문항, 「앞 문항에서 구한」은 바로 앞 소문항
        if (u.이어받기) {
          const 번호 = u.이어받기.번호;
          if (번호 === null) 앞 = i > 0 ? { 번호: out.단계.인식.소문항[i - 1].번호, B: B들(out.단계.인식.소문항[i - 1]) } : 요청앞;
          else {
            const 같은요청 = out.단계.인식.소문항.slice(0, i).find((x: any) => x.번호 === 번호);
            앞 = 같은요청 ? { 번호, B: B들(같은요청) } : (요청앞들.find((x: any) => x.번호 === 번호) ?? (요청앞 && 요청앞.번호 === 번호 ? 요청앞 : null));
          }
        }
        // 제시문 [I]은 참조가 있으면 그 범위만, 설정·조건은 문제 설정이라 늘 얹는다. 소문항 조건 블록은 그 소문항에만 (2026-10-20)
        const 공통 = math_constraints(u.공통발문 ?? '', 제시문목록 ?? []).filter((c: any) => c.종류 !== '제시문' || !u.참조.length || u.참조.includes(c.출처));
        const 자기조건 = block_constraints(u.조건 ?? [], u.공통발문 ?? '');
        const 앞B노드 = 앞 && 앞 === 요청앞 ? 요청앞B노드.filter((b) => !앞.B.includes(b)) : [];
        u.제약 = [...공통, ...자기조건, ...(앞 ? relay_constraint(앞.번호, 앞.B, u.이어받기?.대상 ?? '') : []), ...(앞B노드.length ? relay_constraint(앞!.번호, 앞B노드).map((c: any) => ({ ...c, B노드: true })) : [])];
        // 제시문 연결은 이 소문항 노드 + 이 소문항에 얹힌 이어받기 실체 위에서 (2026-10-21) — 앞 소문항에서 넘어온 h(x) 정의가 제시문 기호를 함께 품는다.
        //   이어받기 · 설정 · 조건 연결은 이 소문항 노드만 본다 (이어받기 실체가 제 자신에 닿지 않게)
        const 노드글 = u.노드.map((n: any) => String(n.실체));
        const 얹힌이어 = u.제약.filter((c: any) => c.종류 === '이어받기' && constraint_links(노드글, [c]).length).map((c: any) => c.실체);
        const 연결들 = u.제약.flatMap((c: any) => constraint_links(c.종류 === '제시문' ? [...노드글, ...얹힌이어] : 노드글, [c]));
        u.제약연결 = [...new Map(연결들.map((x: any) => [`${x.종류}|${x.출처}|${x.말}`, x])).values()];
        if (앞 && 앞 === 요청앞 && 요청앞제시문.length) u.이어받은제시문 = 요청앞제시문;
      });
      out.단계.수리 = { 형식: String(req.형식), 제약묶음: 발문들.map((t) => ({ 공통발문: t, 제약: math_constraints(t, 제시문목록 ?? []) })) };
    }
    // 연속 소문항 이어달리기 — 인문논술 C-1a [오종래 2026-10-20 확정] (숭실대 경상계열) — 앞 소문항 결론(급소 B)이 다음 소문항 출발점(제약 C 「이어받기」).
    //   같은 문항 묶음(「[문항 N]」 소문항은 머리 발문, 그 밖은 공통 발문)의 연속 소문항 모두. 소문항 창 하나면 요청의 앞소문항.
    //   표지가 없어도 이어받기를 단다 — 모범답안이 앞 창 답안을 이어받는다(화면 이어받을답안). 사족·일방흐름은 수리논술처럼 뺀다(아래)
    //   [오종래 2026-10-20 확정] 계단식 vs 병렬 — 소문항 참조(제시문 기호 + 부른 자료 [자료 N])가 앞 소문항과 같으면 계단식(이어달리기),
    //   다르면 병렬(각각 독립 논제, 이어달리기 없음)
    const 연속소문항 = String(req.형식 ?? '') === 'C-1a';
    if (연속소문항) {
      const B들 = (u: any) => ((u.급소덩어리 && u.급소덩어리.length ? u.급소덩어리 : u.급소) ?? []).map((d: any) => String(d.실체).trim().replace(/^[\s,]+/, '')).filter(Boolean);
      const 참조열쇠 = (참조: unknown, 자료: unknown) => JSON.stringify([[...new Set((Array.isArray(참조) ? 참조 : []).map(String))].sort(), [...new Set((Array.isArray(자료) ? 자료 : []).map(String))].sort()]);
      const 자료of = (s: any) => data_calls([s.공통발문, s.텍스트].filter(Boolean).join('\n'));
      const 요청앞 = req.앞소문항 && typeof req.앞소문항 === 'object' && Array.isArray(req.앞소문항.급소)
        ? { 번호: String(req.앞소문항.번호 ?? ''), B: req.앞소문항.급소.map(String), 열쇠: 참조열쇠(req.앞소문항.참조, req.앞소문항.자료) } : null;
      const 묶음 = (s: any) => (s.문항 ? s.문항.머리발문 : s.공통발문);
      out.단계.인식.소문항.forEach((u: any, i: number) => {
        const 열쇠 = 참조열쇠(소문항[i].참조, 자료of(소문항[i]));
        u.자료 = 자료of(소문항[i]);
        const 앞u = i > 0 && 묶음(소문항[i - 1]) === 묶음(소문항[i]) ? out.단계.인식.소문항[i - 1] : null;
        const 앞 = 앞u ? { 번호: 앞u.번호, B: B들(앞u), 열쇠: 참조열쇠(소문항[i - 1].참조, 자료of(소문항[i - 1])) } : i === 0 ? 요청앞 : null;
        if (!앞 || !앞.B.length) return;
        if (앞.열쇠 !== 열쇠) { u.병렬 = { 앞번호: 앞.번호, 사유: '참조 제시문·자료가 앞 소문항과 다름' }; return; }
        u.제약 = relay_constraint(앞.번호, 앞.B, '');
        u.이어받기 ??= { 번호: 앞.번호, 표지: '연속 소문항', 대상: '' };
      });
    }

    // 라벨 없는 단일 제시문 (오종래 2026-10-20 확정) — 통째로 배경 P. 단락 급소·수렴 경로·연결·사족·6단계 관계를 세우지 않는다 (align.ts background_passage)
    // 〈보기〉 — 별도 배경 P 블록 (2026-10-20)
    for (const b of 보기목록) out.단계.상황.push({ 색: 'P', 실체: b.텍스트, 참조: [], 소논제: 소문항.map((s: any) => s.번호), 보기: true });
    const 배경글 = 제시문목록 ? background_passage(제시문목록) : null;
    if (배경글) {
      out.단계.상황.push({ 색: 'P', 실체: 배경글, 참조: [], 소논제: 소문항.map((s: any) => s.번호), 배경제시문: true });
      // 단락(빈 줄 기준)마다 실체 하나 (오종래 2026-10-20 확정) — 정의문 → 논제 실체 → 첫 문장 급소. 8단계 인문 ② 세우기 조각이 된다
      const 논제노드 = 소문항.flatMap((s: any) => s.a.graph.nodes.map((n: any) => String(n.entity)));
      out.단계.제시문 = { 배경: true, 단락: background_paragraphs(배경글, 논제노드).map((p: any) => ({ label: null, 라벨: p.라벨, 텍스트: p.텍스트, 실체: p.실체, 문장: p.문장, 근거: p.근거, 색: { P: [p.텍스트], B: [], C: [], D: [], Q: [] } })), 전체급소: null, flag: null, 수렴경로: null };
      out.단계.정합 = { 연결: [], 사족: [], 소문항: 소문항.map((s: any) => ({ 번호: s.번호, 배경: ['제시문'], 범위밖: [], 연결단락: [] })) };
    }
    // 3·4단계 — 제시문 단락 급소(엔진 connectPassage) ↔ 논제 급소 연결, 사족 (HMOS 절대 원칙: 엔진이 잡는다)
    else if (제시문목록) {
      try {
        // 제시문 id가 한 글자 라벨(가·나…)이나 로마 숫자(I·II…, 수리논술 2026-10-19)면 [가]·[I] 머리를 붙여 단락 라벨로 읽히게 한다
        const 본문 = 제시문목록.map((p) => (/^(?:[가-하ㄱ-ㅎ]|I{1,3}|IV|VI{0,3}|IX|X)$/.test(p.id) ? `[${p.id}] ${p.텍스트}` : p.텍스트)).join('\n\n');
        const passage = recognizePassage(본문, fq.markerTable());
        const 라벨들 = passageLabels(passage.paragraphs);
        // 소논제마다 독립 (오종래 2026-10-15 (c)) — 3·4단계 정합은 소논제 하나씩 따로 돌려 잇는다 (5단계 진단·8단계 루브릭도 소논제마다).
        //   6단계 관계·추가·보완만 문항 전체 — 소논제들이 세운 단락 급소를 모아 단락 쌍을 맞대는 단계라, 소논제 하나로는 쌍이 서지 않는다
        //   (사회논술 샘플: 소논제마다 돌리면 관계 9 → 1, 추가 후보 3 → 0)
        // 수리 형식(C-2a·C-2b)은 단락 B ↔ 논제 열쇠를 수학 기호로 맞댄다 (오종래 2026-10-21 확정) — 인문논술은 글자 그대로
        const 수리정합 = /^C-2/.test(String(req.형식 ?? ''));
        const 소논제정합 = 소문항.map((s: any) => align_passage([{ 번호: s.번호, 참조: s.참조, 인식: s.a, 호출글: [s.공통발문, s.텍스트].filter(Boolean).join('\n') }], passage, { 수리: 수리정합 }));
        const 정합 = {
          연결: 소논제정합.flatMap((x: any) => x.연결),
          사족: 소논제정합.flatMap((x: any) => x.사족),
          소문항: 소논제정합.flatMap((x: any) => x.소문항),
        };
        out.단계.제시문 = {
          // 라벨 = align_passage가 연결에 쓰는 단락 이름 (기호 없는 단락은 앞 기호를 잇고, 그것도 없으면 「#순번」)
          단락: passage.paragraphs.map((p: any, i: number) => ({ label: p.label ?? null, 라벨: 라벨들[i] ?? `#${i + 1}`, 텍스트: p.text, 색: p.colors })),
          전체급소: passage.pivot ? { 실체: passage.pivot.node.entity, keyword: passage.pivot.keyword ?? '' } : null,
          flag: passage.flag ?? null,
          // 제시문 핵심 메시지 (오종래 2026-10-20 확정) — 정의문 없는 에피소드·상황형도 결론 문장(주제문)에서. 3단계가 배경일 때 보인다
          메시지: 제시문목록.map((p) => ({ id: p.id, ...(passage_message(p.텍스트) ?? { 실체: null, 문장: null, 근거: null }) })),
          // 수렴 경로 (오종래 2026-10-19) — 급소 B 여럿은 오류가 아니다. 경로 B들 → 수렴점(최종 입장)
          수렴경로: passage.convergence
            ? { 경로: passage.convergence.path.map((n: any) => n.entity.trim().replace(/^[\s,]+/, '')), 수렴점: passage.convergence.sink ? passage.convergence.sink.entity.trim().replace(/^[\s,]+/, '') : null, flag: passage.convergence.flag ?? null }
            : null,
        };
        // 극성 (오종래 2026-10-19) — 수렴 경로 B마다 주변(문장) 기능표지: 당김·밀침은 급소, 없으면 배경. 봉인에 「극성」이 없으면 극성만 비우고 분석은 잇는다
        if (passage.convergence) {
          const 봉인 = JSON.parse(readFileSync(fq.sealedPath(), 'utf8'));
          if (봉인.극성 && Array.isArray(봉인.극성.당김) && Array.isArray(봉인.극성.밀침)) {
            out.단계.제시문.수렴경로.극성 = passage_polarity(passage.graph, passage.convergence.path, 봉인.극성).map((x: any) => ({ 극성: x.polarity, 표지: x.markers, 문장: x.sentence }));
          } else out.단계.제시문.수렴경로.극성오류 = '봉인 표지사전에 「극성」(당김·밀침)이 없습니다';
        }
        // 「하지만 … 때문이다」 무게중심 (오종래 2026-10-20 확정, message.ts contrast_cause) — 제시문 하나(3단계 제시문별 요청)일 때
        //   전환 앞 현상 문장의 경로 B는 배경 P(극성 지움), 전환 뒤 B도 급소가 아니다. 「때문이다」 앞 원인절을 경로 끝 급소 B(극성 「원인」)로 세운다
        const 무게 = 제시문목록.length === 1 ? contrast_cause(제시문목록[0].텍스트) : null;
        const 경로 = out.단계.제시문.수렴경로;
        if (무게 && 경로 && Array.isArray(경로.극성)) {
          const 자리of = (문장: string) => (!문장 ? '전환 뒤 B' : 무게.배경글.includes(문장) ? '반론 전환 앞 현상 — 배경 P' : 무게.원인문장.includes(문장) || 문장.includes(무게.원인절) ? '원인절 안 B — 원인절 하나로 묶음' : '전환 문장 B');
          경로.극성 = 경로.극성.map((k: any) => ({ ...k, 극성: null, 표지: [], 배경: 자리of(String(k.문장 ?? '').trim()) }));
          경로.경로.push(무게.원인절);
          경로.극성.push({ 극성: '원인', 표지: ['~때문이다'], 문장: 무게.원인문장 });
          경로.수렴점 = 무게.원인절;
          out.단계.제시문.무게중심 = 무게;
        }
        // 연결단락 = 그 소문항이 연결선(급소·지정·기호)을 가진 단락 기호 — 6단계 자가검증이 읽는다
        out.단계.정합 = { 연결: 정합.연결, 사족: 정합.사족, 소문항: 정합.소문항.map((x: any) => ({ 번호: x.번호, 배경: x.연결.background, 범위밖: x.연결.outOfScope, 연결단락: [...new Set(x.연결.links.map((l: any) => 라벨들[l.paragraph] ?? `#${l.paragraph + 1}`))] })) };
        // 6단계 — 단락 급소 관계 → 6유형 뼈대 → 기존 논제와 비교 [봉인⑭, 오종래 2026-10-14]. 보완은 5단계로 넘긴다
        out.단계.관계 = 봉인14_6단계(정합, passage);
        // 제시문 핵심 (오종래 2026-10-21 확정) — 논제가 먼저다: 소문항 급소·논제 B → 봉인⑨ 요구(표적·관계·도구) → 그 요구에 닿는 제시문 부분(깃발)
        //   → 같은 소문항에 함께 걸린 쌍만 ⑧ 관계. 제시문 전체 급소로 돌아가지 않는다 (passage_core.ts)
        const 글of = (s: any) => [s.공통발문, s.텍스트].filter(Boolean).join('\n');
        const ids = 제시문목록.map((p) => p.id);
        // 논제 요구(봉인⑨) — 소문항마다 요구 종류·부른 제시문. 봉인이 비면 논제요구만 비우고, 핵심은 부른 제시문 전부를 도구로 보고 잇는다
        let 요구들: any[][];
        try {
          요구들 = 소문항.map((s: any) => 봉인9_논제요구(null, ids, 글of(s)));
        } catch (e) {
          out.단계.제시문.논제요구오류 = (e as Error).message;
          요구들 = 소문항.map(() => [{ 종류: '도구', 제시문: ids, 표지: null, 문장: '' }]);
        }
        out.단계.제시문.핵심요약 = passage_cores(제시문목록, out.단계.관계?.급소단락 ?? [], 소문항.map((s: any, i: number) => ({
          번호: s.번호 ?? null,
          텍스트: 글of(s),
          급소: [...new Set(정합.연결.filter((x: any) => x.소문항 === s.번호).map((x: any) => String(x.급소)))],
          요구: 요구들[i],
        })));
        // 쌍의 ⑧ 관계 — 관계·표적은 그 소문항이 붙든 쌍에 ⑧ 관계가 하나라도 서면 성립, 도구는 늘 성립 (filter/essay.ts 연결점과 같은 꼴)
        if (!out.단계.제시문.논제요구오류) {
          const 관계of = (번호: any, a: string, b: string) => out.단계.제시문.핵심요약.관계.filter((x: any) => x.소문항 === (번호 ?? null) && ((x.a === a && x.b === b) || (x.a === b && x.b === a))).map((x: any) => x.유형);
          out.단계.제시문.논제요구 = 소문항.map((s: any, i: number) => ({
            번호: s.번호,
            요구: 요구들[i].map((r: any) => {
              if (r.종류 === '도구') return { ...r, 쌍: [], 성립: true };
              const 짝 = r.제시문.length > 1
                ? r.제시문.flatMap((a: string, i: number) => r.제시문.slice(i + 1).map((b: string) => [a, b]))
                : r.제시문.flatMap((a: string) => ids.filter((b) => b !== a).map((b) => [a, b]));
              const 쌍 = 짝.map(([a, b]: string[]) => ({ a, b, 실제: [...new Set(관계of(s.번호, a, b))] }));
              return { ...r, 쌍, 성립: 쌍.some((x: any) => x.실제.length) ? true : null };
            }),
          }));
        }
      } catch (e) {
        stop('제시문', 멈춤of(e));
      }
    }

    // 수리논술 C-2 — 제약에 얹힌 소문항은 사족이 아니다 (논제 급소가 제약·앞 소문항 결과에 기댄다)
    //   인문논술 C-1a 연속 소문항(2026-10-20)은 앞 소문항 결과(이어받기 제약)가 있으면 얹힌 것
    const 얹힘 = (번호: any) => {
      const u = out.단계.인식.소문항.find((x: any) => x.번호 === 번호);
      return 수리논술 ? (u?.제약연결 ?? []).length > 0 : 연속소문항 && (u?.제약 ?? []).length > 0;
    };
    if (out.단계.정합) out.단계.정합.사족 = out.단계.정합.사족.filter((x: any) => !얹힘(x.소문항));

    // 5단계 — 정교화 4갈래 진단 [봉인⑬]. ④사족은 4단계 결과, 제시문이 없으면 요청의 사족
    const 사족 = out.단계.정합?.사족 ?? (Array.isArray(req.사족) ? req.사족 : []);
    // 6단계 ⑤ 보완(참조 범위 안 단락을 끌어들일 수 있는 소문항)은 5단계 진단 「보완」으로 (오종래 2026-10-14)
    // 자료 분석형 소문항(공통 발문·본문이 「[자료 N]」을 부른다)은 서술복잡을 내리지 않는다 (오종래 2026-10-20 확정)
    //   그 가운데 병렬 소문항(앞 소문항을 이어받지 않는다 — 계단식이 아니다)은 일방흐름도 내리지 않는다 (같은 날 확정)
    out.단계.정교화 = { 진단: [...봉인13_정교화진단(소문항.map((s: any, i: number) => {
      const 자료분석 = data_calls([s.공통발문, s.텍스트].filter(Boolean).join('\n')).length > 0;
      return { 이름: s.번호, 인식: s.a, 자료분석, 병렬자료: 자료분석 && !out.단계.인식.소문항[i]?.이어받기 };
    }), 사족), ...(out.단계.관계?.보완 ?? [])] };
    // 수리논술 C-2 — 제약 C가 얹힌 소문항은 「C 없이 한 방향」(일방흐름)이 아니다
    if (수리논술 || 연속소문항) out.단계.정교화.진단 =out.단계.정교화.진단.filter((d: any) => !(d.갈래 === '일방흐름' && (out.단계.인식.소문항.find((u: any) => u.번호 === d.단위)?.제약 ?? []).length));
  } else {
    // ── A·B ──
    // ① 인식
    // 서술형 B 급소 (오종래 2026-10-19 확정) — 실체 명사 B · 서술 방식(C-F) 제외 (pivot.ts)
    const 서술형 = 파이프라인 === 'B';
    const a = fq.recognizeV2Analysis(문항원문, { 서술형 });
    out.단계.인식 = { 입력: '문항원문', 전체: 인식of(a), 단위: (a.units ?? []).map(인식of) };
    // 서술형 B 단계형 (오종래 2026-10-14) — 소문항(계단 (1)(2)(3))마다 따로 인식해 2 인식 결과에 순서대로 보인다 (C 2단계와 같은 split_thesis)
    if (파이프라인 === 'B') {
      out.단계.인식.소문항 = split_thesis(문항원문).map((s: any) => ({ 번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, ...인식of(fq.recognizeV2Analysis(s.텍스트, { 서술형 })) }));
    }
    out.단계.타입 = fq.confirmType(문항원문, a, undefined);

    // ② 1차 필터 → 확인화면. A·B는 소문항 번호 구조(detectType subType 단계형)면 계단식 단계형
    const 단계형 = fq.detectType(문항원문).subType === '단계형';
    // 파이프라인 A면 서술형 바탕→도달 관계 판정(봉인⑩)을 건너뛴다 — B 전용 (오종래 2026-10-16)
    // 계열 — 교사가 고른 형식이 정한다 (B-s → 수리 · B-h → 인문사회국어, format-detect 엔진계열). 형식이 없으면 「자동」(수학·과학 계산 문항이면 수리).
    //   봉인② 조각 구조와 봉인⑪ 요소 결손이 이 계열로 센다 (오종래 2026-10-20 확정). A는 ⑪을 돌리지 않는다
    const 계열 = 파이프라인 === 'B' ? (형식계열(req.형식) ?? resolve_subject('자동', 문항원문)) : undefined;
    const 입력 = { 유형: 단계형 ? '계단식 단계형' : '단독문제', 텍스트: 문항원문, 파이프라인, ...(계열 ? { 계열 } : {}) };
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
