// q8 국어 문항2 답안 이미지 폴더를 OCR → HMOS 5색 2단계로 채점해 학생별 JSON으로 저장한다.
//  1단계 — 문항 5색 분해: 확정 급소(채점기준 「급소 (확정)」)의 B·D·K를 쓴다. 모델이 매번 분해하지 않는다.
//  2단계 — 학생 답안 5색 분해 후 급소 대조: 학생이 B를 소환했는지, D를 바른 짝으로 썼는지,
//          B×D→Q 경로를 펴냈는지 대조만 한다. 모델은 점수를 매기지 않는다.
// 판정(O/X·논리연결)과 점수는 대조 결과로 코드가 정한다 (검증/q8_문항2_채점기준.json 「점수 계산」 표).
// 사용: node --env-file=.env scripts/grade-q8-item2.mjs <이미지폴더> [출력폴더]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const SYMBOLS = ["ⓐ", "ⓑ"];
const LINK = { "ⓐ": "(라) 능력주의", "ⓑ": "(마) 타자배척" };

const dir = process.argv[2];
const OUT_DIR = process.argv[3] ?? "검증/q8_문항2";
if (!dir) {
  console.error("사용: node --env-file=.env scripts/grade-q8-item2.mjs <이미지폴더> [출력폴더]");
  process.exit(1);
}

const rubric = JSON.parse(fs.readFileSync("검증/q8_문항2_채점기준.json", "utf8"));
const original = fs.readFileSync("검증/q8_원문.md", "utf8");
const passages = original.slice(original.indexOf("## (가)"), original.indexOf("## 문항"));
const client = new Anthropic({
  defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID },
});

const OCR_SYSTEM = `당신은 한국어 손글씨 답안을 옮겨 적는 OCR 담당입니다.
이미지 속 학생 답안을 보이는 그대로 옮기십시오. 고치거나 보태지 마십시오.

[문항 문맥 — 손글씨 판독용]
문항: ${rubric.문항}
자주 나오는 낱말: (나), (라), (마), ⓐ, ⓑ, 틀딱, 쪽발이, 능력주의, 능력, 경쟁, 과열, 노인, 멸시, 타자, 배척, 거부, 혐오, 차별, 민족, 일본인, 익명, 편견
흘려 쓴 글자가 이 낱말로 읽히면 이 낱말로 적으십시오.
단, 학생이 다른 낱말을 썼으면 그대로 적습니다. 정답으로 바꿔 적지 마십시오.
- 손글씨 a·b 또는 ①②로 보이는 기호는 ⓐ·ⓑ로 옮깁니다.
- 줄바꿈은 무시하고 한 문단으로 이어 적습니다.
- '(2번 답안)' 같은 인쇄된 머리말은 빼고 답안만 적습니다.
- 알아볼 수 없는 글자는 [?]로 표시합니다.
- 답안 텍스트만 출력하십시오.`;

// ── 1단계: 문항 5색 분해 (확정 급소) ──

const item = { 문항: rubric.문항, Q: "차별·혐오 표현 발생 원인 분석·서술", 급소: rubric["급소 (확정 2026-10-18)"] };

// ── 2단계: 학생 답안 5색 분해 후 급소 대조 ──

const contrastSystem = (item) => `당신은 HMOS 급소 대조기입니다. 판단하거나 점수를 매기지 않습니다.
학생 답안을 5색으로 분해한 뒤, 아래 문항 급소 K에 닿았는지 항목별로 대조만 합니다.

[문항 5색 분해 — 1단계, 확정 급소]
${JSON.stringify(item, null, 1)}

[제시문]
${passages}

[항목별 대조 — ⓐ·ⓑ 각각]
1. B소환: 학생이 그 항목의 대상(ⓐ 노인 집단 / ⓑ 일본인 집단)을 불러냈는가.
   표현(틀딱·쪽발이)이나 기호(ⓐ·ⓑ)로 그 항목을 가리키고 원인을 쓰면 소환입니다.
   「(나)의 ⓑ의 원인은 …」처럼 기호로 항목을 지목했으면 대상 집단 낱말이 없어도 반드시 B소환 true. 「뒤처진 사람」「다른 민족·나라」처럼 대상을 일반화해 써도 소환.
2. D짝: 학생이 그 항목에 쓴 원인 개념이
   - "정확": 짝이 맞는 제시문의 D (ⓐ↔(라) 능력주의·과열 경쟁 / ⓑ↔(마) 타자 거부·배척 — 낱말 없이 내용만 있어도 정확)
   - "반대": 다른 항목의 D를 끌어옴 (ⓐ에 타자 배척, ⓑ에 능력주의) 또는 기호를 바꿔 붙임
   - "없음": D가 없음 (표현 뜻풀이·일반론만)
3. 경로: B×D→Q, 즉 D가 어떻게 차별·혐오 표현 발생으로 이어지는지
   - "폄": D → 멸시·차별·거부로 이어지는 작동 과정을 서술 (대상 집단을 직접 쓰지 않아도 과정이 있으면 폄)
   - "막연": D는 있으나 '관련/연관 있다', 감정 낱말 하나로 끝남
   - "없음": D 없음
   확정 사례 — 폄:
    ⓐ "능력주의 … 개인의 능력에 따라 지위와 보상을 분배하는 게 정당하다는 이념 … 과도한 경쟁과 차별을 정당화" (학생1)
    ⓐ "극단한 경쟁으로 인한 능력주의의 대두 … 경쟁에서 뒤처진 사람을 멸시하고 차별하는 태도를 정당화" (학생3)
    ⓑ "현실 속 타자가 다가오는 것을 불안해하거나 부담스러워하며 타자를 거부하려는 움직임에서 혐오 표현이 강해진다" (학생3)
   확정 사례 — 막연:
    ⓑ "쪽발이로 타자를 부담스러워하는 원인과 연관이 있다" (학생1)
    ⓑ "다른 나라의 문화에 거부감을 느끼고 만들어 낸 것" (학생4)
4. 급소근거: 답안의 해당 구절을 인용하고 K의 어느 고리(B·D·→Q)에 닿았고 어디서 끊겼는지 한 줄.

[답안 전체]
- 일반나열: 답안이 (라)·(마) 내용을 요약·나열이라도 끌어왔으면 true, 전혀 없으면 false.
- 판단근거: 급소 기반 한 줄.`;

