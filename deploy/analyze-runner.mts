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

const GRADER = process.env.HMOS_GRADER ?? join(import.meta.dirname, 'hmos-grader');
const load = (p: string) => import(pathToFileURL(join(GRADER, p)).href);
const fq = await load('src/fq/index.ts');
const { recognizePassage, passageLabels, PASSAGE_REFERENCE, referenceGroup, designatedLabels } = await load('src/fq/v2/passage.ts');
const { make_screen } = await load('src/filter/confirm.ts');
const { 봉인13_정교화진단 } = await load('src/filter/sealed/items.ts');
const { split_thesis } = await load('src/thesis/split.ts');
const { align_passage } = await load('src/thesis/align.ts');
const { essay_pivot_chunks } = await load('src/thesis/chunk.ts');
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
const { parse_quadratic, parse_polynomial_conditions, parse_counting_item, resolve_subject } = await load('src/rubric/multipath.ts');
// 8단계 학생 답안 채점 — 엔진 G1 (봉인⑥ 조각 대조 · 봉인④-b 게이트, 계열별, 오종래 2026-10-14)
const { grade } = await load('src/rubric/g1.ts');
const { 게이트사슬, 상한비 } = await load('src/rubric/sealed/g1.ts');

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
function 루브릭작업(논제글: string, 계열: string, 총배점: number, 제시문목록: { id: string; 텍스트: string }[] | null, 공통자료 = false, 이어받기 = false, 모범답안: unknown = [], 정답: unknown = '', 핵심: unknown = '') {
  // 출제의도는 급소를 고르거나 바꾸지 않는다 — 소문항 몫을 루브릭 화면 참고 정보로만 낸다 (오종래 2026-10-16, 급소 대체 제거)
  const 소문항들 = split_thesis(논제글).map((s: any) => ({ ...s, a: fq.recognizeV2Analysis(s.텍스트) }));
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
    if (제시문목록) {
      try {
        const 본문 = 제시문목록.map((p) => (/^[가-하]$/.test(p.id) ? `[${p.id}] ${p.텍스트}` : p.텍스트)).join('\n\n');
        const passage = recognizePassage(본문, fq.markerTable());
        const 정합 = align_passage(소문항들.map((s: any) => ({ 번호: s.번호, 참조: s.참조, 인식: s.a })), passage);
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
        연결of = (번호) => link_sentences(단락들, 급소단락of(번호).flatMap((x: any) => x.단락), 극성of(번호));
        단락연결of = (번호) => 급소단락of(번호).flatMap((x: any) => x.단락.map((d: any) => ({ 노드: x.노드, 단락: d.단락, 단락급소: d.단락급소 })));
      } catch (e) {
        연결멈춤 = 멈춤of(e);
      }
    }
  }
  // 단계형 이어받기 (서술형 B, 오종래 2026-10-14) — (n)은 (n-1)의 급소 K를 ① 「앞 결과」 조각으로 받는다
  const 급소들of = (s: any) => (s.a.pivot.ok ? (s.a.pivot.pivots ?? [s.a.pivot.pivot]).map((p: any) => ({ 번호: s.번호, 실체: p.node.entity })) : []);
  // 소문항 배점 — 소문항 글에 「[N점]」이 있으면 그 값, 없으면 요청 총배점 (2026-10-14)
  //   [오종래 2026-10-15 ③] 괄호 안 「N점」도 — 「(200자 내외, 4점)」. 여럿이면 마지막 것 (앞에 붙은 공통 발문의 「(16점)」이 아니라)
  //   [오종래 2026-10-16 q4] 자기 「[N점]」이 없고 공통 발문에 「[총 N점]」이 있으면 소문항마다 N (나누기는 취소)
  const 소배점들 = sub_item_points(소문항들, 총배점);
  return 소문항들.map((s: any, n: number) => {
    const 소배점 = 소배점들[n];
    const 답안글 = item_portion(모범답안, s.번호, n, true);
    const 의도 = item_portion(핵심, s.번호, n).trim();
    const 소 = { 번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, 배점: 소배점, ...(의도 ? { 출제의도: 의도 } : {}) };
    if (연결멈춤) return { ...소, 멈춤: 연결멈춤 };
    try {
      // [오종래 2026-10-16 q4 ①] 소문항 글에 물음이 없으면 공통 발문 급소를 물려받는다 (급소와 그 물음만 — ①② 노드는 소문항 자기 것)
      const 물려받을물음 = !has_question(s.a) ? common_question(s.공통발문) : '';
      const 입력 = 물려받을물음 ? f2_input_inherit(s.a, fq.recognizeV2Analysis(물려받을물음)) : f2_input_from_v2(s.a);
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
      const 앞급소 = 이어받기 && n > 0 ? 급소들of(소문항들[n - 1]) : [];
      // 원식 — 소문항 글(없으면 공통 발문)의 수 계수 이차방정식. 수리만 (2026-10-16 다경로)
      const 원식 = 계열 === '수리' ? (parse_quadratic(s.텍스트) ?? parse_quadratic(String(s.공통발문 ?? ''))) : null;
      // 다항식 · 나머지 조건 (「다항식 …를 x-2로 나누었을 때 나머지가 1」) — 수 계수 이차방정식이 없는 수리 문항 (2026-10-16 q7)
      const 문항글 = [s.공통발문, s.텍스트].filter(Boolean).join('\n');
      const 다항식 = 계열 === '수리' && !원식 ? parse_polynomial_conditions(문항글) : null;
      // 경우의 수 문항 (「a,a,b,c,d,e … 경우의 수」) — 모범답안 줄 조각으로 채점 (2026-10-17 q3 안 A)
      const 경우의수 = 계열 === '수리' && !원식 && !다항식 ? parse_counting_item(문항글) : null;
      const 인식 = { ...입력.인식, ...(연결문장 ? { 연결문장, 단락연결 } : {}), ...(앞급소.length ? { 앞급소 } : {}), ...(원식 ? { 원식 } : {}), ...(다항식 ? { 다항식 } : {}), ...(경우의수 ? { 경우의수 } : {}) };
      // 계열이 ④ 답구하기를 가른다 — 인문사회국어 = 급소 K마다 경로 추적, 수리 = Q 대상 값 일치
      let 뼈대 = derive_pieces(물음, k, 인식, 계열).map((c: any) => ({ ...c, 요소: judge_element(c, 계열) }));
      // 서술형 B — 교사 모범답안(소문항 순서)에서 엔진 ② 세우기 실체 줄 뒤 ~ ④ 급소 K 줄 앞을 줄마다 풀기 조각으로 (오종래 2026-10-16)
      //   수리 계열도 같다 (같은 날 확대 — 줄이 있으면 봉인2_풀기가 세우기 1:1 대신 줄 조각을 낸다)
      //   [오종래 2026-10-16 q5] 수리는 줄 나누기 규칙으로 바뀜 — 「~하면」 줄 ① · 등식 줄 ② · 「∴」 줄 ④ 모범 값 · 풀기 없음 (세우기=풀기)
      // 문항 글을 넘긴다 — 「∴」 말고도 문항 문자로 시작해 수로 끝나는 줄을 답 값에 (답이 둘인 문항, q7)
      const 수리줄 = 계열 === '수리' && 답안글.trim() ? classify_math_lines(답안글, 문항글) : null;
      if (수리줄) 뼈대 = derive_pieces(물음, k, { ...인식, 교사줄: 수리줄 }, 계열).map((c: any) => ({ ...c, 요소: judge_element(c, 계열) }));
      const 풀기구간 = 답안글.trim() && !수리줄 ? split_solve_lines(답안글, 뼈대) : null;
      if (풀기구간 && 풀기구간.풀기.length) {
        뼈대 = derive_pieces(물음, k, { ...인식, 교사풀기: 풀기구간.풀기 }, 계열).map((c: any) => ({ ...c, 요소: judge_element(c, 계열) }));
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

  const 제시문목록: { id: string; 텍스트: string }[] | null = Array.isArray(req.제시문) ? req.제시문 : typeof req.제시문 === 'string' && req.제시문.trim() ? [{ id: '제시문', 텍스트: req.제시문 }] : null;

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
  } else if (req.작업 === '정답검증') {
    // ── C 9단계 정답 검증 (오종래 2026-10-16) ── 정답은 채점 기준이 아니라 검증. 모범답안(한 문단)을 문장으로 나눠
    //   답 문장(급소 핵심어가 마지막으로 나온 문장)과 정답을 대조한다. 조각은 루브릭 작업 출력 그대로 받아 엔진 조각으로 되살린다
    const 노드of = (실체: string | null) => (실체 ? { id: 'n', entity: 실체, color: null, surface: '', switchId: '', index: 0 } : null);
    const 조각들 = (Array.isArray(req.조각) ? req.조각 : []).map((c: any) => ({
      id: c.id, 파트: c.파트, 요소: c.요소 ?? null, 수행질: null, 확인물음: '', is_중심: false,
      node: c.노드 ? 노드of(c.실체 ?? null) : null, ...(c.근거 ? { 근거: c.근거 } : {}), ...(c.경로 ? { 경로: c.경로 } : {}),
    }));
    out.단계.정답검증 = verify_answer(item_portion(req.정답 ?? '', req.번호 ?? null, 0), String(req.모범답안 ?? ''), 조각들, req.단위 === '줄' ? '줄' : '문장');
  } else if (req.작업 === '소논제') {
    // ── 1단계 소논제 미리보기 (오종래 2026-10-15 안 a) ── 엔진 split_thesis로 나누기만 한다. 인식은 2단계에서
    out.단계.소논제 = split_thesis(String(req.논제 ?? 문항원문)).map((s: any) => ({ 번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, 참조: s.참조 }));
  } else if (req.작업 === '루브릭') {
    // ── 8단계 루브릭만 ── 인식·제시문·정교화는 다시 돌리지 않는다
    // 수학 문항은 수리로만 (오종래 2026-10-16) — 「자동」이면 엔진이 고르고, 인문사회국어로 수학 문항이 오면 계열오류
    const 계열 = resolve_subject(req.계열, String(req.논제 ?? 문항원문));
    const 총배점 = Number(req.총배점) > 0 ? Number(req.총배점) : 10;
    out.단계.루브릭 = { 계열, 총배점, 소문항: 루브릭작업(String(req.논제 ?? 문항원문), 계열, 총배점, 제시문목록, !!req.공통자료, !!req.이어받기, req.모범답안 ?? [], req.정답 ?? '', req.핵심 ?? '') };
  } else if (파이프라인 === 'C') {
    // ── C·논술 (조립설명서 C·논술 9단계) — 논제를 먼저 읽는다. 1차 필터는 타지 않는다 (2026-10-13 확정 4) ──
    const 논제글 = String(req.논제 ?? 문항원문);

    // 2단계 — 소문항마다 따로 인식. 공통 발문은 떼어 낸다 (오종래 2026-10-13)
    const 물려줄참조: string[] = Array.isArray(req.참조) ? req.참조.map(String) : [];
    const 소문항 = split_thesis(논제글).map((s: any) => ({ ...s, ...(!s.참조.length && 물려줄참조.length ? { 참조: 물려줄참조 } : {}), a: fq.recognizeV2Analysis(s.텍스트) }));
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
        const 라벨들 = passageLabels(passage.paragraphs);
        // 소논제마다 독립 (오종래 2026-10-15 (c)) — 3·4단계 정합은 소논제 하나씩 따로 돌려 잇는다 (5단계 진단·8단계 루브릭도 소논제마다).
        //   6단계 관계·추가·보완만 문항 전체 — 소논제들이 세운 단락 급소를 모아 단락 쌍을 맞대는 단계라, 소논제 하나로는 쌍이 서지 않는다
        //   (사회논술 샘플: 소논제마다 돌리면 관계 9 → 1, 추가 후보 3 → 0)
        const 소논제정합 = 소문항.map((s: any) => align_passage([{ 번호: s.번호, 참조: s.참조, 인식: s.a }], passage));
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
        };
        // 연결단락 = 그 소문항이 연결선(급소·지정·기호)을 가진 단락 기호 — 6단계 자가검증이 읽는다
        out.단계.정합 = { 연결: 정합.연결, 사족: 정합.사족, 소문항: 정합.소문항.map((x: any) => ({ 번호: x.번호, 배경: x.연결.background, 범위밖: x.연결.outOfScope, 연결단락: [...new Set(x.연결.links.map((l: any) => 라벨들[l.paragraph] ?? `#${l.paragraph + 1}`))] })) };
        // 6단계 — 단락 급소 관계 → 6유형 뼈대 → 기존 논제와 비교 [봉인⑭, 오종래 2026-10-14]. 보완은 5단계로 넘긴다
        out.단계.관계 = 봉인14_6단계(정합, passage);
      } catch (e) {
        stop('제시문', 멈춤of(e));
      }
    }

    // 5단계 — 정교화 4갈래 진단 [봉인⑬]. ④사족은 4단계 결과, 제시문이 없으면 요청의 사족
    const 사족 = out.단계.정합?.사족 ?? (Array.isArray(req.사족) ? req.사족 : []);
    // 6단계 ⑤ 보완(참조 범위 안 단락을 끌어들일 수 있는 소문항)은 5단계 진단 「보완」으로 (오종래 2026-10-14)
    out.단계.정교화 = { 진단: [...봉인13_정교화진단(소문항.map((s: any) => ({ 이름: s.번호, 인식: s.a })), 사족), ...(out.단계.관계?.보완 ?? [])] };
  } else {
    // ── A·B ──
    // ① 인식
    const a = fq.recognizeV2Analysis(문항원문);
    out.단계.인식 = { 입력: '문항원문', 전체: 인식of(a), 단위: (a.units ?? []).map(인식of) };
    // 서술형 B 단계형 (오종래 2026-10-14) — 소문항(계단 (1)(2)(3))마다 따로 인식해 2 인식 결과에 순서대로 보인다 (C 2단계와 같은 split_thesis)
    if (파이프라인 === 'B') {
      out.단계.인식.소문항 = split_thesis(문항원문).map((s: any) => ({ 번호: s.번호, 텍스트: s.텍스트, 공통발문: s.공통발문, ...인식of(fq.recognizeV2Analysis(s.텍스트)) }));
    }
    out.단계.타입 = fq.confirmType(문항원문, a, undefined);

    // ② 1차 필터 → 확인화면. A·B는 소문항 번호 구조(detectType subType 단계형)면 계단식 단계형
    const 단계형 = fq.detectType(문항원문).subType === '단계형';
    // 파이프라인 A면 서술형 바탕→도달 관계 판정(봉인⑩)을 건너뛴다 — B 전용 (오종래 2026-10-16)
    const 입력 = { 유형: 단계형 ? '계단식 단계형' : '단독문제', 텍스트: 문항원문, 파이프라인 };
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
