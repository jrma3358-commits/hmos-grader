// v2 경로 그래프 — 표지가 문장 위에 그리는 경로의 뼈대.
//
// 노드 = 조사·어미 (실체를 끌고 나와 색을 켜는 자리)
// 간선 = 부사·연결어 (노드와 노드 사이의 관계)
//
// 이 파일이 하지 않는 것:
//   - 어떤 표지가 어떤 색인가를 정하는 일 (봉인 파일이 정한다)
//   - 어떤 표지가 노드인가 간선인가를 정하는 일 (봉인 파일의 `kind`가 정한다)
//   - 색이 미결일 때 대신 고르는 일 (미결로 들어 올린다)
//
// 7형식은 **닫힌 목록이 아니다.** 백서 §4-3은 "이 문제 구조와 **그 조합**"이라 적는다.
// 그래서 조합은 색의 배열 그대로 남고, 형식 이름은 그 조합에 붙는 라벨일 뿐이다.
// 이름이 없는 조합도 유효하다 — 색을 하나도 버리지 않는다. (v1의 병: BUILD_PLAN §6-3)

import { SealedError } from '../sealed/index.ts';
import type { SealedSwitch, SealedTable } from '../sealed/schema.ts';
import type { Color, SwitchKind } from '../types.ts';

export interface PathNode {
  id: string;
  /** 문장에서 실제로 걸린 표지 표층형 */
  surface: string;
  /** 봉인 파일의 어느 스위치가 걸렸나 */
  switchId: string;
  index: number;
  /** 이 표지가 켠 등. 봉인 파일이 미결이면 null — 추측하지 않는다 */
  color: Color | null;
  /** 표지가 끌고 나온 실체(앞말). 표지가 주인이고 실체는 끌려 나온다 (백서 §3-4) */
  entity: string;
  /** Q→B로 접혀 B가 된 판단기준 노드의 원래 색. 접히지 않은 노드에는 없다 */
  foldedFrom?: Color | null;
  /** 재색칠 간선(apply.recolorTargets)이 가리켜 색이 바뀐 노드의 원래 색. 바뀌지 않은 노드에는 없다 */
  recoloredFrom?: Color | null;
  /** 자리 규칙(apply.contextRules)이 색을 바꾼 노드 — 규칙 id와 원래 색. 바뀌지 않은 노드에는 없다 */
  contextRule?: { id: string; from: Color | null };
}

export interface PathEdge {
  from: string;
  to: string;
  /** 간선을 만든 표지 표층형. 인접·접힘으로 이어졌으면 null */
  surface: string | null;
  /** '접힘' = 판단기준에 걸려 판정되는 노드가 그 판단기준으로 보내는 간선 (Q→B) */
  kind: 'adjacent' | '연결어' | '부사' | '접힘';
  index: number;
}

/** 걸렸으나 자리를 정할 수 없는 표지 — 색이나 종류가 미결이다 */
export interface UndecidedHit {
  surface: string;
  switchId: string;
  index: number;
  reason: 'color' | 'kind';
}

export interface PathGraph {
  question: string;
  nodes: PathNode[];
  edges: PathEdge[];
  /** 켜진 색들 (문장 순서, 중복 제거). 7형식은 이 조합에 붙는 이름일 뿐이다 */
  combination: Color[];
  undecided: UndecidedHit[];
}

/** 조합에 붙는 라벨. 이름이 없어도 조합은 유효하다 */
export interface FormCombination {
  /** 봉인 파일 forms[]에 같은 조합이 있으면 그 id. 없으면 null */
  id: string | null;
  name: string | null;
  /** 관측된 색 — **입력을 하나도 버리지 않는다** */
  colors: Color[];
  /** 봉인 파일에 이름이 있는 조합인가 */
  known: boolean;
}

// ─────────────────────────────────────────────────────────────
// 표지 스캔
// ─────────────────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 표지 표층형 → 정규식.
 * '~'는 "여기에 실체가 온다"는 자리표시다 — 앞의 '~'는 조건 없음, 가운데 '~'는 사이에 실체가 낀다.
 * 가운데 '~'는 캡처한다 — 사이에 낀 실체가 곧 그 노드의 entity다.
 * 예: "~가 되도록" → /가\s*되도록/ · "모든 ~에 대하여" → /모든\s*([\s\S]*?)에\s*대하여/
 */
