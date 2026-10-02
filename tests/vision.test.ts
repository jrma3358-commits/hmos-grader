import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { bmpToPng, imageMediaType } from '../src/fq/vision.ts';

/** 테스트용 BMP 만들기 — pixels[y][x] = [r,g,b] (y=0이 맨 위) */
function makeBmp(pixels: [number, number, number][][], opts: { bpp: 24 | 32 | 8; topDown?: boolean } = { bpp: 24 }): Buffer {
  const h = pixels.length;
  const w = pixels[0].length;
  const palette = opts.bpp === 8 ? [...new Set(pixels.flat().map((p) => p.join(',')))] : [];
  const rowSize = Math.ceil((opts.bpp * w) / 32) * 4;
  const offset = 14 + 40 + palette.length * 4;
  const buf = Buffer.alloc(offset + rowSize * h);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(offset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(opts.topDown ? -h : h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(opts.bpp, 28);
  buf.writeUInt32LE(palette.length, 46);
  palette.forEach((key, k) => {
    const [r, g, b] = key.split(',').map(Number);
    buf.set([b, g, r, 0], 54 + k * 4);
  });
  for (let y = 0; y < h; y++) {
    const row = offset + (opts.topDown ? y : h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixels[y][x];
      if (opts.bpp === 8) buf[row + x] = palette.indexOf(`${r},${g},${b}`);
      else buf.set([b, g, r], row + x * (opts.bpp / 8));
    }
  }
  return buf;
}

/** 우리가 쓴 PNG(필터 0, RGB 8비트)를 다시 픽셀로 */
function readPng(png: Buffer): { w: number; h: number; pixels: [number, number, number][][] } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  const pixels = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const p = y * (w * 3 + 1) + 1 + x * 3;
      return [raw[p], raw[p + 1], raw[p + 2]] as [number, number, number];
    }),
  );
  return { w, h, pixels };
}

describe('BMP → PNG 자동 변환', () => {
  const img: [number, number, number][][] = [
    [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
    [[10, 20, 30], [255, 255, 255], [0, 0, 0]],
  ];

  it('24비트 아래→위 BMP — 픽셀이 그대로 옮겨진다 (행 4바이트 맞춤 포함)', () => {
    assert.deepEqual(readPng(bmpToPng(makeBmp(img))).pixels, img);
  });

  it('위→아래(음수 높이)·32비트·8비트 팔레트도 같은 그림', () => {
    assert.deepEqual(readPng(bmpToPng(makeBmp(img, { bpp: 24, topDown: true }))).pixels, img);
    assert.deepEqual(readPng(bmpToPng(makeBmp(img, { bpp: 32 }))).pixels, img);
    assert.deepEqual(readPng(bmpToPng(makeBmp(img, { bpp: 8 }))).pixels, img);
  });

  it('지원하지 않는 압축은 던진다', () => {
    const bmp = makeBmp(img, { bpp: 8 });
    bmp.writeUInt32LE(1, 30); // BI_RLE8
    assert.throws(() => bmpToPng(bmp), /압축 방식/);
  });

  it('BMP 파일은 PNG로 보낸다', () => {
    assert.equal(imageMediaType('BIN0001.bmp'), 'image/png');
    assert.equal(imageMediaType('a.JPG'), 'image/jpeg');
    assert.throws(() => imageMediaType('a.tiff'), /지원하지 않는/);
  });
});
