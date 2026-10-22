// q3~q7 학생별 통합 리포트 (오종래 2026-10-22) — 같은 학생번호 = 같은 학생.
//  재료: 검증/채점결과/(학생 경로 채점 B로 재채점한 파일 — 재채점 칸) + 검증/처방전/(교사 확정 판정으로 만든 처방전).
//  문항마다 4축 = 처방전 축(교사 확정), 처방전이 없으면(판정불가가 남아 보류 · q4) 채점결과 4축 엔진 판정 — 판정불가는 ?
//  모으기 · 세기만 한다. 새로 판정하지 않고 Claude도 부르지 않는다:
//   반복 X = 두 문항 이상에서 X · 일관 O = O만 나오고 X · ?가 없는 축(두 문항 이상)
//   공통 처방 = 반복 X 축 중 가장 많이 X인 축(같으면 근거대기 → 답구하기 순) — 그 축의 고정 처방 한 줄 (dashboard2 처방한줄 수리와 같은 글)
//   성장 여지 = 잘하는 것(일관 O · O가 많은 축) 먼저, 키울 것(X 축) 다음 — 처방전의 「막힌 곳」 글을 문항별 근거로 붙인다
// 사용: node scripts/integrated-report.mjs   → 검증/통합리포트/학생N_통합리포트.json
import fs from 'node:fs';
import path from 'node:path';

const 검증 = path.join(import.meta.dirname, '..', '검증');
const 출력 = path.join(검증, '통합리포트');
const 축들 = ['근거대기', '세우기', '풀기', '답구하기'];
const 문항들 = ['q3', 'q4', 'q5', 'q6', 'q7'];
const 처방한줄 = {
  근거대기: '풀기 전에 문제 조건과 쓰일 개념(공식 이름)을 한 줄로 먼저 적어 보세요.',
  세우기: '조건 하나하나가 식의 어느 부분이 되는지 짝지어 보세요.',
  풀기: '계산을 한 줄에 한 단계씩, 중간 값을 적어 가며 이어 보세요.',
  답구하기: '마지막 줄에 문제가 묻는 값을 문제의 꼴 그대로 다시 써 보세요.',
};
const 둘째 = (x) => Math.round(x * 100) / 100;
const json들 = (폴더) => { try { return fs.readdirSync(폴더).filter((f) => f.endsWith('.json')).map((f) => path.join(폴더, f)); } catch { return []; } };

// 채점결과 — 재채점(학생 경로 B)한 학생N 파일만, 「_최종」이 있으면 그 판
const 채점 = {};
for (const 폴더 of fs.readdirSync(path.join(검증, '채점결과'))) {
  for (const 파일 of json들(path.join(검증, '채점결과', 폴더))) {
    const 이름 = path.basename(파일);
    const m = 이름.match(/^(q\d+)_학생(\d+)(_최종)?_\d{8}\.json$/);
    if (!m || !문항들.includes(m[1])) continue;
    const j = JSON.parse(fs.readFileSync(파일, 'utf8'));
    if (!j.재채점 || !Array.isArray(j.채점)) continue;
    const 키 = `${m[1]}_${m[2]}`;
    if (채점[키] && !m[3]) continue;
    채점[키] = { 문항: m[1], 번호: Number(m[2]), 파일: path.relative(path.join(검증, '..'), 파일).replace(/\\/g, '/'), j };
  }
}
// 처방전
const 처방 = {};
for (const 파일 of json들(path.join(검증, '처방전'))) {
  const m = path.basename(파일).match(/^(q\d+)_학생(\d+)_처방전\.json$/);
  if (m) 처방[`${m[1]}_${m[2]}`] = { 파일: path.relative(path.join(검증, '..'), 파일).replace(/\\/g, '/'), j: JSON.parse(fs.readFileSync(파일, 'utf8')) };
}

/** 채점결과 4축 — 소문항마다 /api/axis-grade 축 판정을 합친다 (X가 하나라도 X · 판정불가면 ? · 조각 없으면 —) */
function 채점축(j) {
  return Object.fromEntries(축들.map((이름, i) => {
    const xs = j.채점.map((g) => g.축?.축?.[i]).filter((x) => x && x.배점 > 0);
    return [이름, !xs.length ? '—' : xs.some((x) => x.판정 === 'X') ? 'X' : xs.some((x) => x.판정 === '판정불가') ? '?' : 'O'];
  }));
}
const 점수of = (j) => ({ 점수: 둘째(j.채점.reduce((a, g) => a + Number(g.out?.부분점수 || 0), 0)), 만점: 둘째(j.채점.reduce((a, g) => a + Number(g.out?.만점 || 0), 0)) });

