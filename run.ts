// 사용: node run.ts 문항.txt — 5색 노드·급소에 이어 문항 평가(서술 정합성·대안)를 찍는다
import { readFileSync } from 'node:fs';
import { evaluate_pivot, recognizeV2Analysis } from './src/fq/index.ts';
import type { V2Analysis } from './src/fq/pipeline.ts';

const q = readFileSync(process.argv[2], 'utf8');
const mark = (b: boolean) => (b ? '✅' : '⚠️');

const show = (a: V2Analysis, label: string) => {
  console.log(`== ${label} — 조합 ${a.graph.combination.join('')}`);
  for (const n of a.graph.nodes) console.log(`  ${n.id} ${n.color} 「${n.entity}」 ${n.surface ?? ''}${n.stemPinnedBy ? ' pin=' + n.stemPinnedBy : ''}`);
  console.log('  pivot:', JSON.stringify(a.pivot));

  const ev = evaluate_pivot(a.pivot, a.graph);
  console.log('  평가:');
  if (!ev.ok) {
    console.log(`    판정 불가 (플래그 ${ev.flag})`);
    return;
  }
  ev.items.forEach((it, i) => {
    const c = it.coherence;
    console.log(`    [급소 ${i + 1}] ${it.pivot.node.color}「${it.pivot.node.entity.trim()}」 keyword 「${it.pivot.keyword ?? ''}」 (${it.pivot.reason})`);
    console.log(`      정합 ${mark(c.ok)} — Q 연결 ${mark(c.linked)} · P에만 있음 ${c.passageOnly ? '⚠️' : '✅'} · 지시대상 ${c.deictic ? '⚠️ 불명확' : '✅'}`);
    if (it.blocked) console.log(`      대안 불가 (${it.blocked})`);
    for (const alt of it.alternatives) {
      console.log(`      대안 (${alt.rule}): 「${alt.from}」 → 「${alt.to}」`);
      // 대안 문장을 엔진에 다시 넣어 급소를 확인한다 — 문단 경계(줄바꿈 하나)를 빈 줄로 되돌려야 정규화에서 살아남는다
      const re = recognizeV2Analysis(alt.question.replace(/\n/g, '\n\n'));
      const ps = re.pivot.ok ? (re.pivot.pivots ?? [re.pivot.pivot]).map((p) => `${p.node.color}「${p.node.entity.trim()}」/${p.keyword ?? ''}`) : [`플래그 ${re.pivot.flag}`];
      console.log(`        → 재인식 급소: ${ps.join(' · ')}`);
    }
  });
};

const r = recognizeV2Analysis(q);
show(r, '전체');
(r.units ?? []).forEach((u, i) => show(u, `단위 ${i + 1}`));
