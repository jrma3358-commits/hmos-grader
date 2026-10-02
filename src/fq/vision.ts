// 이미지 전처리 — 문항 이미지에서 글자를 옮겨 적고 v2 파이프라인(`recognizeV2Analysis`)으로 넘긴다.
//
// 이 파일이 하지 않는 것:
//   - 문항을 풀거나 해석하는 일 (옮겨 적기만 한다 — 인식은 v2 엔진 몫)
//   - 옮긴 글을 고치는 일 (돌려받은 글 그대로 넘긴다. 정규화는 `normalizeV2`가 한다)
//
// 인증: `new Anthropic()`이 환경(ANTHROPIC_API_KEY 또는 `ant auth login` 프로필)에서 찾는다.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import Anthropic from '@anthropic-ai/sdk';
import { recognizeV2Analysis } from './pipeline.ts';

const MODEL = 'claude-opus-5-5';

/** API가 받는 이미지 형식. BMP는 받지 않는다 — `bmpToPng`로 바꿔서 넣는다 */
const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
} as const;

type ImageMediaType = (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES];

export function imageMediaType(path: string): ImageMediaType {
  const ext = extname(path).toLowerCase();
  if (ext === '.bmp') return 'image/png'; // 보내기 전에 PNG로 바꾼다
  const type = MEDIA_TYPES[ext as keyof typeof MEDIA_TYPES];
  if (!type) {
    throw new Error(`지원하지 않는 이미지 형식입니다: "${ext}" (${path}) — PNG·JPEG·GIF·WebP·BMP만 받습니다.`);
  }
  return type;
}

// ─────────────────────────────────────────────────────────────
// BMP → PNG — 원본 문항 이미지가 HWP에 박힌 BMP다 (예: 수리논술 BIN0001.bmp). 외부 패키지 없이 node:zlib로 바꾼다.
//   받는 것: 비압축(BI_RGB) 1·4·8·24·32비트, 32비트 BI_BITFIELDS(표준 BGRA 마스크). 위→아래(음수 높이)도 받는다.
//   그 밖(RLE 압축 등)은 던진다 — 깨진 그림을 보내지 않는다. 알파는 버린다(BMP 알파는 대개 0으로 비어 있다).
// ─────────────────────────────────────────────────────────────

export function bmpToPng(bmp: Buffer): Buffer {
  if (bmp.toString('ascii', 0, 2) !== 'BM') throw new Error('BMP 머리(BM)가 없습니다');
  const dataOffset = bmp.readUInt32LE(10);
  const headerSize = bmp.readUInt32LE(14);
  if (headerSize < 40) throw new Error(`지원하지 않는 BMP 머리 크기: ${headerSize}`);
  const width = bmp.readInt32LE(18);
  const rawHeight = bmp.readInt32LE(22);
  const bpp = bmp.readUInt16LE(28);
  const compression = bmp.readUInt32LE(30);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (width <= 0 || height === 0) throw new Error(`BMP 크기가 잘못됐습니다: ${width}x${rawHeight}`);
  if (![1, 4, 8, 24, 32].includes(bpp)) throw new Error(`지원하지 않는 BMP 비트 수: ${bpp}`);
  if (!(compression === 0 || (compression === 3 && bpp === 32))) {
    throw new Error(`지원하지 않는 BMP 압축 방식: ${compression}`);
  }

  // 팔레트 (1·4·8비트) — BGRA 4바이트씩, 머리 바로 뒤
  const palette: [number, number, number][] = [];
  if (bpp <= 8) {
    const count = bmp.readUInt32LE(46) || 1 << bpp;
    const at = 14 + headerSize;
    for (let k = 0; k < count; k++) palette.push([bmp[at + k * 4 + 2], bmp[at + k * 4 + 1], bmp[at + k * 4]]);
  }

  const rowSize = Math.ceil((bpp * width) / 32) * 4; // BMP 행은 4바이트로 맞춘다
  const out = Buffer.alloc((width * 3 + 1) * height); // PNG 행 = 필터 바이트(0) + RGB
  for (let y = 0; y < height; y++) {
    const src = dataOffset + (topDown ? y : height - 1 - y) * rowSize;
    let dst = y * (width * 3 + 1) + 1;
    for (let x = 0; x < width; x++, dst += 3) {
      let r: number, g: number, b: number;
      if (bpp >= 24) {
        const p = src + x * (bpp / 8);
        [b, g, r] = [bmp[p], bmp[p + 1], bmp[p + 2]];
      } else {
        const bit = x * bpp;
        const idx = (bmp[src + (bit >> 3)] >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        [r, g, b] = palette[idx] ?? [0, 0, 0];
      }
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
    }
  }

  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 채널당 8비트
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 이미지 파일 → API에 보낼 바이트. BMP면 PNG로 바꾼다 */
function readImage(path: string): Buffer {
  const raw = readFileSync(path);
  return extname(path).toLowerCase() === '.bmp' ? bmpToPng(raw) : raw;
}

/**
 * 옮겨 적기 지시. 문단 경계를 빈 줄로 남겨야 `normalizeV2`가 문단 경계로 살린다.
 * 수식은 지금까지 손으로 옮긴 모양(한 줄, `x^2/64`)에 맞춘다.
 */
const TRANSCRIBE_PROMPT = `이 이미지는 시험 문항입니다. 이미지에 있는 글자를 그대로 옮겨 적으세요.

- 풀지 말고, 고치지 말고, 요약하지 말고, 설명을 덧붙이지 마세요. 옮긴 글만 출력하세요.
- 문단·보기·소문항이 바뀌는 곳은 빈 줄 하나로 띄우세요. 한 문단 안의 줄바꿈은 공백으로 이으세요.
- 수식은 한 줄 텍스트로 적으세요 (예: x^2/64, √(x+1), ∫_0^1 f(x)dx, lim_{x→0} f(x)/x). △·→·≤ 같은 기호는 그대로 쓰세요.
- 보기 기호((가)·ㄱ.·①·<보기> 등)와 괄호, 문장 부호는 이미지에 있는 그대로 쓰세요.
- 읽을 수 없는 글자는 [?]로 적으세요.`;

/** 이미지 파일 → 옮겨 적은 글. 거절·잘림은 던진다 — 반쪽 글을 엔진에 넘기지 않는다 */
export async function extractTextFromImage(path: string, client: Anthropic = new Anthropic()): Promise<string> {
  const media_type = imageMediaType(path);
  const data = readImage(path).toString('base64');

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data } },
          { type: 'text', text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`옮겨 적기 거절: ${response.stop_details?.category ?? '분류 없음'} (${path})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`옮겨 적기가 max_tokens에서 잘렸습니다 (${path})`);
  }
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error(`옮겨 적은 글이 비었습니다 (${path})`);
  return text;
}

/** 이미지 파일 → 옮겨 적기 → v2 인식(경로 그래프·조합·급소). 옮긴 글도 함께 돌려준다 */
export async function recognizeImageV2(path: string, client?: Anthropic) {
  const text = await extractTextFromImage(path, client);
  return { text, analysis: recognizeV2Analysis(text) };
}
