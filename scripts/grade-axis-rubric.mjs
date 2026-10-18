// 저장된 4축 루브릭(검증/<이름>_루브릭.json — dashboard2 탭2 문항분석, /api/axis-rubric)으로 답안 이미지를 OCR → 채점해 학생별 JSON으로 저장한다.
//  1단계 — 루브릭: 축마다 엔진 5색 노드(도달노드)가 정해져 있다. 여기서 다시 분해하지 않는다.
//  2단계 — 학생 답안 노드 대조: 노드마다 학생 답이 닿았는지 대조만 한다. 모델은 판정하지 않는다.
// 판정(축 O/X)은 대조 결과로 코드가 정한다 — 그 축의 도달노드에 모두 닿으면 O.
// 점수 = O인 축 개수 × (총배점 ÷ 4축) — 임의 배점 없음 (오종래 2026-10-18)
// --cells=<항목축.json>: 4축을 항목(ⓐ·ⓑ …)별로 나눈 칸마다 O/X (오종래 2026-10-18 q8 문항2) — 칸 기준은 그 파일 그대로,
//   점수 = O 칸 개수 × (총배점 ÷ 칸 수). 노드 대조는 하지 않는다
// 사용: node --env-file=.env scripts/grade-axis-rubric.mjs <루브릭.json> <제시문.md> <이미지폴더> <출력폴더> [앞 N장] [--cells=<항목축.json>]
//   출력: <출력폴더>/<루브릭 이름>_vv_<번호>.json (이미지 vvv_01.png → vv_01)
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const AXES = ["논점소환", "세우기", "논증펴기", "답표현하기"];

const argv = process.argv.slice(2);
const cellsPath = argv.find((a) => a.startsWith("--cells="))?.slice("--cells=".length);
const [rubricPath, passagePath, dir, OUT_DIR, limit] = argv.filter((a) => !a.startsWith("--"));
if (!rubricPath || !passagePath || !dir || !OUT_DIR) {
  console.error("사용: node --env-file=.env scripts/grade-axis-rubric.mjs <루브릭.json> <제시문.md> <이미지폴더> <출력폴더> [앞 N장] [--cells=<항목축.json>]");
  process.exit(1);
}

const rubric = JSON.parse(fs.readFileSync(rubricPath, "utf8"));
const cellSpec = cellsPath ? JSON.parse(fs.readFileSync(cellsPath, "utf8")) : null;
// 칸 = 축 × 항목 (축 차례 → 항목 차례)
const cells = cellSpec ? AXES.flatMap((a) => cellSpec.항목.map((t) => ({ id: `${a}·${t}`, 축: a, 항목: t, 기준: cellSpec.축[a][t] }))) : [];
const passages = fs.readFileSync(passagePath, "utf8");
const base = path.basename(rubricPath).replace(/_루브릭\.json$/, "");
const nodes = rubric.엔진.노드;
const nodeOf = (id) => nodes.find((n) => n.id === id);
// 대조할 노드 = 네 축 도달노드의 합집합 (나온 차례)
const targets = nodes.filter((n) => AXES.some((a) => rubric["4축루브릭"][a].도달노드.includes(n.id)));
const client = new Anthropic({
  defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID },
});

const OCR_SYSTEM = `당신은 한국어 손글씨 답안을 옮겨 적는 OCR 담당입니다.
이미지 속 학생 답안을 보이는 그대로 옮기십시오. 고치거나 보태지 마십시오.

[문항 문맥 — 손글씨 판독용]
문항: ${rubric.문항글}
제시문:
${passages}
학생은 문항과 제시문의 낱말을 자주 씁니다. 흘려 쓴 글자가 이 낱말로 읽히면 이 낱말로 적으십시오.
단, 학생이 다른 낱말을 썼으면 그대로 적습니다. 정답으로 바꿔 적지 마십시오.
- 손글씨 a·b 또는 ①②로 보이는 기호는 ⓐ·ⓑ로 옮깁니다. 제시문 기호 (가)~(바)는 학생이 쓴 그대로 적습니다.
- 줄바꿈은 무시하고 한 문단으로 이어 적습니다.
- '(2번 답안)' 같은 인쇄된 머리말은 빼고 답안만 적습니다.
- 알아볼 수 없는 글자는 [?]로 표시합니다.
- 답안 텍스트만 출력하십시오.`;

