// grader-prompt.md 로 문제 이미지(+ 학생 답안)를 채점한다.
// 사용: node --env-file=.env scripts/run-grader.mjs <문제이미지> [답안이미지|답안텍스트파일]
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const [problemPath, answerPath] = process.argv.slice(2);
if (!problemPath) {
  console.error("사용: node --env-file=.env scripts/run-grader.mjs <문제이미지> [답안이미지|답안텍스트파일]");
  process.exit(1);
}

const promptMd = fs.readFileSync("grader-prompt.md", "utf8");
const systemStart = promptMd.indexOf("## SYSTEM");
if (systemStart < 0) throw new Error("grader-prompt.md 에 '## SYSTEM' 이 없습니다");
const system = promptMd.slice(systemStart + "## SYSTEM".length).trim();

const MEDIA = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const imageBlock = (p) => {
  const media_type = MEDIA[path.extname(p).toLowerCase()];
  if (!media_type) throw new Error(`지원하지 않는 이미지 형식: ${p}`);
  return { type: "image", source: { type: "base64", media_type, data: fs.readFileSync(p).toString("base64") } };
};

const content = [{ type: "text", text: "[문제 이미지]" }, imageBlock(problemPath)];
if (!answerPath) {
  content.push({ type: "text", text: "[학생 답안] 없음 — 1층·2층만 읽고, 3층·4층은 \"답안 없음\"으로 표시하십시오." });
} else if (MEDIA[path.extname(answerPath).toLowerCase()]) {
  content.push({ type: "text", text: "[학생 답안 이미지]" }, imageBlock(answerPath));
} else {
  content.push({ type: "text", text: `[학생 답안]\n${fs.readFileSync(answerPath, "utf8")}` });
}

const client = new Anthropic({
  defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID },
});

const stream = client.beta.messages.stream({
  model: "claude-opus-5-5",
  max_tokens: 32000,
  output_config: { effort: "high" },
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  system,
  messages: [{ role: "user", content }],
});
const response = await stream.finalMessage();

if (response.stop_reason === "refusal") {
  console.error("거절됨:", response.stop_details);
  process.exit(2);
}
const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
console.log(text);
console.error(`\n[model=${response.model} stop=${response.stop_reason} in=${response.usage.input_tokens} out=${response.usage.output_tokens}]`);
