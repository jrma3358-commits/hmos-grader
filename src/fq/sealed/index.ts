// 봉인 파일 로더 — 값을 읽어 오기만 한다. 색을 정하지 않는다.
//
// 이 층의 규율:
//   1. 값이 없으면 **소리 내어 실패한다.** 기본값으로 때우지 않는다.
//      (조용한 기본값은 옛 하드코딩을 되살리는 길이다 — BUILD_PLAN §6-8 '원전 훼손'의 반복)
//   2. 판정(어떤 표지가 어떤 색인가)은 하지 않는다. 그건 봉인 파일이 정한다.
//   3. 봉인 파일은 커밋하지 않는다 (.gitignore).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SealedTable } from './schema.ts';

export type * from './schema.ts';

/** 저장소 뿌리에서의 기본 위치 */
const DEFAULT_RELATIVE = path.join('봉인', '표지사전.json');

/** src/fq/sealed/ → 저장소 뿌리 */
const repoRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 봉인 파일 경로. HMOS_SEALED_PATH로 덮어쓸 수 있다 */
export function sealedPath(): string {
  const override = process.env.HMOS_SEALED_PATH;
  return override ? path.resolve(override) : path.join(repoRoot(), DEFAULT_RELATIVE);
}

export function isSealedAvailable(): boolean {
  return existsSync(sealedPath());
}

export class SealedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealedError';
  }
}

const TABLES = ['switches', 'lights', 'matrix', 'symbols', 'forms', 'pending'] as const;

/** 구조만 본다 — 값이 맞는지(어떤 색인지)는 판정하지 않는다 */
function validate(data: unknown, where: string): SealedTable {
  if (typeof data !== 'object' || data === null) throw new SealedError(`${where}: 객체가 아닙니다`);
  const t = data as Record<string, unknown>;
  if (typeof t.version !== 'number') throw new SealedError(`${where}: version(숫자)이 없습니다`);
  for (const key of TABLES) {
    if (!Array.isArray(t[key])) throw new SealedError(`${where}: ${key}가 배열이 아닙니다`);
  }
  if (typeof t.apply !== 'object' || t.apply === null) throw new SealedError(`${where}: apply가 없습니다`);
  return data as SealedTable;
}

let cached: SealedTable | undefined;

/**
 * 봉인 파일을 읽는다. 없으면 실패한다 — 옛 규칙으로 되돌아가지 않는다.
 * @param reload 캐시를 버리고 다시 읽는다 (봉인 파일을 채워가며 확인할 때)
 */
export function loadSealedTable(reload = false): SealedTable {
  if (cached && !reload) return cached;
  const file = sealedPath();
  if (!existsSync(file)) {
    throw new SealedError(
      `봉인 파일이 없습니다: ${file}\n` +
        `봉인/README.md를 보고 표지사전.template.json을 표지사전.json으로 복사해 채우십시오.\n` +
        `(엔진은 표지→색 매핑을 스스로 정하지 않습니다)`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new SealedError(`봉인 파일을 읽을 수 없습니다: ${file} — ${(e as Error).message}`);
  }
  cached = validate(parsed, file);
  return cached;
}

/** 아직 판정되지 않은 칸 — 엔진이 여기에 걸리면 색을 추측하지 말고 미결로 보고한다 */
export function undecided(table: SealedTable): { where: string; marker: string; note: string }[] {
  const out: { where: string; marker: string; note: string }[] = [];
  for (const p of table.pending) {
    if (p.color === null) out.push({ where: 'pending', marker: p.marker, note: p.note });
  }
  for (const s of table.switches) {
    if (s.color === null) out.push({ where: s.id, marker: s.markers.join(' / '), note: '색 미정' });
  }
  for (const m of table.matrix) {
    if (m.color === null) out.push({ where: m.code, marker: m.triggers.join(' / '), note: '색 미정' });
  }
  return out;
}