const CONTRAST_SYSTEM = `당신은 HMOS 급소 대조기입니다. 판단하거나 점수를 매기지 않습니다.
학생 답안이 문항의 엔진 5색 노드 하나하나에 닿았는지 대조만 합니다.

[문항]
${rubric.문항글}

[제시문]
${passages}

[문항 5색 · 급소 K — 엔진]
${JSON.stringify({ "5색": rubric["5색"], 급소K: rubric.급소K, 급소실체: rubric.급소실체 }, null, 1)}

[대조할 노드 — id · 색 · 실체]
${targets.map((n) => `${n.id} · ${n.색} · ${n.실체}`).join("\n")}

[노드 대조 — 노드마다]
1. 도달: 학생 답이 그 노드가 문항에서 맡은 자리를 채웠는가.
   - B(대상)·P(상황)·D(정의) 노드: 학생 답이 그 대상·개념을 제시문 내용으로 짚었으면 도달. 문항 낱말(예: 「핵심 개념」)을 되풀이만 하고 내용이 없으면 미도달.
     「(나)의 핵심 개념」처럼 제시문에 걸린 노드는 그 제시문의 핵심 개념을 학생이 실제로 썼을 때만 도달. 다른 제시문의 개념을 끌어오면 미도달.
   - C(제약) 노드(예: 「연결하여」): 문항이 요구한 짝(어느 대상을 어느 제시문 개념과)으로 이었으면 도달. 짝이 바뀌었거나 따로 늘어놓기만 했으면 미도달.
   - Q(질문) 노드: 「분석하고」는 개념이 어떻게 그 결과(차별·혐오 표현 발생)로 이어지는지 과정을 풀었으면 도달 — 「관련 있다」로 끝나면 미도달. 「서술하시오」는 요구한 항목 각각을 문장으로 써 냈으면 도달.
   - 미작성이면 모두 미도달.
2. 인용: 도달을 보인 답안 구절 그대로 (미도달이면 "").
3. 근거: 왜 도달·미도달인지 한 줄.
학생 답안지의 제시문 기호가 문항과 다르면 제시문 머리의 [기호 대응]으로 읽습니다.`;

const CONTRAST_SCHEMA = {
  type: "object",
  properties: {
    대조: {
      type: "array",
      items: {
        type: "object",
        properties: {
          노드: { type: "string", enum: targets.map((n) => n.id) },
          도달: { type: "boolean" },
          인용: { type: "string" },
          근거: { type: "string" },
        },
        required: ["노드", "도달", "인용", "근거"],
        additionalProperties: false,
      },
    },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["대조", "오류목록"],
  additionalProperties: false,
};

const CELL_SYSTEM = `당신은 HMOS 급소 대조기입니다. 판단하거나 점수를 매기지 않습니다.
학생 답안이 4축 × 항목 칸 하나하나의 기준에 닿았는지 대조만 합니다.

[문항]
${rubric.문항글}

[제시문]
${passages}

[문항 5색 · 급소 K — 엔진]
${JSON.stringify({ "5색": rubric["5색"], 급소K: rubric.급소K, 급소실체: rubric.급소실체 }, null, 1)}

[칸 — id · 기준]
${cells.map((c) => `${c.id} · ${c.기준}`).join("\n")}

[칸 대조 — 칸마다]
1. 도달: 학생 답의 그 항목 부분이 그 칸 기준에 닿았는가. 다른 항목에 쓴 내용으로 이 항목 칸을 채우지 않는다. 미작성이면 미도달.
2. 인용: 도달을 보인 답안 구절 그대로 (미도달이면 "").
3. 근거: 왜 도달·미도달인지 한 줄.
학생 답안지의 제시문 기호가 문항과 다르면 제시문 머리의 [기호 대응]으로 읽습니다.`;

const CELL_SCHEMA = {
  type: "object",
  properties: {
    대조: {
      type: "array",
      items: {
        type: "object",
        properties: {
          칸: { type: "string", enum: cells.length ? cells.map((c) => c.id) : ["-"] },
          도달: { type: "boolean" },
          인용: { type: "string" },
          근거: { type: "string" },
        },
        required: ["칸", "도달", "인용", "근거"],
        additionalProperties: false,
      },
    },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["대조", "오류목록"],
  additionalProperties: false,
};

const textOf = (res) => res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

async function ocr(imagePath) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    temperature: 0,
    system: OCR_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: fs.readFileSync(imagePath).toString("base64") } },
        { type: "text", text: "이 답안을 옮겨 적으십시오." },
      ],
    }],
  });
  return textOf(res);
}

async function contrast(answer) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0,
    system: CONTRAST_SYSTEM,
    output_config: { format: { type: "json_schema", schema: CONTRAST_SCHEMA } },
    messages: [{ role: "user", content: `[학생 답안]\n${answer}\n\n노드 ${targets.map((n) => n.id).join(", ")}를 하나씩 대조하십시오.` }],
  });
  return JSON.parse(textOf(res));
}