export function markerRegex(surface: string): RegExp {
  const parts = surface
    .split('~')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => escape(p).replace(/\s+/g, '\\s*'));
  if (!parts.length) throw new SealedError(`표지가 비어 있습니다: "${surface}"`);
  return new RegExp(parts.join('\\s*([\\s\\S]*?)\\s*'));
}

interface Candidate {
  surface: string;
  sw: SealedSwitch;
  re: RegExp;
}

/** 봉인 파일의 표지를 전부 모은다. 순서는 `apply`가 정한다 — 코드가 정하지 않는다 */
function candidates(table: SealedTable): Candidate[] {
  const all: Candidate[] = [];
  for (const sw of table.switches) {
    for (const surface of sw.markers) all.push({ surface, sw, re: markerRegex(surface) });
  }
  if (table.apply.longestMatchFirst === null) {
    throw new SealedError(
      '적용 규칙이 미정입니다: apply.longestMatchFirst\n' +
        '봉인 파일에서 정해야 합니다 — 짧은 표지가 긴 표지를 먼저 먹으면 "~가"가 "~가 되도록"을 삼킵니다.',
    );
  }
  if (table.apply.longestMatchFirst !== true) {
    throw new SealedError(
      '최장 일치가 아닌 적용 방식은 아직 명세가 없습니다 (apply.longestMatchFirst=false).',
    );
  }
  return all.sort((a, b) => b.surface.length - a.surface.length);
}

/** 어휘형 표지인가 — 봉인 파일의 `lexical`이 정한다 (스위치 전부 또는 적힌 표지만) */
function isLexical(sw: SealedSwitch, marker: string): boolean {
  return sw.lexical === true || (Array.isArray(sw.lexical) && sw.lexical.includes(marker));
}

/** 노드가 되는 표지의 종류 — 나머지(연결어·부사)는 간선이 된다 */
const NODE_KIND = '조사·어미' satisfies SwitchKind;

/**
 * 표지로 문장을 훑어 경로 그래프를 만든다.
 *
 * 뼈대 한계 (의도적):
 *   - 실체(entity)는 어휘형 표지(`lexical`)면 표지 자신, 아니면 표지 가운데 '~'가 붙잡은 글자,
 *     그것도 없으면 "앞 표지 끝 ~ 이 표지 시작"의 글자 그대로다. 실체를 해석하지 않는다.
 *   - 간선은 인접 노드를 잇는 데까지다. 관계의 성격(순접·역접·병렬)은 원전 명세가 서면 붙인다.
 */
