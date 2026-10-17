// q8 국어 논술 문항3 답안 이미지 폴더를 OCR → 채점해 학생별 JSON으로 저장한다.
// 채점 규칙은 검증/q8_문항3_채점기준.json, 제시문은 검증/q8_원문.md를 따른다.
// 모델은 사실(자료 사용·인정·출처, 근거논리, 반론·반박, 서론·결론)만 뽑고,
// 내용·조직·표현 점수는 채점기준의 「점수 계산」 표대로 코드가 정한다.
// 사용: node --env-file=.env scripts/grade-q8-item3.mjs <이미지폴더> [출력폴더]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const OUT_DIR = process.argv[3] ?? "검증/q8_문항3";
const SOURCES = ["(가)", "(다)", "(라)", "(마)", "(바)"];

const dir = process.argv[2];
if (!dir) {
  console.error("사용: node --env-file=.env scripts/grade-q8-item3.mjs <이미지폴더>");
  process.exit(1);
}

const rubric = JSON.parse(fs.readFileSync("검증/q8_문항3_채점기준.json", "utf8"));
const original = fs.readFileSync("검증/q8_원문.md", "utf8");
const passages = original.slice(original.indexOf("## (가)"), original.indexOf("## 문항"));
const client = new Anthropic({
  defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID },
});

const OCR_SYSTEM = `당신은 한국어 손글씨 답안을 옮겨 적는 OCR 담당입니다.
이미지 속 학생 답안을 보이는 그대로 옮기십시오. 고치거나 보태지 마십시오.

[문항 문맥 — 손글씨 판독용]
문항: ${rubric.문항}
학생은 아래 제시문의 낱말·문장을 자주 옮겨 씁니다. 흘려 쓴 글자가 제시문 낱말로 읽히면 그 낱말로 적으십시오.
단, 학생이 다르게 썼으면 그대로 적습니다. 제시문 문장으로 바꿔 적거나 빠진 말을 채우지 마십시오.
${passages}
[옮겨 적기 규칙]
- 출처 표기 「(가)」「(나)」「(다)」「(라)」「(마)」「(바)」는 괄호까지 보이는 그대로 적습니다. 괄호 없이 썼으면 괄호 없이 적습니다.
  괄호 안 글자는 문장 내용으로 짐작하지 말고 글자 모양으로만 판독합니다(ㄴ·ㅁ·ㅂ 첫소리 구별). 출처 표기는 작게 쓰여 놓치기 쉬우니
  문장 첫머리와 《 》 책 제목 앞에 괄호 기호가 있는지 특히 살핍니다.
- 학생이 줄을 바꾸거나 들여 써서 문단을 나눈 곳은 빈 줄로 나눕니다. 그 밖의 줄바꿈은 이어 적습니다.
- 문장부호(마침표 등)는 보이는 그대로 적습니다. 없는 마침표를 보태지 마십시오.
- '(3번 답안)' 같은 인쇄된 머리말은 빼고 답안만 적습니다.
- 알아볼 수 없는 글자는 [?]로 표시합니다.
- 답안 텍스트만 출력하십시오.`;

