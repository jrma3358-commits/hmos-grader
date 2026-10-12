// 실행: node --env-file=.env server.js
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const MODEL = 'claude-sonnet-5-5';
const SPEC = path.join(__dirname, 'HMOS_구현세트', 'HMOS_루브릭_구현명세-7.md');

const client = new Anthropic(); // ANTHROPIC_API_KEY는 .env에서

app.use(express.json());
app.use(express.static(__dirname));

/** run.ts 출력에서 「== 전체」 덩어리만 읽는다 (단위별 덩어리는 같은 꼴로 뒤따름) */
function parseEngineOutput(raw) {
  const sections = raw.split(/^== /m).filter(Boolean);
  const whole = sections[0] || '';
  const lines = whole.split('\n');
  const head = lines[0].match(/조합\s+([A-Z]*)/);
  const nodes = [];
  let pivot = null;
  const 평가 = [];

  for (const line of lines) {
    const nm = line.match(/^\s*(n\d+)\s+([BCPDQ])\s+「([^」]*)」\s*(.*)$/);
    if (nm) nodes.push({ id: nm[1], color: nm[2], entity: nm[3].trim(), surface: nm[4].trim() });

    const pm = line.match(/^\s*pivot:\s*(\{.+\})\s*$/);
    if (pm) { try { pivot = JSON.parse(pm[1]); } catch (_) {} }

    const em = line.match(/^\s*(결론: .+|판정 불가 .+)$/);
    if (em) 평가.push(em[1].replace(/^결론: /, ''));
  }

  const pivots = pivot && pivot.ok ? (pivot.pivots || [pivot.pivot]) : [];
  const 급소들 = pivots.map(p => ({
    color: p.node.color,
    entity: (p.node.entity || '').trim(),
    keyword: (p.keyword || '').trim(),
    reason: p.reason || '',
  }));
  const colors = { B: [], C: [], P: [], D: [], Q: [] };
  for (const n of nodes) if (colors[n.color]) colors[n.color].push(n.entity);
  const 평가근거 = (whole.split(/^\s*평가:\s*$/m)[1] || '').trim();

  return {
    조합: head ? head[1] : '',
    nodes,
    pivot,
    colors,
    급소: 급소들[0] || { color: '', entity: '', keyword: '' },
    급소들,
    급소실패: pivot && !pivot.ok ? pivot.flag : null,
    평가,
    평가근거,
  };
}

app.post('/api/analyze', (req, res) => {
  const q = (req.body.question || '').trim();
  if (!q) { res.status(400).json({ error: 'empty' }); return; }

  const tmp = path.join(os.tmpdir(), 'q' + Date.now() + '.txt');
  fs.writeFileSync(tmp, q, 'utf8');

  execFile(process.execPath, ['run.ts', tmp], {
    cwd: __dirname,
    timeout: 30000,
    encoding: 'utf8'
  }, (err, stdout) => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (err) { res.status(500).json({ error: err.message }); return; }
    const parsed = parseEngineOutput(stdout);
    res.json({ raw: stdout, parsed });
  });
});

// ── /api/generate — HMOS 이론 기반 제안 (루브릭·모범답안·해설) ──────────

/** 명세 F2~F6 절을 원문 그대로 잘라 시스템 프롬프트에 싣는다 — 이론을 여기서 새로 쓰지 않는다 */
function loadSpecRules() {
  const md = fs.readFileSync(SPEC, 'utf8');
  const from = md.indexOf('### F2.');
  const to = md.indexOf('## 3½.');
  return md.slice(from, to).trim();
}

