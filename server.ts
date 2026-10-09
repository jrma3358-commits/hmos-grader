import express from 'express';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const app = express();
const PORT = 3000;

// hmos-grader 폴더 기준 (server.ts가 같은 폴더에 있다고 가정)
const BASE = path.resolve(__dirname);

app.use(express.json());
app.use(express.static(BASE)); // HTML 파일 서빙

// ── /api/analyze ──────────────────────────────────────────
// 화면 A에서 POST { question: string } 를 받아
// run.ts 엔진을 실행하고 결과를 JSON으로 반환한다
app.post('/api/analyze', (req, res) => {
  const question: string = (req.body.question || '').trim();
  if (!question) {
    res.status(400).json({ error: '문항이 비어 있습니다.' });
    return;
  }

  // 임시 파일에 문항 저장
  const tmpFile = path.join(os.tmpdir(), 'hmos_q_' + Date.now() + '.txt');
  fs.writeFileSync(tmpFile, question, 'utf8');

  // run.ts 실행 (node로 직접, tsx 설치된 경우 tsx로)
  // 환경에 따라 'node' → 'npx tsx' 로 변경 가능
  const runner = 'node';
  const args   = ['run.ts', tmpFile];

  execFile(runner, args, { cwd: BASE, timeout: 30000, encoding: 'utf8' },
    (err, stdout, stderr) => {
      // 임시 파일 정리
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      if (err) {
        console.error('[엔진 오류]', stderr || err.message);
        res.status(500).json({ error: '엔진 실행 오류', detail: stderr || err.message });
        return;
      }

      try {
        const parsed = parseEngineOutput(stdout);
        res.json(parsed);
      } catch (e) {
        // 파싱 실패 시 raw 텍스트라도 반환
        res.json({ raw: stdout, parsed: false });
      }
    }
  );
});

// ── 엔진 출력 파싱 ─────────────────────────────────────────
// run.ts 출력 예시:
//   n0 B 「다음」은
//   n1 B '0 ≤ x < π/2 일 때 ...'
//   ...
//   pivot: {"ok":true,"pivot":{"node":{...},...},...}
//   [급소 1] B '...' keyword '...'
//     실체 ✔  · Q 연결 ✔  · P에만 있음 ✔  · 지시대상 ✔
//     평가:  통과
function parseEngineOutput(raw: string): Record<string, unknown> {
  const lines = raw.split('\n');

  // 1. 문항 유형 (첫 줄 "== 전체 - 조합 BPQ" 등)
  const typeLine = lines.find(l => l.startsWith('=='));
  const qtype = typeLine ? typeLine.replace(/^==\s*/, '').trim() : '서술형';

  // 2. 5색 노드 수집
  const colors: { code: string; label: string; text: string }[] = [];
  const colorMap: Record<string, string> = { B:'B 대상', C:'C 제약', P:'P 상황', D:'D 정의', Q:'Q 질문' };
  const colorSet = new Set<string>();
  for (const l of lines) {
    const m = l.match(/^n\d+\s+([BCPDQ])\s+(.+)/);
    if (m && !colorSet.has(m[1])) {
      colorSet.add(m[1]);
      colors.push({ code: m[1], label: colorMap[m[1]] || m[1], text: m[2].trim() });
    }
  }

  // 3. pivot JSON 줄
  let pivot = '';
  let pivotSub = 'Q에 맞닿은 실체 · B계열';
  const pivotLine = lines.find(l => l.startsWith('pivot:'));
  if (pivotLine) {
    try {
      const pj = JSON.parse(pivotLine.replace(/^pivot:\s*/, ''));
      if (pj?.pivot?.node?.entity) pivot = pj.pivot.node.entity;
    } catch (_) {}
  }

  // 4. [급소 N] 블록 파싱
  const pivotBlocks: { idx: number; keyword: string; verdict: string; reasons: string[] }[] = [];
  let curBlock: typeof pivotBlocks[0] | null = null;
  for (const l of lines) {
    const bm = l.match(/^\[급소\s*(\d+)\]/);
    if (bm) {
      if (curBlock) pivotBlocks.push(curBlock);
      const km = l.match(/keyword\s+「([^」]+)」/);
      curBlock = { idx: parseInt(bm[1]), keyword: km ? km[1] : '', verdict: '', reasons: [] };
      continue;
    }
    if (curBlock) {
      const vm = l.match(/결론[:：]\s*(.+)/);
      if (vm) { curBlock.verdict = vm[1].trim(); continue; }
      const rm = l.match(/평가[:：]\s*(.+)/);
      if (rm) { curBlock.verdict = rm[1].trim(); continue; }
      // 체크 항목 줄
      if (l.includes('✔') || l.includes('✓') || l.includes('✗')) {
        curBlock.reasons.push(l.trim());
      }
    }
  }
  if (curBlock) pivotBlocks.push(curBlock);

  // 5. 대표 verdict
  const mainVerdict = pivotBlocks.length > 0 ? pivotBlocks[0].verdict : '통과';
  const verdictCode = mainVerdict.includes('수정') ? 'fail'
                    : mainVerdict.includes('보완') ? 'warn' : 'pass';

  // 6. 출제의도 (자동 생성 — 실제 엔진이 출력하면 파싱으로 교체)
  const intent = pivot
    ? `「${pivot}」를 중심으로 문항이 무엇을 평가하는지 확인하십시오.`
    : '엔진 출제의도 추출 대기 중';

  return {
    type: qtype,
    pivot: pivot || (pivotBlocks[0]?.keyword ?? ''),
    pivotSub,
    colors,
    intent,
    substance: pivotBlocks.map(b => b.keyword).filter(Boolean).join(' / ') || pivot,
    hurdles: colors.filter(c => ['P','C','D'].includes(c.code)).map(c => c.code + '(' + c.text.substring(0,20) + ')').join(' → '),
    verdict: verdictCode,
    verdictText: mainVerdict,
    pivotBlocks,
    raw,
  };
}

// ── 서버 시작 ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  HMOS 로컬 서버 실행 중');
  console.log('  http://localhost:' + PORT + '/hmos_screen_a.html');
  console.log('  종료: Ctrl+C');
  console.log('');
});