const GRADE_SYSTEM = `당신은 HMOS 급소 대조기입니다. 판단하거나 점수를 매기지 않습니다(점수는 코드가 계산).
학생 답안을 5색으로 분해한 뒤, 문항 급소 K에 닿았는지 아래 항목을 대조만 합니다.

[문항 5색 분해 — 확정 급소]
${JSON.stringify(rubric["급소 (확정 2026-10-18)"], null, 1)}

[제시문]
${passages}
[채점 기준]
${JSON.stringify(rubric, null, 1)}

[판정 방법]
1. 자료: (가)(다)(라)(마)(바) 각각에 대해
   - 사용: 학생이 그 제시문의 내용을 끌어왔는가(출처 표기와 무관). 제시문 문장을 거의 그대로 옮긴 것도 사용입니다.
   - 인정: 그 내용을 자기 주장의 근거나 반박에 논리적으로 연결했는가. 단순 나열·요약만이면 false.
     출처 표기 여부는 인정과 무관합니다 — 출처 없이 옮겨 써도 주장에 연결했으면 인정 true (출처 누락은 표현에서만 감점).
   - 출처표기: 「(바)에 따르면」「(가)에서」「(다)의 조사 결과」처럼 괄호 기호로 그 자료를 밝혔는가.
     「관련 자료를 보면」「설문조사에서」「홍성수 교수는」처럼 기호 없이 쓴 것은 false.
2. 근거논리: 강 = 자료로 주장을 논리적·구체적으로 뒷받침 / 약 = 뒷받침하나 논리성·구체성 다소 부족 / 없음.
3. 반론: 예상되는 반대 측 주장을 제시했는가 (「물론 ~라는 주장도 있다」「일부에서는 ~」 등).
4. 반박근거: "자료" = (가)~(바) 자료 내용으로 반론을 반박 / "일반논리" = 자료 없이 일반 논리·단순 주장으로 반박
   (논리가 그럴듯해도) / "없음" = 반박 없음.
   평가원 사례: "혐오 표현은 타인에게 상처를 주는 명백히 나쁜 행동이므로 반드시 규제해야 한다" → 약.
5. 서론·결론:
   - 서론: 글머리에서 화제를 꺼내거나 입장을 밝히는 도입부. 첫 문장에 입장만 밝히고 곧바로 근거가 이어지면
     그 입장 문장을 서론 1문장으로 봅니다(서론있음 true, 서론문장수 1). 첫 문장부터 근거·자료 내용이면 서론 없음.
   - 결론: 글 끝에서 입장을 정리하는 부분(「따라서」「결론적으로」 등).
   - 문장수: 서론·결론 각각의 문장 수. 없으면 0.
   - 과다: 서론이나 결론이 본론보다 지나치게 길면 true.
6. 구조완성: 서론-본론-결론 구조를 갖추었는가. 본론만 있거나 글이 중간에 끊겨 결론이 없으면 false.
7. 주제이탈: 미작성이거나 문항과 무관한 글이면 true.
8. 입장: 법적 규제에 찬성이면 "찬성", 반대면 "반대", 알 수 없으면 "불명".
판단근거는 각 한 줄.`;

const SOURCE_ITEM = {
  type: "object",
  properties: {
    자료: { type: "string", enum: SOURCES },
    사용: { type: "boolean" },
    인정: { type: "boolean" },
    출처표기: { type: "boolean" },
  },
  required: ["자료", "사용", "인정", "출처표기"],
  additionalProperties: false,
};

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    입장: { type: "string", enum: ["찬성", "반대", "불명"] },
    자료: { type: "array", items: SOURCE_ITEM },
    근거논리: { type: "string", enum: ["강", "약", "없음"] },
    반론있음: { type: "boolean" },
    반박근거: { type: "string", enum: ["자료", "일반논리", "없음"] },
    내용근거: { type: "string" },
    서론있음: { type: "boolean" },
    결론있음: { type: "boolean" },
    서론문장수: { type: "integer" },
    결론문장수: { type: "integer" },
    서론결론과다: { type: "boolean" },
    구조완성: { type: "boolean" },
    조직근거: { type: "string" },
    표현근거: { type: "string" },
    주제이탈: { type: "boolean" },
    오류목록: { type: "array", items: { type: "string" } },
  },
  required: ["입장", "자료", "근거논리", "반론있음", "반박근거", "내용근거", "서론있음", "결론있음", "서론문장수", "결론문장수", "서론결론과다", "구조완성", "조직근거", "표현근거", "주제이탈", "오류목록"],
  additionalProperties: false,
};

// 채점기준 「점수 계산」 표
function contentScore(g, n) {
  const 반박있음 = g.반박근거 !== "없음";
  // 0점: 자료를 활용하지 않았거나 반론과 반박을 모두 제시하지 못한 경우 (원 기준표, 2026-10-18 재확정)
  if (g.주제이탈 || n === 0 || (!g.반론있음 && !반박있음)) return 0;
  if (n >= 2) {
    if (g.반론있음 && g.반박근거 === "자료" && g.근거논리 === "강") return 4;
    if (g.반론있음 && 반박있음) return 3;
    return 2;
  }
  return g.반론있음 && 반박있음 ? 2 : 1;
}

// 기준표: 2 = 서론·결론 모두(두 문장 이내), 1 = 하나만, 0 = 둘 다 없음
// 서론이 1문장(입장 문장)뿐이면 결론과 무관하게 1점 (확정)
// 구조완성은 기록만 한다 — 이걸로 0점을 주면 「하나만 갖춘 경우 1점」과 부딪힌다
function orgScore(g) {
  if (g.서론있음 && g.서론문장수 === 1) return 1;
  const intro = g.서론있음 && g.서론문장수 >= 1 && g.서론문장수 <= 2;
  const outro = g.결론있음 && g.결론문장수 >= 1 && g.결론문장수 <= 2;
  return Math.max(0, Number(intro) + Number(outro) - Number(g.서론결론과다));
}