const SYSTEM = `너는 HMOS 루브릭 생성기다. 아래 「HMOS 루브릭 구현 명세」의 F2~F6 규칙에 따라, 주어진 문항의 조각을 역산하고 루브릭·모범답안·해설을 제안한다.

지킬 것:
- 급소(k)와 5색 노드·조합은 HMOS 질문 인식 엔진의 산출이다. 다시 계산하거나 바꾸지 말고 그대로 받는다.
- 조각은 파트 ①근거대기 ②세우기 ③풀기 ④답구하기 ⑤표현 순서로 낸다. ⑤표현은 조각 하나다.
- 각 파트의 조각 수는 F2의 「급소에서 역산한 최소 핵심 수」를 따른다. 문항 조건을 그냥 세지 않는다.
- 요소는 F3대로 파트가 정한 후보 안에서만 고른다(①: b·d / ②: c·p / ④: k·q / ③·⑤: none).
- 충족조건은 F4대로 O/X로 판정할 수 있게 쓴다. 계열이 수리면 완전 일치, 인문사회국어면 급소 도달.
- 모범조각은 F6대로 인식이 준 정보(급소·요소)를 따라 편다. 급소를 벗어난 그럴듯한 서술을 넣지 않는다.
- 배점은 쓰지 않는다. 배점은 서버가 F5 파트 지수로 계산한다.
- 규칙이 [봉인]으로 비어 있어 판단이 갈리는 곳은 문항평가에 「[가정] …」으로 밝힌다.
- 해설은 이 문항이 무엇을 묻는지(급소), 왜 그 조각들로 나뉘는지를 학생·교사가 읽을 말로 쓴다.
- 모든 출력은 한국어.

=== HMOS 루브릭 구현 명세 (F2~F6 원문) ===
${loadSpecRules()}`;

const 파트들 = ['①', '②', '③', '④', '⑤'];
const 파트이름 = { '①': '근거대기', '②': '세우기', '③': '풀기', '④': '답구하기', '⑤': '표현' };
const 파트지수 = { '①': 2, '②': 3, '③': 2, '④': 2, '⑤': 1 }; // 명세 F5 1층 (고정 2:3:2:2:1)

/** 구조화 출력 스키마 — 명세 F2~F6에 따라 역산한 조각·모범답안·해설·문항평가 */
const OUTPUT_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['pieces', 'commentary', 'item_review'],
    properties: {
      pieces: {
        type: 'array',
        description: '파트 순서(①→⑤)로 늘어선 조각',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['part', 'element', 'entity', 'criterion', 'model_piece'],
          properties: {
            part: { type: 'string', enum: 파트들 },
            element: { type: 'string', enum: ['b', 'd', 'c', 'p', 'k', 'q', 'none'] },
            entity: { type: 'string', description: '이 조각이 다루는 문항 속 실체 (문항 표현 그대로)' },
            criterion: { type: 'string', description: 'F4 충족조건 — O/X 경계' },
            model_piece: { type: 'string', description: 'F6 모범조각 — 이 조각을 채운 답안 문장/식' },
          },
        },
      },
      commentary: { type: 'string', description: '해설' },
      item_review: { type: 'array', items: { type: 'string' }, description: '문항평가 경고·[가정]' },
    },
  },
};

/** 문항의 「[N점]」을 총배점으로 — 없으면 10 */
function totalScore(q) {
  const m = q.match(/\[(\d+(?:\.\d+)?)\s*점\]/);
  return m ? { 총배점: Number(m[1]), 가정: null } : { 총배점: 10, 가정: '[가정] 문항에 [N점] 표기가 없어 총배점 10' };
}