const CONTRAST_SCHEMA = {
  type: "object",
  properties: {
    대조: {
      type: "array",
      items: {
        type: "object",
        properties: {
          기호: { type: "string", enum: SYMBOLS },
          B소환: { type: "boolean" },
          D짝: { type: "string", enum: ["정확", "반대", "없음"] },
          경로: { type: "string", enum: ["폄", "막연", "없음"] },
          급소근거: { type: "string" },
        },
        required: ["기호", "B소환", "D짝", "경로", "급소근거"],
        additionalProperties: false,
      },
    },
    일반나열: { type: "boolean" },
    판단근거: { type: "string" },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["대조", "일반나열", "판단근거", "오류목록"],
  additionalProperties: false,
};

// 대조 → 판정 (확정): B 소환 + D 정확 → O, K 경로를 폈으면 강·아니면 약 / B만·D 없음·일반 나열·반대 → X
function judge(c) {
  if (!c.B소환 || c.D짝 !== "정확") return { 판정: "X", 논리연결: "없음" };
  return { 판정: "O", 논리연결: c.경로 === "폄" ? "강" : "약" };
}

// 채점기준 「점수 계산」 표
function score([a, b], 일반나열) {
  const tag = (c) => (c.판정 === "O" ? `O${c.논리연결}` : "X");
  const pair = [tag(a), tag(b)].sort().join("+");
  const table = { "O강+O강": 4, "O강+O약": 3, "O강+X": 2, "O약+O약": 2, "O약+X": 1 };
  if (pair in table) return table[pair];
  return 일반나열 ? 1 : 0;
}

const textOf = (res) => res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

async function structured(system, content, schema, maxTokens) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });
  return JSON.parse(textOf(res));
}

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

fs.mkdirSync(OUT_DIR, { recursive: true });


const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
const summary = {};

for (const file of files) {
  const name = path.parse(file).name;
  const answer = await ocr(path.join(dir, file));
  const contrast = await structured(contrastSystem(item), `[학생 답안]\n${answer}\n\nⓐ·ⓑ를 급소 K와 대조하십시오.`, CONTRAST_SCHEMA, 4000);
  const byKey = Object.fromEntries(contrast.대조.map((c) => [c.기호, c]));
  const 채점 = SYMBOLS.map((s) => {
    const c = byKey[s] ?? { B소환: false, D짝: "없음", 경로: "없음", 급소근거: "대조 결과 누락" };
    return { 기호: s, 연결: LINK[s], ...judge(c), B소환: c.B소환, D짝: c.D짝, 경로: c.경로, 판단근거: c.급소근거 };
  });
  const 점수 = score(채점, contrast.일반나열);
  const result = {
    문항: "q8_문항2", 학생: name, OCR: answer, 채점, 일반나열: contrast.일반나열, 점수, 총배점: rubric.총배점,
    판단근거: contrast.판단근거, 오류목록: contrast.오류목록, 엔진: MODEL, 방식: "HMOS 5색 2단계 (문항 분해 → 급소 대조)",
  };
  fs.writeFileSync(path.join(OUT_DIR, `q8_문항2_${name}.json`), JSON.stringify(result, null, 2) + "\n");
  summary[name] = 점수;
  console.log(`${name}\t${점수}\t${채점.map((c) => c.판정 + (c.판정 === "O" ? c.논리연결 : "")).join(" ")}`);
}

console.log(`\n완료 ${files.length}건`);
console.log(JSON.stringify(summary));