function exprScore(used) {
  const cited = used.filter((s) => s.출처표기);
  if (used.length === 0 || cited.length === 0) return 0;
  return cited.length === used.length ? 2 : 1;
}

const textOf = (res) => res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

const pngBlock = (p) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: fs.readFileSync(p).toString("base64") } });

// 세로로 긴 답안은 모델 입력에서 축소되어 「(바)」 같은 괄호 기호가 뭉개진다 → 위·아래로 잘라 넣는다
function splitImage(imagePath) {
  const base = path.join(os.tmpdir(), `q8-item3-${process.pid}`);
  const top = `${base}-top.png`;
  const bottom = `${base}-bottom.png`;
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/split-image.ps1", imagePath, top, bottom]);
  return [top, bottom];
}

async function ocr(imagePath) {
  const [top, bottom] = splitImage(imagePath);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0,
    system: OCR_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "[답안 위쪽]" }, pngBlock(top),
        { type: "text", text: "[답안 아래쪽] — 위쪽과 몇 줄이 겹칩니다. 겹친 줄은 한 번만 적으십시오." }, pngBlock(bottom),
        { type: "text", text: "위쪽에서 아래쪽으로 이어지는 한 편의 답안으로 옮겨 적으십시오." },
      ],
    }],
  });
  return textOf(res);
}

async function grade(answer) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    temperature: 0,
    system: GRADE_SYSTEM,
    output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } },
    messages: [{ role: "user", content: `[학생 답안]\n${answer}\n\n판정하십시오.` }],
  });
  return JSON.parse(textOf(res));
}

const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = {};

for (const file of files) {
  const name = path.parse(file).name;
  const answer = await ocr(path.join(dir, file));
  const g = await grade(answer);
  const bySource = Object.fromEntries(g.자료.map((s) => [s.자료, s]));
  const sources = SOURCES.map((s) => bySource[s] ?? { 자료: s, 사용: false, 인정: false, 출처표기: false });
  const used = sources.filter((s) => s.사용);
  const accepted = used.filter((s) => s.인정);

  const 내용 = {
    점수: contentScore(g, accepted.length),
    만점: 4,
    자료활용: accepted.map((s) => s.자료),
    자료수: accepted.length,
    반론있음: g.반론있음,
    반박있음: g.반박근거 !== "없음",
    반박근거: g.반박근거,
    논리연결: g.근거논리,
    판단근거: g.내용근거,
  };
  const 조직 = {
    점수: orgScore(g),
    만점: 2,
    서론있음: g.서론있음,
    결론있음: g.결론있음,
    서론문장수: g.서론문장수,
    결론문장수: g.결론문장수,
    서론결론과다: g.서론결론과다,
    구조완성: g.구조완성,
    판단근거: g.조직근거,
  };
  const 표현 = {
    점수: exprScore(used),
    만점: 2,
    출처명시: used.filter((s) => s.출처표기).map((s) => s.자료),
    출처누락: used.filter((s) => !s.출처표기).map((s) => s.자료),
    판단근거: g.표현근거,
  };
  const 엔진점수 = { 내용: 내용.점수, 조직: 조직.점수, 표현: 표현.점수, 총점: 내용.점수 + 조직.점수 + 표현.점수 };
  // 수동 확정 학생은 확정 점수가 최종, 엔진 판정은 그대로 남긴다
  const manual = rubric["수동 확정"][name];
  if (manual) {
    내용.점수 = manual.내용;
    조직.점수 = manual.조직;
    표현.점수 = manual.표현;
  }
  const 총점 = 내용.점수 + 조직.점수 + 표현.점수;
  const result = {
    문항: "q8_문항3", 학생: name, OCR: answer, 채점: { 내용, 조직, 표현 }, 총점, 총배점: rubric.총배점, 입장: g.입장, 오류목록: g.오류목록, 엔진: MODEL,
    ...(manual && { 수동확정: true, 수동확정근거: manual.근거, 엔진점수 }),
  };
  fs.writeFileSync(path.join(OUT_DIR, `q8_문항3_${name}.json`), JSON.stringify(result, null, 2) + "\n");
  summary[name] = 총점;
  console.log(`${name}\t${총점}\t내용${내용.점수} 조직${조직.점수} 표현${표현.점수}\t${g.입장}${manual ? `\t(수동 확정, 엔진 ${엔진점수.총점})` : ""}`);
}

console.log(`\n완료 ${files.length}건`);
console.log(JSON.stringify(summary));
