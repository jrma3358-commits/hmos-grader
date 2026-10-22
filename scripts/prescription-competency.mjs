// 저장된 처방전을 4역량으로 다시 쓴다 (오종래 2026-10-23) — 검증/처방전/*.json → 같은 자리 덮기, 검증/샘플/처방전/은 고친 처방전을 다시 복사.
//  판정(4축 O/X · 점수 · 잘한/막힌 조각)은 저장된 그대로 — 바꾸지 않는다.
//  · 사축(4역량 구술) — dashboard2 구술틀 · 사축구술과 같은 글 (고정 템플릿, Claude 아님)
//  · 역량 — [{이름: 개념소화력, 파트: 근거대기, 판정}] · 소화 — 삼킴형 / 문항벽 (dashboard2 소화판정과 같은 규칙, 검증/통합리포트/ 4축으로 견줌)
//  · --regen: 잘한것 · 막힌곳 · 다음(계산 실수 고정 문구는 그대로)을 /api/prescription(새 지시문 — 역량 이름)으로 다시 쓴다. 하나씩 차례로.
//      HMOS_URL(기본 http://127.0.0.1:3000) · HMOS_COOKIE(hmos_access 쿠키 값) — 실패하면 그 처방전의 Claude 구술은 그대로 둔다
// 사용: node scripts/integrated-report.mjs && node scripts/prescription-competency.mjs [--regen]
import fs from 'node:fs';
import path from 'node:path';

const 검증 = path.join(import.meta.dirname, '..', '검증');
const 처방전폴더 = path.join(검증, '처방전'), 샘플폴더 = path.join(검증, '샘플', '처방전'), 통합폴더 = path.join(검증, '통합리포트');
const 다시 = process.argv.includes('--regen');
const URL = process.env.HMOS_URL || 'http://127.0.0.1:3000', 쿠키 = process.env.HMOS_COOKIE || '';

