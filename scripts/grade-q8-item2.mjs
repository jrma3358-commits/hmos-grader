// q8 국어 문항2 답안 이미지 폴더를 OCR → 채점해 학생별 JSON으로 저장한다.
// 채점 규칙은 검증/q8_문항2_채점기준.json을 따른다. 모델은 항목 판정(O/X·논리연결)만 내고,
// 점수는 채점기준의 「점수 계산」 표대로 코드가 정한다.
// 사용: node --env-file=.env scripts/grade-q8-item2.mjs <이미지폴더>
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const OUT_DIR = "검증/q8_문항2";
const SYMBOLS = ["ⓐ", "ⓑ"];
const LINK = { "ⓐ": "(라) 능력주의", "ⓑ": "(마) 타자배척" };

const dir = process.argv[2];
if (!dir) {
  console.error("사용: node --env-file=.env scripts/grade-q8-item2.mjs <이미지폴더>");
  process.exit(1);
}

const rubric = JSON.parse(fs.readFileSync("검증/q8_문항2_채점기준.json", "utf8"));
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

const GRADE_SYSTEM = `당신은 국어 서술형 채점자입니다. 아래 채점 기준을 그대로 적용하십시오.
점수는 매기지 마십시오. 항목별 판정만 냅니다(점수는 코드가 계산).

[채점 기준]
${JSON.stringify(rubric, null, 1)}

[항목 판정 방법]
- ⓐ는 (라) 능력주의, ⓑ는 (마) 타자 배척과의 연결만 봅니다. 반대로 연결(ⓐ↔(마), ⓑ↔(라))했으면 그 항목은 X.
- 판정 O: 핵심개념(ⓑ는 타자 거부·배척 내용이면 낱말 없어도 인정)을 해당 표현이 생기는 원인으로 연결.
- 판정 X: 핵심개념 없음, (라)·(마) 내용 단순 요약에 그침, 반대 연결, 미작성. 이때 논리연결은 "없음".
- X와 약의 경계: 해당 항목에 핵심개념(능력주의 / 타자 거부·배척)을 원인으로 썼으면, 작동 과정이 없거나
  문장이 엉성해도 X가 아니라 O·약입니다. 예: "ⓐ는 (라)에 따르면 능력주의에 의해 발생한다" → O·약.
  X는 핵심개념 자체가 그 항목에 없을 때만 씁니다.
- 논리연결 강: 핵심개념이 어떻게 차별·혐오로 이어지는지(원인의 작동 과정)가 서술됨.
  대상 집단(노인/일본인)을 직접 쓰지 않아도, 원인 → 차별·멸시·거부로 이어지는 과정이 있으면 강.
  확정 사례(강):
   ⓐ "능력주의 … 개인의 능력에 따라 지위와 보상을 분배하는 게 정당하다는 이념 … 과도한 경쟁과 차별을 정당화" (학생1, 3점)
   ⓐ "극단한 경쟁으로 인한 능력주의의 대두 … 경쟁에서 뒤처진 사람을 멸시하고 차별하는 태도를 정당화" (학생3, 4점)
   ⓑ "현실 속 타자가 다가오는 것을 불안해하거나 부담스러워하며 타자를 거부하려는 움직임에서 혐오 표현이 강해진다" (학생3, 4점)
- 논리연결 약: 핵심개념·내용은 있으나 원인의 작동 과정 없이 '관련/연관이 있다', 감정 낱말 하나로 끝남.
  확정 사례(약):
   ⓑ "쪽발이로 타자를 부담스러워하는 원인과 연관이 있다" (학생1, 3점)
   ⓑ "다른 나라의 문화에 거부감을 느끼고 만들어 낸 것" (학생4, 3점)
- 단순요약: ⓐ·ⓑ 판정과 별개로, 답안이 (라)·(마)의 내용을 요약이라도 활용했으면 true, 전혀 활용하지 않았으면 false.
- 판단근거: 한 줄.`;

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    채점: {
      type: "array",
      items: {
        type: "object",
        properties: {
          기호: { type: "string", enum: SYMBOLS },
          판정: { type: "string", enum: ["O", "X"] },
          논리연결: { type: "string", enum: ["강", "약", "없음"] },
          판단근거: { type: "string" },
        },
        required: ["기호", "판정", "논리연결", "판단근거"],
        additionalProperties: false,
      },
    },
    단순요약: { type: "boolean" },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["채점", "단순요약", "오류목록"],
  additionalProperties: false,
};

// 채점기준 「점수 계산」 표
function score([a, b], 단순요약) {
  const tag = (c) => (c.판정 === "O" ? `O${c.논리연결}` : "X");
  const pair = [tag(a), tag(b)].sort().join("+");
  const table = { "O강+O강": 4, "O강+O약": 3, "O강+X": 2, "O약+O약": 2, "O약+X": 1 };
  if (pair in table) return table[pair];
  return 단순요약 ? 1 : 0;
}

const textOf = (res) => res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

async function ocr(imagePath) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
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

async function grade(answer) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: GRADE_SYSTEM,
    output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } },
    messages: [{ role: "user", content: `[학생 답안]\n${answer}\n\nⓐ·ⓑ 두 항목을 채점하십시오.` }],
  });
  return JSON.parse(textOf(res));
}

const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = {};

for (const file of files) {
  const name = path.parse(file).name;
  const answer = await ocr(path.join(dir, file));
  const graded = await grade(answer);
  const byKey = Object.fromEntries(graded.채점.map((g) => [g.기호, g]));
  const 채점 = SYMBOLS.map((s) => {
    const g = byKey[s] ?? { 판정: "X", 논리연결: "없음", 판단근거: "채점 결과 누락" };
    // O인데 논리연결 없음, X인데 강/약 같은 어긋남은 판정 쪽으로 맞춘다
    const 논리연결 = g.판정 === "X" ? "없음" : g.논리연결 === "없음" ? "약" : g.논리연결;
    return { 기호: s, 연결: LINK[s], 판정: g.판정, 논리연결, 판단근거: g.판단근거 };
  });
  const 점수 = score(채점, graded.단순요약);
  const result = { 문항: "q8_문항2", 학생: name, OCR: answer, 채점, 단순요약: graded.단순요약, 점수, 총배점: rubric.총배점, 오류목록: graded.오류목록, 엔진: MODEL };
  fs.writeFileSync(path.join(OUT_DIR, `q8_문항2_${name}.json`), JSON.stringify(result, null, 2) + "\n");
  summary[name] = 점수;
  console.log(`${name}\t${점수}\t${채점.map((c) => c.판정 + (c.판정 === "O" ? c.논리연결 : "")).join(" ")}`);
}

console.log(`\n완료 ${files.length}건`);
console.log(JSON.stringify(summary));