const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().slice(0, Number(limit) || undefined);
fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = {};

for (const file of files) {
  const name = "vv_" + (path.parse(file).name.match(/(\d+)$/) || ["", path.parse(file).name])[1];
  const answer = await ocr(path.join(dir, file));
  if (cellSpec) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      temperature: 0,
      system: CELL_SYSTEM,
      output_config: { format: { type: "json_schema", schema: CELL_SCHEMA } },
      messages: [{ role: "user", content: `[학생 답안]\n${answer}\n\n칸 ${cells.length}개를 하나씩 대조하십시오.` }],
    });
    const graded = JSON.parse(textOf(res));
    const byCell = Object.fromEntries(graded.대조.map((c) => [c.칸, c]));
    // 칸 판정 — 기준에 닿으면 O. 점수 = O 개수 × (총배점 ÷ 칸 수)
    const 채점 = cells.map((c) => {
      const m = byCell[c.id] ?? { 도달: false, 인용: "", 근거: "대조 결과 누락" };
      return { 축: c.축, 항목: c.항목, 기준: c.기준, 판정: m.도달 ? "O" : "X", 인용: m.인용, 근거: m.근거 };
    });
    const 도달수 = 채점.filter((c) => c.판정 === "O").length;
    const 점수 = Math.round(도달수 * (rubric.총배점 / cells.length) * 100) / 100;
    const result = {
      문항: base, 학생: name, 이미지: file, OCR: answer, 채점, 도달수, 칸수: cells.length, 점수, 총배점: rubric.총배점, 오류목록: graded.오류목록,
      루브릭: path.basename(rubricPath), 항목축: path.basename(cellsPath), 엔진: rubric.엔진.commit, 모델: MODEL,
      방식: `4축 × 항목 (칸 O/X, 점수 = O 개수 × 총배점÷${cells.length})`,
    };
    fs.writeFileSync(path.join(OUT_DIR, `${base}_${name}.json`), JSON.stringify(result, null, 2) + "\n");
    summary[name] = 점수;
    console.log(`${name}\t${점수}\t${AXES.map((a) => a + " " + 채점.filter((c) => c.축 === a).map((c) => c.항목 + c.판정).join("")).join(" · ")}`);
    continue;
  }
  const graded = await contrast(answer);
  const byNode = Object.fromEntries(graded.대조.map((c) => [c.노드, c]));
  const 노드대조 = targets.map((n) => {
    const c = byNode[n.id] ?? { 도달: false, 인용: "", 근거: "대조 결과 누락" };
    return { 노드: n.id, 색: n.색, 실체: n.실체, 도달: c.도달, 인용: c.인용, 근거: c.근거 };
  });
  const reached = (id) => 노드대조.find((c) => c.노드 === id)?.도달 === true;
  // 축 판정 — 도달노드에 모두 닿으면 O. 점수 = O 개수 × (총배점 ÷ 4축)
  const 채점 = AXES.map((a) => {
    const x = rubric["4축루브릭"][a];
    return { 축: a, 기준: x.기준, 판정: x.도달노드.every(reached) ? "O" : "X", 도달노드: x.도달노드, 못닿은노드: x.도달노드.filter((id) => !reached(id)).map((id) => `${id} ${nodeOf(id)?.색} ${nodeOf(id)?.실체}`) };
  });
  const 도달수 = 채점.filter((c) => c.판정 === "O").length;
  const 점수 = Math.round(도달수 * (rubric.총배점 / AXES.length) * 100) / 100;
  const result = {
    문항: base, 학생: name, 이미지: file, OCR: answer, 채점, 도달수, 점수, 총배점: rubric.총배점, 노드대조, 오류목록: graded.오류목록,
    루브릭: path.basename(rubricPath), 엔진: rubric.엔진.commit, 모델: MODEL, 방식: "4축 루브릭 (엔진 노드 도달 대조 → 축 O/X, 점수 = O 개수 × 총배점÷4)",
  };
  fs.writeFileSync(path.join(OUT_DIR, `${base}_${name}.json`), JSON.stringify(result, null, 2) + "\n");
  summary[name] = 점수;
  console.log(`${name}\t${점수}\t${채점.map((c) => c.판정).join("")}\t${채점.filter((c) => c.판정 === "X").map((c) => c.축 + ":" + c.못닿은노드.join("/")).join(" ")}`);
}

console.log(`\n완료 ${files.length}건`);
console.log(JSON.stringify(summary));
