// q8 국어 문항1 답안 이미지 폴더를 OCR → 채점해 학생별 JSON으로 저장한다.
// 채점 규칙은 검증/q8_문항1_채점기준.json(확정본)을 따른다. 점수는 O 개수로 코드가 센다.
// 사용: node --env-file=.env scripts/grade-q8-item1.mjs <이미지폴더>
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const OUT_DIR = "검증/q8_문항1";
const SYMBOLS = ["ⓐ", "ⓑ", "ⓒ", "ⓓ"];

const dir = process.argv[2];
if (!dir) {
  console.error("사용: node --env-file=.env scripts/grade-q8-item1.mjs <이미지폴더>");
  process.exit(1);
}

const rubric = JSON.parse(fs.readFileSync("검증/q8_문항1_채점기준.json", "utf8"));
const client = new Anthropic({
  defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID },
});

const OCR_SYSTEM = `당신은 한국어 손글씨 답안을 옮겨 적는 OCR 담당입니다.
이미지 속 학생 답안을 보이는 그대로 옮기십시오. 고치거나 보태지 마십시오.

[문항 문맥 — 손글씨 판독용]
문항: ${rubric.문항}
(나)의 표현: ⓐ 틀딱, ⓑ 쪽발이, ⓒ 흑형, ⓓ 여사님
(가)의 언어 공동체 구성 요인: ${rubric.제시문["(가) 구성 요인"].join(", ")}
학생은 이 낱말들을 자주 씁니다. 흘려 쓴 글자가 이 낱말로 읽히면 이 낱말로 적으십시오.
단, 학생이 다른 낱말(오답 요인 포함)을 썼으면 그대로 적습니다. 정답으로 바꿔 적지 마십시오.
- 원문자 기호(ⓐ ⓑ ⓒ ⓓ)는 학생이 쓴 대로 적되, 손글씨 ①②·a·b 등으로 보이면 해당 위치의 ⓐ~ⓓ로 옮깁니다.
- 줄바꿈은 무시하고 한 문단으로 이어 적습니다.
- '(1번 답안)' 같은 인쇄된 머리말은 빼고 답안만 적습니다.
- 알아볼 수 없는 글자는 [?]로 표시합니다.
- 답안 텍스트만 출력하십시오.`;

const GRADE_SYSTEM = `당신은 국어 서술형 채점자입니다. 아래 채점 기준(확정본)을 그대로 적용하십시오.

[채점 기준]
${JSON.stringify(rubric, null, 1)}

[판정 규칙 요약]
- 판정은 O 또는 X만 씁니다(△ 쓰지 않음).
- O: 해당 항목(표현)에 정답 요인을 연결했거나, 요인 없이 정답 집단(공동체)만 서술한 경우.
- X: 요인·집단 모두 없음, 오답 요인 연결(오답 요인이 섞인 경우 포함), 미작성.
- 여러 표현과 여러 요인을 나열한 경우 나열 순서로 대응되면 O.
  확정 사례: "쪽발이와 흑형은 각각 일본과 흑인 혐오 표현으로 거주 지역, 민족, 인종에 해당된다"
  → ⓑ 쪽발이: 거주 지역이 섞임 → X / ⓒ 흑형: 나열 끝의 인종이 흑형에 대응 → O.
  즉 오답 요인이 섞인 판정은 그 요인이 걸리는 항목에만 적용하고, 순서상 정답 요인이 대응하는 다른 항목은 O.
- 표현·집단 이름의 오기는 항목 기호와 요인이 맞으면 O.
- 학생요인: 학생이 그 항목에 쓴 요인 낱말. 요인 없이 집단만 썼으면 "(요인 없음) 집단: <집단>", 미작성이면 "미작성".
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
          학생요인: { type: "string" },
          판정: { type: "string", enum: ["O", "X"] },
          판단근거: { type: "string" },
        },
        required: ["기호", "학생요인", "판정", "판단근거"],
        additionalProperties: false,
      },
    },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["채점", "오류목록"],
  additionalProperties: false,
};

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
    messages: [{ role: "user", content: `[학생 답안]\n${answer}\n\nⓐ~ⓓ 네 항목을 모두 채점하십시오.` }],
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
    const g = byKey[s] ?? { 학생요인: "미작성", 판정: "X", 판단근거: "채점 결과 누락" };
    return { 기호: s, 정답요인: rubric.정답[s].요인, 학생요인: g.학생요인, 판정: g.판정, 판단근거: g.판단근거 };
  });
  const 점수 = 채점.filter((c) => c.판정 === "O").length;
  const result = { 문항: "q8_문항1", 학생: name, OCR: answer, 채점, 점수, 총배점: rubric.총배점, 오류목록: graded.오류목록, 엔진: MODEL };
  fs.writeFileSync(path.join(OUT_DIR, `q8_문항1_${name}.json`), JSON.stringify(result, null, 2) + "\n");
  summary[name] = 점수;
  console.log(`${name}\t${점수}\t${채점.map((c) => c.판정).join("")}`);
}

console.log(`\n완료 ${files.length}건`);
console.log(JSON.stringify(summary));