const 번호들 = [...new Set(Object.values(채점).map((x) => x.번호))].sort((a, b) => a - b);
fs.mkdirSync(출력, { recursive: true });
const 요약 = [];
for (const 번호 of 번호들) {
  const 문항 = 문항들.map((q) => {
    const c = 채점[`${q}_${번호}`];
    if (!c) return null;
    const p = 처방[`${q}_${번호}`];
    const 축 = p ? Object.fromEntries(p.j.축.map((a) => [a.이름, a.판정])) : 채점축(c.j);
    const { 점수, 만점 } = p ? { 점수: p.j.점수, 만점: p.j.만점 } : 점수of(c.j);
    return {
      문항: q, 점수, 만점, 비율: 만점 ? 둘째(점수 / 만점) : 0, 축,
      출처: p ? '처방전 (교사 확정 판정)' : '채점결과 엔진 판정 — 처방전 보류 (판정불가가 남음)',
      채점결과: c.파일, ...(p ? { 처방전: p.파일, 막힌곳: p.j.구술?.막힌곳 || '', 잘한것: p.j.구술?.잘한것 || '', 다음: p.j.구술?.다음 || '' } : {}),
    };
  }).filter(Boolean);
  const 누적 = 축들.map((축) => {
    const 판 = (v) => 문항.filter((m) => m.축[축] === v).map((m) => m.문항);
    return { 축, O: 판('O'), X: 판('X'), 미정: 판('?'), 없음: 판('—') };
  });
  const 일관O = 누적.filter((a) => a.O.length >= 2 && !a.X.length && !a.미정.length).sort((a, b) => b.O.length - a.O.length || 축들.indexOf(a.축) - 축들.indexOf(b.축));
  const 반복X = 누적.filter((a) => a.X.length >= 2).sort((a, b) => b.X.length - a.X.length || 축들.indexOf(a.축) - 축들.indexOf(b.축));
  const 한번X = 누적.filter((a) => a.X.length === 1);
  const 공통 = 반복X[0];
  const 공통처방 = 공통
    ? { 축: 공통.축, 문항: 공통.X, 글: `${공통.축}가 ${공통.X.join(' · ')} ${공통.X.length}개 문항에서 반복해서 막혔습니다 — ${처방한줄[공통.축]}` }
    : { 축: null, 문항: [], 글: 한번X.length ? `여러 문항에서 반복해서 막힌 축은 없습니다 (한 번 막힌 축: ${한번X.map((a) => `${a.축} ${a.X[0]}`).join(' · ')}).` : '여러 문항에서 막힌 축이 없습니다.' };
  // 성장 여지 — 잘하는 것 먼저: 일관 O, 그다음 O가 X보다 많은 축 / 키울 것: X 축 (반복 먼저) + 그 문항 처방전의 막힌 곳
  const 잘하는 = [...일관O, ...누적.filter((a) => !일관O.includes(a) && a.O.length > a.X.length && a.O.length)].map((a) => ({
    축: a.축, 글: 일관O.includes(a) ? `${a.축} — ${a.O.join(' · ')} 모두 O, 꾸준히 해냅니다` : `${a.축} — ${a.O.join(' · ')} O${a.X.length ? ` (${a.X.join(' · ')}에서는 X)` : ''}`,
  }));
  const 키울 = [...반복X, ...한번X].map((a) => ({
    축: a.축, 문항: a.X, 막힌곳: a.X.map((q) => ({ 문항: q, 글: 문항.find((m) => m.문항 === q)?.막힌곳 || '' })).filter((x) => x.글),
  }));
  const 리포트 = {
    종류: 'HMOS 통합리포트', 학생: `학생 ${번호}`, 번호, 문항, 축누적: 누적,
    강점: 일관O.map((a) => a.축), 약점: 반복X.map((a) => a.축), 한번X: 한번X.map((a) => a.축),
    공통처방, 성장여지: { 잘하는것: 잘하는, 키울것: 키울 },
    총점: 둘째(문항.reduce((a, m) => a + m.점수, 0)), 총만점: 둘째(문항.reduce((a, m) => a + m.만점, 0)),
    기준: '같은 학생번호 = 같은 학생 · 반복 X = 두 문항 이상 X · 일관 O = 두 문항 이상 O이고 X · ? 없음 · 처방전 없으면 채점결과 엔진 판정',
    생성: new Date().toISOString(),
  };
  const 이름 = `학생${번호}_통합리포트.json`;
  fs.writeFileSync(path.join(출력, 이름), JSON.stringify(리포트, null, 1) + '\n', 'utf8');
  요약.push(`${이름.padEnd(20)} ${문항.map((m) => `${m.문항} ${m.점수}/${m.만점}`).join(' · ')} | 강점 ${리포트.강점.join('·') || '—'} | 반복X ${리포트.약점.join('·') || '—'} | ${공통처방.글}`);
}
console.log(요약.join('\n'));