// ── dashboard2.html과 같은 글 (오종래 2026-10-23) ──
const 역량 = { 근거대기: '개념소화력', 세우기: '논리구성력', 풀기: '연산수행력', 답구하기: '핵심인지력' };
const 구술틀 = {
  수리: {
    근거대기: ['{K}{을} 소화한 개념소화력이 보이고', '{K}{을} 소화한 개념소화력이 보입니다'],
    세우기: ['문제가 요구하는 것을 식으로 세운 논리구성력이 탄탄하고', '문제가 요구하는 것을 식으로 세운 논리구성력이 탄탄합니다'],
    풀기: ['세운 식을 끝까지 계산해 낸 연산수행력이 정확하고', '세운 식을 끝까지 계산해 낸 연산수행력이 정확합니다'],
    답구하기: ['문제가 묻는 답에 닿은 핵심인지력이 살아 있고', '문제가 묻는 답에 닿은 핵심인지력이 살아 있습니다'],
  },
  인문: {
    근거대기: ['{K}의 핵심을 소화한 개념소화력이 보이고', '{K}의 핵심을 소화한 개념소화력이 보입니다'],
    세우기: ['자신의 논지를 논리적으로 세운 논리구성력이 탄탄하고', '자신의 논지를 논리적으로 세운 논리구성력이 탄탄합니다'],
    풀기: ['근거를 들어 논증을 펼친 연산수행력이 정확하고', '근거를 들어 논증을 펼친 연산수행력이 정확합니다'],
    답구하기: ['논제가 묻는 결론에 닿은 핵심인지력이 살아 있고', '논제가 묻는 결론에 닿은 핵심인지력이 살아 있습니다'],
  },
};
const 흔적문구 = (이름들) => `${이름들.join(' · ')}이 아직 소화되지 않은 흔적이 있습니다.`;
const 계산실수문구 = '풀이 과정은 맞았으나 마지막 계산을 한 번 더 확인해 보세요.';
function 을를(글) {
  const c = String(글).replace(/[」』"'\s)\]]+$/, '').slice(-1);
  const n = c.charCodeAt(0) - 0xac00;
  if (n >= 0 && n < 11172) return n % 28 ? '을' : '를';
  if (/\d/.test(c)) return '0136781'.includes(c) ? '을' : '를';
  return '을(를)';
}
function 사축구술(v) {
  const 틀 = 구술틀[v.갈래];
  const 급소들 = [...new Set(v.급소.map((g) => String(g.글 || '').replace(/^[,，\s]+/, '').trim()).filter(Boolean))];
  const K = 급소들.length ? 급소들.map((g) => `「${g}」`).join(' · ') : v.갈래 === '수리' ? '문제의 핵심 개념' : '제시문과 개념';
  const 남 = v.축.filter((a) => !(v.계산실수 && (a.이름 === '풀기' || a.이름 === '답구하기')));
  const O = 남.filter((a) => a.판정 === 'O'), X = 남.filter((a) => a.판정 === 'X');
  const 앞 = O.length ? O.map((a, i) => 틀[a.이름][i === O.length - 1 ? 1 : 0].replace('{K}', K).replace('{을}', 을를(K))).join(', ') + '.' : '';
  return [앞, X.length ? 흔적문구(X.map((a) => 역량[a.이름])) : '', v.계산실수 ? 계산실수문구 : ''].filter(Boolean).join(' ');
}
const 통합 = Object.fromEntries(fs.readdirSync(통합폴더).filter((f) => /^학생\d+_통합리포트\.json$/.test(f)).map((f) => { const j = JSON.parse(fs.readFileSync(path.join(통합폴더, f), 'utf8')); return [j.번호, j]; }));
function 소화판정(v) {
  const X = v.축.filter((a) => a.판정 === 'X' && !(v.계산실수 && a.이름 === '답구하기'));
  const 나 =통합[Number((String(v.학생).match(/\d+/) || [])[0])];
  if (!X.length || !나) return [];
  const 남 = 나.문항.filter((m) => m.문항 !== v.문항번호);
  return X.map((a) => {
    const 이름 = 역량[a.이름], Xs = 남.filter((m) => m.축[a.이름] === 'X').map((m) => m.문항), Os = 남.filter((m) => m.축[a.이름] === 'O').map((m) => m.문항);
    if (!Xs.length && !Os.length) return null;
    if (Xs.length + 1 >= 2 && Xs.length + 1 >= Os.length) return { 역량: 이름, 판정: '삼킴형', 글: `${이름} — 다른 문항(${Xs.join(' · ')})에서도 같은 흔적이 있어요. 모르는 게 아니라, 「알았다」 하고 급히 삼키고 넘어가는 습관일 수 있어요. 한 단계를 끝까지 소화하고 넘어가 보세요.` };
    return { 역량: 이름, 판정: '문항벽', 글: `${이름} — 다른 문항(${Os.join(' · ')})에서는 잘 소화했어요${Xs.length ? ` (${Xs.join(' · ')}에서만 한 번 더)` : ''}. 힘이 모자란 게 아니라 이 문항이 벽이었던 거예요. 이 문항에 쓰인 기초 개념을 다져 보세요.` };
  }).filter(Boolean);
}
async function 구술받기(p, v) {
  const r = await fetch(URL + '/api/prescription', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `hmos_access=${쿠키}` },
    body: JSON.stringify({ 학생: p.학생, 문항: p.문항, 갈래: v.갈래, 급소: p.급소, 축: p.축, 막힌: p.막힌조각 || [], 잘한: p.잘한조각 || [], 계산실수: v.계산실수 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

const 요약 = [];
for (const f of fs.readdirSync(처방전폴더).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))) {
  const 파일 = path.join(처방전폴더, f), p = JSON.parse(fs.readFileSync(파일, 'utf8'));
  const 구 = p.구술 || {};
  const v = { 학생: p.학생, 문항번호: p.문항번호, 갈래: p.갈래 === '수리계산' ? '수리' : '인문', 급소: p.급소 || [], 축: p.축, 계산실수: !!구.규칙 };
  let 새구 = { ...구, 사축: 사축구술(v) }, 표 = '';
  if (다시 && !구.실패) {
    try {
      const o = await 구술받기(p, v);
      새구 = { ...새구, 잘한것: o.잘한것, 막힌곳: o.막힌곳, ...(구.규칙 ? {} : { 다음: o.다음 }) };
      if (o.검사?.length) 새구.확인필요 = o.검사; else delete 새구.확인필요;
      표 = o.검사?.length ? ` · 확인 필요 ${o.검사.length}` : ' · 구술 다시 씀';
    } catch (e) { 표 = ` · 구술 다시 쓰기 실패 (${e.message}) — 그대로 둠`; }
  }
  const 새 = { ...p, 역량: p.축.map((a) => ({ 이름: 역량[a.이름], 파트: a.이름, 판정: a.판정 })), 소화: 소화판정(v), 구술: 새구, 역량개정: new Date().toISOString() };
  fs.writeFileSync(파일, JSON.stringify(새, null, 1) + '\n', 'utf8');
  const 샘플 = path.join(샘플폴더, f.replace(/\.json$/, '_샘플.json'));
  if (fs.existsSync(샘플)) {
    const s = JSON.parse(fs.readFileSync(샘플, 'utf8'));
    fs.writeFileSync(샘플, JSON.stringify({ ...새, 이름: s.이름, 샘플원본: s.샘플원본 }, null, 1) + '\n', 'utf8');
  }
  요약.push(`${f.padEnd(20)} ${새.소화.map((s) => `${s.역량} ${s.판정}`).join(' · ') || '—'}${표}${fs.existsSync(샘플) ? ' · 샘플' : ''}\n   ${새구.사축}`);
}
console.log(요약.join('\n'));
