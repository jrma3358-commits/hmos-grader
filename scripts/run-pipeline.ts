// 정교화 파이프라인 — grader-prompt(바닥) 위에 v2 인식(위층)을 얹는다.
// 사용: node --env-file=.env scripts/run-pipeline.ts <문제이미지> [출력폴더]
//
//   S0 옮겨 적기   extractTextFromImage()            → source_text.txt
//   S1 grader      grader-prompt.md + 이미지만        → grader.raw.txt
//   S2 v2          recognizeV2Analysis(source_text)  (API 없음)
//   S3·S4 정교화   refine()                          → refined.json
//
// API 결과는 정교화 전에 먼저 파일로 남긴다 — 뒷단이 깨져도 다시 부르지 않게.
// 봉인 표지사전은 해시·수정 시각만 기록한다 (값 미출력).

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { recognizeV2Analysis } from '../src/fq/pipeline.ts';
import { sealedPath } from '../src/fq/sealed/index.ts';
import { extractTextFromImage, imageMediaType } from '../src/fq/vision.ts';
import { parseGrader, refine } from '../src/merge/refine.ts';

const [problemPath, outArg] = process.argv.slice(2);
if (!problemPath) {
  console.error('사용: node --env-file=.env scripts/run-pipeline.ts <문제이미지> [출력폴더]');
  process.exit(1);
}
const outDir = outArg ?? path.join('out', path.parse(problemPath).name);
fs.mkdirSync(outDir, { recursive: true });
const save = (name: string, data: string) => fs.writeFileSync(path.join(outDir, name), data);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex').slice(0, 16);

const client = new Anthropic({ defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } });

// S0
const sourceText = await extractTextFromImage(problemPath, client);
save('source_text.txt', sourceText);
console.error('[S0] 옮겨 적기 완료');

// S1 — run-grader.mjs와 같은 호출 (답안 없음)
const promptMd = fs.readFileSync('grader-prompt.md', 'utf8');
const system = promptMd.slice(promptMd.indexOf('## SYSTEM') + '## SYSTEM'.length).trim();
const response = await client.beta.messages
  .stream({
    model: 'claude-opus-5-5',
    max_tokens: 32000,
    output_config: { effort: 'high' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: '[문제 이미지]' },
          { type: 'image', source: { type: 'base64', media_type: imageMediaType(problemPath), data: fs.readFileSync(problemPath).toString('base64') } },
          { type: 'text', text: '[학생 답안] 없음 — 1층·2층만 읽고, 3층·4층은 "답안 없음"으로 표시하십시오.' },
        ],
      },
    ],
  })
  .finalMessage();
if (response.stop_reason === 'refusal') throw new Error('grader 거절');
const graderText = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
save('grader.raw.txt', graderText);
console.error(`[S1] grader 완료 model=${response.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);

// S2
const V = recognizeV2Analysis(sourceText);
console.error(`[S2] v2 완료 노드 ${V.graph.nodes.length}개, 급소 ${V.pivot.ok ? 'ok' : V.pivot.flag}`);

// S3·S4
const G = parseGrader(graderText);
const sealed = sealedPath();
const refined = {
  source_text: V.question,
  provenance: {
    grader: { model: response.model, prompt_sha: sha(system), tokens: [response.usage.input_tokens, response.usage.output_tokens] },
    v2: {
      commit: execSync('git rev-parse --short HEAD').toString().trim(),
      sealed_sha: sha(fs.readFileSync(sealed)),
      sealed_mtime: fs.statSync(sealed).mtime.toISOString(),
    },
  },
  ...refine(G, V),
  raw: { grader: G, v2: V },
};
save('refined.json', JSON.stringify(refined, null, 2));
console.error(`[S4] 정교화 완료 → ${path.join(outDir, 'refined.json')}`);