app.post('/api/generate', async (req, res) => {
  const { 문항원문, 파이프라인, 논제, 제시문, analysis } = req.body || {};
  const q = (문항원문 || '').trim();
  if (!q || !analysis) { res.status(400).json({ error: '문항원문·analysis가 필요합니다' }); return; }
  if (!analysis.급소들 || !analysis.급소들.length) {
    res.status(422).json({ error: `급소가 서지 않아 루브릭을 만들 수 없습니다 (${analysis.급소실패 || '급소 없음'})` });
    return;
  }

  const 계열 = 파이프라인 === 'A' ? '수리' : '인문사회국어';
  const user = [
    `계열: ${계열} (파이프라인 ${파이프라인 || '—'})`,
    `문항:\n${q}`,
    논제 ? `논제:\n${논제}` : '',
    제시문 && 제시문.length ? `제시문:\n${제시문.map(p => `[${p.id}] ${p.텍스트}`).join('\n')}` : '',
    `HMOS 인식 결과 (그대로 받을 것):\n${JSON.stringify({
      조합: analysis.조합,
      노드: analysis.nodes,
      급소_k: analysis.급소들,
    }, null, 2)}`,
  ].filter(Boolean).join('\n\n');

  let msg;
  try {
    msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // 안전 분류기가 거절하면 서버가 권장 모델로 다시 돌린다
      system: SYSTEM,
      output_config: { format: OUTPUT_FORMAT },
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) { res.status(500).json({ error: 'API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인' }); return; }
    if (e instanceof Anthropic.RateLimitError) { res.status(429).json({ error: 'API 요청 한도 초과 — 잠시 뒤 다시' }); return; }
    if (e instanceof Anthropic.APIError) { res.status(502).json({ error: `Claude API 오류 ${e.status}: ${e.message}` }); return; }
    res.status(502).json({ error: 'Claude API 연결 실패: ' + e.message });
    return;
  }

  if (msg.stop_reason === 'refusal') { res.status(502).json({ error: `모델이 거절함 (${msg.stop_details?.category ?? '분류 없음'})` }); return; }
  if (msg.stop_reason === 'max_tokens') { res.status(502).json({ error: '응답이 max_tokens에서 잘림' }); return; }
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let out = null;
  try { out = JSON.parse(text); } catch (_) {}
  if (!out || !Array.isArray(out.pieces) || !out.pieces.length) {
    res.status(502).json({ error: `제안을 받지 못함 (stop_reason: ${msg.stop_reason})` });
    return;
  }

  // F5 배점 — 1층 파트 지수, 2층 파트 안 조각 수로 균등 분배
  const { 총배점, 가정 } = totalScore(q);
  const 조각수 = Object.fromEntries(파트들.map(p => [p, out.pieces.filter(x => x.part === p).length]));
  const 배점 = p => 총배점 * 파트지수[p] / 10 / 조각수[p];
  const 빈파트 = 파트들.filter(p => !조각수[p]);

  const 축 = out.pieces.map(x => ({
    소문항: `${x.part} ${파트이름[x.part]}`,
    이름: `${x.element === 'none' ? '' : x.element + ' · '}${x.entity}`,
    배점: Math.round(배점(x.part) * 100) / 100,
    판정: x.criterion,
  }));

  const 모범답안 = out.pieces.map(x => x.model_piece).join(' ');
  const keywords = analysis.급소들.map(p => p.keyword || p.entity).filter(Boolean);
  const 급소포함 = keywords.some(k => 모범답안.includes(k));

  res.json({
    model: msg.model,
    usage: msg.usage,
    단계4: {
      제안: true,
      축,
      공통정책: [
        `총배점 ${총배점} · 파트 지수 ①2 : ②3 : ③2 : ④2 : ⑤1 (명세 F5 1층, 고정)`,
        '파트 안 조각당 배점 = 파트 배점 ÷ 조각 수 (F5 2층)',
        '[가정] 반올림 [봉인④-a] 비어 있음 — 소수 둘째 자리까지 표시',
        '[게이트] ④(k) X → 다른 파트 상한, 상한 값은 봉인이라 비워 둠',
        ...(가정 ? [가정] : []),
        ...(빈파트.length ? [`조각 없는 파트: ${빈파트.join(' ')} — 그 파트 배점은 배분되지 않음`] : []),
        ...out.item_review,
      ],
    },
    단계5: {
      제안: true,
      인식대조: {
        급소포함,
        일치여부: null, // GJ(급소일치판정)는 봉인⑤⑥ — 비어 있어 판정하지 않는다
        플래그: 급소포함 ? null : `모범답안에 급소 keyword(${keywords.join(' / ')})가 글자로 나타나지 않음 — 교사 확인`,
      },
      조각: out.pieces.map(x => ({ 이름: `${x.part} ${파트이름[x.part]}${x.element === 'none' ? '' : ' · ' + x.element}`, 내용: x.model_piece })),
      해설: out.commentary,
    },
  });
});

app.listen(PORT, () => console.log('HMOS ' + PORT));
