// q8 국어 문항1 답안 이미지 폴더를 OCR → HMOS 5색 2단계로 채점해 학생별 JSON으로 저장한다.
//  1단계 — 확정 급소(채점기준 「급소 (확정)」): B 표현 × D 구성 요인 → C 언어 공동체
//  2단계 — 학생 답안 급소 대조: 항목별 B 소환·요인·공동체를 대조만 한다. 모델은 판정하지 않는다.
// 판정(O/X)은 대조 결과로 코드가 정하고, 점수는 O 개수로 코드가 센다.
// 사용: node --env-file=.env scripts/grade-q8-item1.mjs <이미지폴더> [출력폴더]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const SYMBOLS = ["ⓐ", "ⓑ", "ⓒ", "ⓓ"];

const dir = process.argv[2];
const OUT_DIR = process.argv[3] ?? "검증/q8_문항1";
if (!dir) {
  console.error("사용: node --env-file=.env scripts/grade-q8-item1.mjs <이미지폴더> [출력폴더]");
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

// ── 1단계: 문항 5색 분해 (확정 급소) ──
const item = { 문항: rubric.문항, Q: "차별적 인식이 (가)의 어느 구성 요인에 의한 것인지", 정답: rubric.정답, 급소: rubric["급소 (확정 2026-10-18)"] };

// ── 2단계: 학생 답안 급소 대조 — 모델은 대조만, 판정·점수는 코드 ──
const CONTRAST_SYSTEM = `당신은 HMOS 급소 대조기입니다. 판단하거나 점수를 매기지 않습니다.
학생 답안에서 ⓐ~ⓓ 각 항목이 문항 급소 K(표현 B × 구성 요인 D → 언어 공동체 C)에 닿았는지 대조만 합니다.

[문항 5색 분해 — 확정 급소]
${JSON.stringify(item, null, 1)}

[항목별 대조 — ⓐ~ⓓ 각각]
1. B소환: 그 항목을 지목했는가.
   - 기호(ⓐ~ⓓ)나 표현(틀딱·쪽발이·흑형·여사님) 중 하나로 그 항목을 직접 지목하면 소환.
     기호만 쓰고 표현을 생략해도 소환입니다 (예: "ⓒ인종" → ⓒ B소환 true).
   - 그 표현을 가리키는 말(예: "노인을 비하하는 단어", "일본인을 낮잡는 말")로 지목해도 소환 — 노인·일본인 등 집단 낱말 직접 명시는 불필요.
   - (가)의 요인이나 (나)의 내용을 늘어놓기만 하고 어느 항목도 지목하지 않았으면 false. 미작성이면 false.
2. 요인: 학생이 그 항목에 연결한 (가)의 구성 요인
   - "정확": 정답 요인만 (ⓐ 연령 / ⓑ 민족 / ⓒ 인종 / ⓓ 성별)
   - "섞임": 정답 요인과 오답 요인이 그 항목에 함께 걸림
   - "오답": 오답 요인만 (다른 항목의 요인을 끌어온 경우 포함 — 예: ⓑ에 인종)
   - "없음": 요인 낱말 없음
3. 공동체: 학생이 그 항목에 쓴 대상 집단
   - "정확": ⓐ 노인 / ⓑ 일본인 / ⓒ 흑인 / ⓓ 여성(운전자) — 표기 오기('흑연' 등)도 정확
   - "없음": 집단 서술 없음 또는 다른 집단
4. 학생요인: 그 항목에 쓴 요인 낱말 그대로 (없으면 "", 미작성이면 "미작성").
5. 급소근거: 해당 구절을 인용하고 K의 어느 고리(B·D·C)에 닿았는지 한 줄.

[확정 해석]
- 항목 문장 안에서 표현에 직접 연결한 요인·집단이 있으면 그것으로 대조합니다 (예: "쪽발이는 민족을 비하하는 표현" → ⓑ 요인 민족 정확).
- 직접 연결이 없을 때만, 여러 표현과 여러 요인을 함께 나열한 문장을 나열 순서로 대응시킵니다.
  확정 사례: "쪽발이와 흑형은 각각 일본과 흑인 혐오 표현으로 거주 지역, 민족, 인종에 해당된다"
  → ⓑ 쪽발이: 거주 지역이 걸림 → 요인 "섞임" / ⓒ 흑형: 나열 끝의 인종이 대응 → 요인 "정확".
- 표현·집단 이름의 오기는 항목 기호와 요인이 맞으면 그대로 대조합니다.`;

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
          요인: { type: "string", enum: ["정확", "섞임", "오답", "없음"] },
          공동체: { type: "string", enum: ["정확", "없음"] },
          학생요인: { type: "string" },
          급소근거: { type: "string" },
        },
        required: ["기호", "B소환", "요인", "공동체", "학생요인", "급소근거"],
        additionalProperties: false,
      },
    },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["대조", "오류목록"],
  additionalProperties: false,
};

// B 소환 중 「기호·표현을 직접 지목」은 문자열로 확인한다 — 모델이 기호만 있는 항목을 놓치는 일이 있어서
const EXPRESSIONS = { "ⓐ": "틀딱", "ⓑ": "쪽발이", "ⓒ": "흑형", "ⓓ": "여사님" };
const namesItem = (answer, s) => answer.includes(s) || answer.includes(EXPRESSIONS[s]);

// 대조 → 판정 (확정): B 소환 + (정답 요인 또는 정답 공동체) → O / 오답 요인이 걸리면 X
function judge(c) {
  if (!c.B소환 || c.요인 === "섞임" || c.요인 === "오답") return "X";
  return c.요인 === "정확" || c.공동체 === "정확" ? "O" : "X";
}

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
    messages: [{ role: "user", content: `[학생 답안]\n${answer}\n\nⓐ~ⓓ 네 항목을 급소 K와 대조하십시오.` }],
  });
  return JSON.parse(textOf(res));
}

const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = {};

for (const file of files) {
  const name = path.parse(file).name;
  const answer = await ocr(path.join(dir, file));
  const graded = await contrast(answer);
  const byKey = Object.fromEntries(graded.대조.map((c) => [c.기호, c]));
  const 채점 = SYMBOLS.map((s) => {
    const m = byKey[s] ?? { B소환: false, 요인: "없음", 공동체: "없음", 학생요인: "미작성", 급소근거: "대조 결과 누락" };
    const c = { ...m, B소환: m.B소환 || namesItem(answer, s) };
    return { 기호: s, 정답요인: rubric.정답[s].요인, 학생요인: c.학생요인, 판정: judge(c), B소환: c.B소환, 요인: c.요인, 공동체: c.공동체, 판단근거: c.급소근거 };
  });
  const 점수 = 채점.filter((c) => c.판정 === "O").length;
  const result = {
    문항: "q8_문항1", 학생: name, OCR: answer, 채점, 점수, 총배점: rubric.총배점, 오류목록: graded.오류목록, 엔진: MODEL,
    방식: "HMOS 5색 2단계 (확정 급소 → 급소 대조)",
  };
  fs.writeFileSync(path.join(OUT_DIR, `q8_문항1_${name}.json`), JSON.stringify(result, null, 2) + "\n");
  summary[name] = 점수;
  console.log(`${name}\t${점수}\t${채점.map((c) => c.판정).join("")}`);
}

console.log(`\n완료 ${files.length}건`);
console.log(JSON.stringify(summary));