export function build_path_graph(question: string, table: SealedTable): PathGraph {
  const cands = candidates(table);
  /** chained = 어절 안이지만 조사 연쇄로 걸린 표지 (예: 「것만을」의 「만」) */
  const hits: { at: number; end: number; c: Candidate; inner: string; chained: boolean }[] = [];

  // 어절 끝 조건 [오종래 2026-09-30] — apply.endOfWord면 조사·어미 표지(어휘형 제외)는
  //   바로 뒤가 한글·영문·숫자·여는 괄호가 아닐 때만 건다. 조사는 어절 끝에 붙기 때문이다.
  //   조사 연쇄 [오종래 2026-09-30] — 바로 뒤가 등록된 조사·어미 표지(어휘형 제외)로 이어지면 어절 끝으로 본다
  //   (예: 「것만을」의 첫 조사 뒤에 둘째 조사가 붙는 경우).
  //   [오종래 2026-10-01] 연쇄를 여는 표지는 봉인 파일의 apply.chainHeads 스위치로 한정한다 —
  //   아무 표지나 열면 「사과를」의 「과」가 「를」과 연쇄로 오인되어 노드가 선다.
  const endOfWord = table.apply.endOfWord === true;
  const insideWord = (next: string | undefined) => next !== undefined && /[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9([{<]/.test(next);
  const nodeCands = cands.filter((c) => c.sw.kind === NODE_KIND && !isLexical(c.sw, c.surface));
  const chainHeads = table.apply.chainHeads ?? [];
  const chainsToMarker = (head: SealedSwitch, after: string) =>
    chainHeads.includes(head.id) && nodeCands.some((c) => after.match(c.re)?.index === 0);

  // 체언 뒤에서만 [오종래 2026-09-30] — apply.afterNounOnly 스위치는 앞 음절이 체언일 때만 건다.
  //   앞 음절이 봉인 파일의 용언 어간(apply.verbStems, 예: 「하」·「되」)이면 관형형 어미로 보고 걸지 않는다.
  //   [오종래 2026-10-01] 받침 없는 음절을 모두 용언으로 보던 간이 규칙은 폐기 — 「철수는」의 「는」을 놓쳤다.
  const afterNounOnly = table.apply.afterNounOnly ?? [];
  const verbStems = table.apply.verbStems ?? [];
  const verbStemBefore = (ch: string | undefined) => ch !== undefined && verbStems.includes(ch);

  for (let i = 0; i < question.length; ) {
    const rest = question.slice(i);
    let matched: { len: number; c: Candidate; inner: string; chained: boolean } | undefined;
    for (const c of cands) {
      const m = rest.match(c.re);
      if (m && m.index === 0) {
        const inside =
          endOfWord && c.sw.kind === NODE_KIND && !isLexical(c.sw, c.surface) && insideWord(rest[m[0].length]);
        if (inside && !chainsToMarker(c.sw, rest.slice(m[0].length))) {
          continue; // 어절 안 — 더 짧은 표지를 마저 본다
        }
        if (afterNounOnly.includes(c.sw.id) && verbStemBefore(question[i - 1])) {
          continue; // 앞이 용언 어간 — 관형형 어미로 본다
        }
        // 가운데 '~'가 붙잡은 실체 (여럿이면 이어 붙인다)
        const inner = m.slice(1).map((s) => s.trim()).filter(Boolean).join(' ');
        matched = { len: m[0].length, c, inner, chained: inside };
        break; // 최장 일치 — cands가 이미 긴 것부터다
      }
    }
    if (matched) {
      hits.push({ at: i, end: i + matched.len, c: matched.c, inner: matched.inner, chained: matched.chained });
      i += matched.len;
    } else {
      i += 1;
    }
  }

  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const undecided: UndecidedHit[] = [];
  let cursor = 0;
  let pendingEdge: { surface: string; kind: '연결어' | '부사'; index: number; sw: SealedSwitch } | undefined;
  const recolorIds = table.apply.recolorTargets ?? [];
  // 연쇄 머리가 넘긴 실체 — 바로 이어 붙은 끝 표지(at)가 받는다
  let carried: { at: number; entity: string } | undefined;

  for (const [n, hit] of hits.entries()) {
    const { sw } = hit.c;
    const surface = question.slice(hit.at, hit.end);

    if (sw.kind === null) {
      undecided.push({ surface, switchId: sw.id, index: hit.at, reason: 'kind' });
      cursor = hit.end;
      continue;
    }

    if (sw.kind !== NODE_KIND) {
      // 연결어·부사 → 간선. 다음 노드가 설 때 이어 붙인다
      pendingEdge = { surface, kind: sw.kind, index: hit.at, sw };
      cursor = hit.end;
      continue;
    }

    let entity = isLexical(sw, hit.c.surface) ? surface : hit.inner || question.slice(cursor, hit.at).trim();

    // 조사 연쇄의 실체 [오종래 2026-10-01] — 「것만을」: 「만」은 선택 기준(자기 색, 실체 = 표층형 「만」),
    //   「것」은 앞 제약에 걸린 대상이라 연쇄 끝 표지(「을」)의 노드가 끌고 나온다.
    if (entity === '' && carried?.at === hit.at) entity = carried.entity;
    carried = undefined;
    if (hit.chained && entity !== '') {
      carried = { at: hit.end, entity };
      entity = surface;
    }

    // 빈 노드 무시 [오종래 2026-09-30] — 끌고 나올 실체가 없는 표지(예: 어휘형 「(가)」 바로 뒤의 「의」)는
    //   노드를 세우지 않는다. 앞 간선은 다음 노드로 넘긴다.
    if (entity === '') {
      cursor = hit.end;
      continue;
    }

    if (sw.color === null) undecided.push({ surface, switchId: sw.id, index: hit.at, reason: 'color' });

    const node: PathNode = {
      id: `n${n}`,
      surface,
      switchId: sw.id,
      index: hit.at,
      color: sw.color,
      entity,
    };

    // 재색칠 간선 [오종래 2026-09-30] — 봉인 파일이 지정한 간선 스위치(apply.recolorTargets, 예: 화살표)가
    //   가리키는 노드는 그 스위치의 색으로 칠한다. 이미 B로 확정된 노드는 건드리지 않는다. 원래 색은 남긴다.
    //   판단기준 접기(Q→B, 아래)는 이 뒤에 온다 — 재색칠된 판단기준도 B로 접힌다.
    const by = pendingEdge?.sw;
    if (by && recolorIds.includes(by.id) && by.color !== null && node.color !== 'B' && node.color !== by.color) {
      node.recoloredFrom = node.color;
      node.color = by.color;
    }

    const prev = nodes.at(-1);
    nodes.push(node);
    cursor = hit.end;

    if (prev) {
      edges.push(
        pendingEdge
          ? { from: prev.id, to: node.id, surface: pendingEdge.surface, kind: pendingEdge.kind, index: pendingEdge.index }
          : { from: prev.id, to: node.id, surface: null, kind: 'adjacent', index: node.index },
      );
    }
    pendingEdge = undefined;
  }

  // 자리 규칙 [오종래 2026-10-01] — 봉인 파일이 지정한 스위치(apply.contextRules[].targets)의 노드는 자리에 따라 색을 바꾼다.
  //   'beforeObject' (LS-22): 바로 다음 노드가 목적격 표지(objectMarkers, 예: 을/를)로 선 B 노드면 → 규칙 색
  //   'sentenceEnd'  (LS-23): 표지 뒤가 문장 끝이거나 바로 «?»면 → 규칙 색
  //   어느 조건에도 맞지 않으면 스위치 본래 색(기본값)을 그대로 둔다. 규칙은 적힌 순서대로 보고 처음 맞는 것 하나만 건다.
  //   판단기준 접기(Q→B, 아래)는 이 뒤에 온다.
  const bare = (m: string) => m.replace(/~/g, '').replace(/\s+/g, '');
  const contextRules = table.apply.contextRules ?? [];
  for (const [i, node] of nodes.entries()) {
    const next = nodes[i + 1];
    const after = question.slice(node.index + node.surface.length);
    const rule = contextRules.find(
      (r) =>
        r.targets.includes(node.switchId) &&
        (r.when === 'beforeObject'
          ? next !== undefined &&
            next.color === 'B' &&
            (r.objectMarkers ?? []).some((m) => bare(m) === next.surface.replace(/\s+/g, ''))
          : /^\s*([?？]|$)/.test(after)),
    );
    if (rule && rule.color !== node.color) {
      nodes[i] = { ...node, color: rule.color, contextRule: { id: rule.id, from: node.color } };
    }
  }

  // Q→B 추출 (구현명세 §2-3). [오종래 2026-09-30]
  //   «옳은 것을 고르시오»는 Q이고, 판단기준(예: «탄소 화합물인가?»)은 그 Q에 접힌 B다.
  //   (가) 봉인 파일이 판단기준 표지로 지정한 스위치(apply.foldToB)의 노드 → 색을 B로 접는다. 원래 색은 남긴다.
  //   (나) 그 뒤에 오는 노드(분기 결과·Q·보기)는 모두 그 판단기준으로 판정되므로 '접힘' 간선을 보낸다 → 수렴.
  const foldIds = table.apply.foldToB ?? [];
  for (const [i, node] of nodes.entries()) {
    if (!foldIds.includes(node.switchId)) continue;
    nodes[i] = { ...node, color: 'B', foldedFrom: node.color };
    for (const later of nodes.slice(i + 1)) {
      edges.push({ from: later.id, to: node.id, surface: null, kind: '접힘', index: later.index });
    }
  }

  // 조합은 접기 전 색으로 센다 [오종래 2026-10-01] — 판단기준(Q에 접힌 B)은 급소 판정에서만 B이고,
  //   표면에 켜진 등은 원래 색이다 (예: 수학_문_4 「연속일 때」 = C → 조합 B·C·Q).
  const combination: Color[] = [];
  for (const node of nodes) {
    const lit = node.foldedFrom !== undefined ? node.foldedFrom : node.color;
    if (lit && !combination.includes(lit)) combination.push(lit);
  }

  return { question, nodes, edges, combination, undecided };
}

/**
 * 색 조합에 이름을 붙인다. 이름이 없어도 그대로 둔다 — **색을 버리지 않는다.**
 * (v1 `formFromColors`는 P+B+C+Q에서 B를 조용히 버렸다: BUILD_PLAN §6-3)
 */
export function describeCombination(colors: Color[], table: SealedTable): FormCombination {
  const key = (cs: Color[]) => [...new Set(cs)].sort().join('');
  const mine = key(colors);
  const hit = table.forms.find((f) => key(f.colors) === mine);
  return {
    id: hit?.id ?? null,
    name: hit?.name ?? null,
    colors,
    known: Boolean(hit),
  };
}
