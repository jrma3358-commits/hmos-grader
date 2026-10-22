
const express=require('express');

const {execFile}=require('child_process');

const path=require('path');

const fs=require('fs');

const os=require('os');

const app=express();

const PORT=3000;

const GRADER=path.join(__dirname,'hmos-grader');

// 0단계 문항 등록이 이미지·PDF를 base64로 보낸다 — nginx client_max_body_size 20m과 맞춘다
app.use(express.json({limit:'20mb'}));

// ── 홈 · 접속 비밀번호 (2026-10-14) ─────────────────────────────────────────
// / = 홈(home.html). 「문항 분석 시작하기」 → 비밀번호 → POST /api/access → 맞으면 쿠키 → /dashboard.
// 비밀번호는 .env ACCESS_PASSWORD. 쿠키 값은 비밀번호로 만든 HMAC이라 비밀번호를 바꾸면 이전 쿠키는 모두 무효.
// 대시보드 파일(hmos_dashboard.html)을 정적 경로로 바로 여는 것도 /dashboard로 돌린다 — 정적 서빙보다 먼저 둔다.
const crypto=require('crypto');
const 접속쿠키='hmos_access';
const 접속시간=12*60*60;  // 초 — 12시간
const 접속값=()=>{
  const pw=process.env.ACCESS_PASSWORD;
  return pw?crypto.createHmac('sha256',pw).update('hmos-dashboard-access-v1').digest('hex'):null;
};
function 쿠키(req,이름){
  for(const 조각 of String(req.headers.cookie||'').split(';')){
    const i=조각.indexOf('=');
    if(i>0&&조각.slice(0,i).trim()===이름)return decodeURIComponent(조각.slice(i+1).trim());
  }
  return '';
}
const 같음=(a,b)=>{
  const x=crypto.createHash('sha256').update(String(a)).digest(),y=crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x,y);
};
const 접속됨=req=>{const v=접속값();return !!v&&같음(쿠키(req,접속쿠키),v);};

// 비밀번호 대입 막기 — IP마다 10분에 10번 틀리면 잠시 막는다
const 틀림=new Map();
const 접속IP=req=>req.headers['x-real-ip']||req.socket.remoteAddress||'';

app.post('/api/access',(req,res)=>{
  const 값=접속값();
  if(!값){res.status(503).json({ok:false,error:'접속 비밀번호가 서버에 설정되지 않았습니다 — 관리자에게 문의하세요'});return;}
  const ip=접속IP(req),now=Date.now();
  const 기록=(틀림.get(ip)||[]).filter(t=>now-t<10*60*1000);
  if(기록.length>=10){res.status(429).json({ok:false,error:'여러 번 틀렸습니다. 잠시 뒤 다시 시도하세요'});return;}
  const pw=typeof(req.body&&req.body.비밀번호)==='string'?req.body.비밀번호:'';
  if(!pw||!같음(pw,process.env.ACCESS_PASSWORD)){
    기록.push(now);틀림.set(ip,기록);
    res.status(401).json({ok:false,error:'비밀번호가 맞지 않습니다'});return;
  }
  틀림.delete(ip);
  const 보안=req.headers['x-forwarded-proto']==='https'?'; Secure':'';
  res.setHeader('Set-Cookie',`${접속쿠키}=${값}; Path=/; Max-Age=${접속시간}; HttpOnly; SameSite=Lax${보안}`);
  res.json({ok:true});
});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'home.html')));
// /about = HMOS 이야기 (기원 헌장 · 발견 · 실현) — 홈처럼 비밀번호 없이 연다 (2026-10-15)
app.get('/about',(req,res)=>res.sendFile(path.join(__dirname,'about.html')));
// /guide = 시연 안내 (오종래 2026-10-21) — 질문 설계 도구 · 문항 분석 · 채점 대시보드 단계 카드. /about처럼 누구나 (데이터 없음)
app.get('/guide',(req,res)=>res.sendFile(path.join(__dirname,'guide.html')));
app.get('/guide.html',(req,res)=>res.redirect(302,'/guide'));
// 탭 아이콘 — 대시보드처럼 <link rel=icon>이 없는 화면은 /favicon.ico를 찾는다. SVG를 그대로 내준다
app.get('/favicon.ico',(req,res)=>res.type('image/svg+xml').sendFile(path.join(__dirname,'favicon.svg')));
app.get('/dashboard',(req,res)=>{
  if(!접속됨(req)){res.redirect(302,'/?login=1');return;}
  res.setHeader('Cache-Control','no-store');
  res.sendFile(path.join(__dirname,'hmos_dashboard.html'));
});
app.get('/hmos_dashboard.html',(req,res)=>res.redirect(302,'/dashboard'));
// /grader = 채점 솔루션 (2026-10-15) — 비밀번호 칸이 페이지 안에 있어 쿠키 없이도 연다. 채점·OCR API는 아래 쿠키 검사로 막힌다.
// GET /api/access = 쿠키가 살아 있는가만 알려 준다 (페이지가 비밀번호 칸을 띄울지 정한다)
app.get('/api/access',(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({ok:접속됨(req)});});
// [오종래 2026-10-17] /grader는 6탭 채점 대시보드로 옮긴다 — grader.html은 서버에 남지만 이 주소로는 열지 않는다
app.get('/grader',(req,res)=>{
  res.redirect('/dashboard2');
});
app.get('/grader.html',(req,res)=>res.redirect(302,'/grader'));
// /dashboard2 = 6탭 채점 대시보드 (오종래 2026-10-17) — 문항 입력 · 인식 결과 · 채점 결과 · 루브릭 · 모범답안 · 교사 확정. /dashboard처럼 접속 쿠키가 있어야
app.get('/dashboard2',(req,res)=>{
  if(!접속됨(req)){res.redirect(302,'/?login=1&next=dashboard2');return;} // 홈에서 비밀번호를 넣으면 이 화면으로 돌아온다
  res.setHeader('Cache-Control','no-store');
  res.sendFile(path.join(__dirname,'dashboard2.html'));
});
app.get('/dashboard2.html',(req,res)=>res.redirect(302,'/dashboard2'));
// /tools = 질문 설계 도구 (오종래 2026-10-19) — 논술(0~4 /analyze · 5 /api/refine · 6 /api/propose · 7 교사 확정) · 면접 · 수행평가. 같은 접속 쿠키
app.get('/tools',(req,res)=>{
  if(!접속됨(req)){res.redirect(302,'/?login=1&next=tools');return;}
  res.setHeader('Cache-Control','no-store');
  res.sendFile(path.join(__dirname,'tools.html'));
});
app.get('/tools.html',(req,res)=>res.redirect(302,'/tools'));

// ── GET /api/results · /api/results/:파일 — 검증/ 폴더 채점 결과 JSON (dashboard2 탭3, 오종래 2026-10-17) ──
// nginx가 .json 주소와 /hmos-grader 경로를 막아 API로 읽는다. 읽기만 한다. GET은 아래 접속 검사를 지나므로 여기서 쿠키를 본다
const 검증폴더=path.join(process.env.HMOS_GRADER||GRADER,'검증');
// [오종래 2026-10-21] 채점 기록은 검증/채점결과/q3/ · 기타/ … 로 옮겼다 — 검증/ 맨 위와 채점결과/(맨 위 · 하위 폴더 한 겹)를 함께 읽는다. 파일 id = 검증/ 아래 경로 (「채점결과/q3/q3_학생1_20261017.json」)
const json들=(폴더,앞='')=>{try{return fs.readdirSync(폴더,{withFileTypes:true}).filter(d=>d.isFile()&&d.name.endsWith('.json')).map(d=>앞+d.name);}catch(_){return [];}};
const 검증파일들=()=>{
  const 채점=path.join(검증폴더,'채점결과');
  let 하위=[];try{하위=fs.readdirSync(채점,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch(_){}
  return [...json들(검증폴더),...json들(채점,'채점결과/'),...하위.flatMap(d=>json들(path.join(채점,d),`채점결과/${d}/`))].sort();
};
app.get('/api/results',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 목록=[];
  for(const 파일 of 검증파일들()){
    try{
      const j=JSON.parse(fs.readFileSync(path.join(검증폴더,파일),'utf8'));
      if(!j||!j.루브릭||!Array.isArray(j.채점))continue;
      const 합=k=>j.채점.reduce((a,g)=>a+Number((g.out&&g.out[k])||0),0);
      // 조각 요약 · 문항 · 학생 답 앞부분 — 탭7 채점 샘플 카드 (2026-10-17). 판정 · 오류 · 다경로는 JSON(엔진 출력) 그대로
      const 조각=j.채점.flatMap(g=>((g.out&&g.out.조각별)||[]).map(c=>({번호:g.번호??null,id:c.조각id,파트:c.파트,결과:c.결과,득점:c.득점,배점:c.배점,...(c.오류?{오류:c.오류}:{}),...(c.다경로?{다경로:c.다경로,다경로식:c.다경로식||''}:{})})));
      목록.push({파일,문항번호:(파일.split('/').pop().match(/^q\d+/)||[''])[0],학생:j.학생||null,부분점수:Math.round(합('부분점수')*100)/100,만점:Math.round(합('만점')*100)/100,엔진:(j.채점[0]&&j.채점[0].out&&j.채점[0].out.엔진&&j.채점[0].out.엔진.commit)||null,
        계열:(j.루브릭.out&&j.루브릭.out.계열)||j.계열||null, // 탭7 계열 묶음 (2026-10-17)
        문항:String(j.문항||'').slice(0,400),학생답:String(j.학생답||'').slice(0,400),조각});
    }catch(_){}
  }
  res.json({ok:true,목록});
});
app.get('/api/results/*file',(req,res)=>{ // file = 검증/ 아래 경로 (.json 없이, 「채점결과/q3/q3_학생1_20261017」)
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  // 주소에는 .json을 붙이지 않는다 — nginx가 .json으로 끝나는 주소를 막는다 (이름만 받아 여기서 붙인다)
  const 이름=[].concat(req.params.file||[]).join('/');
  const 파일=이름.endsWith('.json')?이름:이름+'.json';
  // 목록에 있는 이름만 — 경로 문자로 폴더 밖을 열지 못하게
  if(!검증파일들().includes(파일)){res.status(404).json({ok:false,error:'채점 결과 파일이 없습니다'});return;}
  res.type('application/json').send(fs.readFileSync(path.join(검증폴더,파일),'utf8'));
});

// ── /report · GET /api/report — 채점 리포트 (오종래 2026-10-22) ──
// 학생 경로 채점 B로 재채점한 결과(재채점 칸이 있는 채점결과/ 파일)만 모은다. 점수 · 4축 · 조각 판정은 엔진 출력 그대로 더하기만 — 화면도 새로 판정하지 않는다.
//   막힌 곳 = O가 아닌 조각. 엔진확인 = 답구하기 X인데 학생 최종값이 정답의 다른 값과 같다 (정답 값이 여럿 — 엔진은 한 값만 대조, 교사 확인 표시만)
app.get('/report',(req,res)=>{
  if(!접속됨(req)){res.redirect(302,'/?login=1&next=report');return;}
  res.setHeader('Cache-Control','no-store');
  res.sendFile(path.join(__dirname,'report.html'));
});
app.get('/report.html',(req,res)=>res.redirect(302,'/report'));
const 리포트축=['근거대기','세우기','풀기','답구하기'];
const 반올림=x=>Math.round(x*100)/100;
const 채점합=채점=>{const xs=Array.isArray(채점)?채점:Object.values(채점||{});return {부분점수:반올림(xs.reduce((a,g)=>a+Number((g.out&&g.out.부분점수)||0),0)),만점:반올림(xs.reduce((a,g)=>a+Number((g.out&&g.out.만점)||0),0))};};
function 리포트학생(파일,j){
  const 이름=파일.split('/').pop().replace(/\.json$/,'');
  const 칸=이름.split('_')[1]||'';
  const 학생=/모범|규칙반영/.test(칸)?'모범':칸==='실채점'?'실채점':칸.replace(/^학생/,'학생 ');
  const 정답값=(String(j.정답||(j.정답보충&&j.정답보충.값)||'').match(/-?\d+(?:\.\d+)?/g)||[]);
  const 축=리포트축.map((이름,i)=>{
    const xs=j.채점.map(g=>g.축&&Array.isArray(g.축.축)?g.축.축[i]:null).filter(x=>x&&x.배점>0);
    const 판정=!xs.length?'조각 없음':xs.some(x=>x.판정==='X')?'X':xs.some(x=>x.판정==='판정불가')?'판정불가':'O';
    return {이름,판정,점수:반올림(xs.reduce((a,x)=>a+Number(x.점수||0),0)),배점:반올림(xs.reduce((a,x)=>a+Number(x.배점||0),0))};
  });
  const 막힘=j.채점.flatMap(g=>((g.out&&g.out.조각별)||[]).filter(x=>x.결과!=='O').map(x=>{
    const m=String(x.판단근거||'').match(/정답 값 (\S+) · 학생 최종값 (\S+)/);
    return {번호:g.번호??null,id:x.조각id,파트:x.파트,결과:x.결과,배점:x.배점,글:String(x.글||''),근거:String(x.판단근거||''),
      ...(x.파트==='답구하기'&&x.결과==='X'&&m&&m[1]!==m[2]&&정답값.includes(m[2])?{엔진확인:'정답 값이 여럿 — 엔진은 한 값만 대조합니다. 학생 최종값이 정답의 다른 값과 같습니다'}:{})};
  }));
  const 이력=(j.채점이력||[]).map(h=>({방식:h.방식,일시:h.일시||null,...채점합(h.채점)}));
  return {파일,문항:(이름.match(/^q\d+/)||[''])[0],학생,문항글:String(j.문항||''),정답:String(j.정답||(j.정답보충&&j.정답보충.값)||''),...(j.정답보충?{정답출처:j.정답보충.출처}:{}),
    ...채점합(j.채점),축,막힘,원본:이력[0]||null,이력,재채점:j.재채점};
}
// GET /api/integrated — 학생별 통합 리포트 (오종래 2026-10-22) — 검증/통합리포트/학생N_통합리포트.json (scripts/integrated-report.mjs가 만든 것) 그대로
app.get('/api/integrated',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 폴더=path.join(검증폴더,'통합리포트');
  let 파일들=[];try{파일들=fs.readdirSync(폴더).filter(f=>/^학생\d+_통합리포트\.json$/.test(f));}catch(_){}
  const 목록=파일들.map(f=>{try{return JSON.parse(fs.readFileSync(path.join(폴더,f),'utf8'));}catch(_){return null;}}).filter(Boolean).sort((a,b)=>a.번호-b.번호);
  res.json({ok:true,목록});
});
app.get('/api/report',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 목록=[];
  for(const 파일 of 검증파일들()){
    if(!파일.startsWith('채점결과/'))continue;
    try{const j=JSON.parse(fs.readFileSync(path.join(검증폴더,파일),'utf8'));if(j&&j.재채점&&Array.isArray(j.채점))목록.push(리포트학생(파일,j));}catch(_){}
  }
  res.json({ok:true,목록});
});

// ── 샘플 (오종래 2026-10-19) — 검증/샘플/<형식>/<이름>.json. tools·dashboard 0단계 「샘플 불러오기」 ──
// 목록·읽기는 GET이라 아래 접속 검사를 지나므로 여기서 쿠키를 본다. 저장(POST, 같은 이름이면 덮어쓰기)은 접속 검사를 거친다.
// 이름은 공백을 떼고 글자·숫자·_·- 만 — 경로 문자로 폴더 밖을 열거나 쓰지 못하게
const 샘플폴더=path.join(검증폴더,'샘플');
const 샘플이름=s=>{const n=String(s||'').replace(/\.json$/i,'').replace(/\s+/g,'').replace(/[^0-9A-Za-z가-힣_-]/g,'').slice(0,80);return n||null;};
// 형식별 하위 폴더 (오종래 2026-10-20) — 검증/샘플/<형식>/<이름>.json. 이름은 폴더를 건너 하나뿐이라 화면은 이름만 주고받는다
const 샘플형식폴더=['A-1','A-2','B-s1','B-s2','B-h1','B-h2','C-1a','C-2a','C-2b'];
/** 이름 → 샘플폴더 기준 경로. 형식 폴더에 없는 옛 샘플(맨 위)도 읽는다 */
const 샘플파일들=()=>{
  const 표=new Map();
  for(const 폴더 of ['',...샘플형식폴더]){
    let 파일들=[];try{파일들=fs.readdirSync(path.join(샘플폴더,폴더)).filter(f=>f.endsWith('.json'));}catch(_){}
    for(const f of 파일들){const n=f.replace(/\.json$/,'');if(!표.has(n))표.set(n,path.join(폴더,f));}
  }
  return new Map([...표].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));
};
app.get('/api/samples',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 목록=[...샘플파일들()].map(([파일,경로])=>{
    try{const j=JSON.parse(fs.readFileSync(path.join(샘플폴더,경로),'utf8'));
      return {파일,이름:j.이름||파일,형식:j.형식||null,문항명:(j.입력&&j.입력.문항명)||'',소문항:((j.결과&&j.결과.창)||[]).map(w=>w.번호),저장:j.저장||null};}
    catch(_){return {파일,이름:파일,오류:'JSON을 읽지 못함'};}
  });
  res.json({ok:true,목록});
});
app.get('/api/samples/:name',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 이름=샘플이름(req.params.name);
  const 경로=이름&&샘플파일들().get(이름);
  if(!경로){res.status(404).json({ok:false,error:'샘플이 없습니다'});return;}
  res.type('application/json').send(fs.readFileSync(path.join(샘플폴더,경로),'utf8'));
});
// 처방전 샘플 (오종래 2026-10-22) — 검증/샘플/처방전/<이름>.json. dashboard2 ⑥ 「샘플 불러오기」. 위 형식 폴더 목록에는 넣지 않는다 (분석 샘플과 따로)
const 처방전샘플폴더=path.join(샘플폴더,'처방전');
app.get('/api/prescription-samples',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  let 파일들=[];try{파일들=fs.readdirSync(처방전샘플폴더).filter(f=>f.endsWith('.json')).sort();}catch(_){}
  const 목록=파일들.map(f=>{const 파일=f.replace(/\.json$/,'');
    try{const j=JSON.parse(fs.readFileSync(path.join(처방전샘플폴더,f),'utf8'));return {파일,학생:j.학생||null,문항번호:j.문항번호||null,점수:j.점수??null,만점:j.만점??null};}
    catch(_){return {파일,오류:'JSON을 읽지 못함'};}
  });
  res.json({ok:true,목록});
});
app.get('/api/prescription-samples/:name',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 이름=샘플이름(req.params.name);
  const 파일=이름&&path.join(처방전샘플폴더,이름+'.json');
  if(!파일||!fs.existsSync(파일)){res.status(404).json({ok:false,error:'처방전 샘플이 없습니다'});return;}
  res.type('application/json').send(fs.readFileSync(파일,'utf8'));
});

// API도 접속 쿠키가 있어야 — 엔진(/analyze)·Claude 호출(/api/*) (2026-10-14).
// API는 모두 POST라 GET·HEAD(홈·정적 파일) 말고는 전부 막고 /api/access만 연다 — 경로 대소문자·인코딩으로 비켜 가지 못하게 경로 모양으로 고르지 않는다.
// 오류 모양은 대시보드가 읽는 대로: /analyze는 error.사유, /api/*는 error 글
const 접속만료='접속이 만료되었거나 비밀번호를 입력하지 않았습니다 — 홈에서 「문항 분석 시작하기」로 다시 들어오세요';
app.use((req,res,next)=>{
  if(req.method==='GET'||req.method==='HEAD'||req.path.toLowerCase()==='/api/access'||접속됨(req))return next();
  if(req.path.toLowerCase().startsWith('/api/'))res.status(401).json({ok:false,error:접속만료});
  else res.status(401).json({ok:false,error:{멈춤:'접속',종류:'접속',사유:접속만료}});
});

app.use(express.static(__dirname,{index:false}));

app.post('/api/analyze',(req,res)=>{

const q=(req.body.question||'').trim();

if(!q){res.status(400).json({error:'empty'});return;}

const tmp=path.join(os.tmpdir(),'q'+Date.now()+'.txt');

fs.writeFileSync(tmp,q,'utf8');

execFile('npx',['tsx','run.ts',tmp,'--json'],{cwd:GRADER,timeout:30000,encoding:'utf8'},(err,stdout)=>{

try{fs.unlinkSync(tmp);}catch(_){}

if(err){res.status(500).json({error:err.message});return;}

try{

const d=JSON.parse(stdout.trim());

const nodes=d.nodes||[];

const pv=(d.pivot&&d.pivot.pivot)?d.pivot.pivot:(d.pivot&&d.pivot.color)?d.pivot:{};

const colors={B:[],C:[],P:[],D:[],Q:[]};

for(const n of nodes){if(colors[n.color])colors[n.color].push(n.entity);}

res.json({parsed:{nodes,pivot:pv,colors,급소:{color:pv.color||pv.node&&pv.node.color||'',entity:pv.entity||pv.keyword||'',keyword:pv.keyword||''}}});

}catch(e){res.status(500).json({error:'parse:'+e.message,raw:stdout});}

});

});

// POST /analyze — 엔진 러너(analyze-runner.mts)를 따로 띄워 인식 → 필터까지 돌린다. 멈춘 자리는 응답의 멈춘곳에 있다
/** 러너 한 번 — 결과 JSON, 러너가 결과를 못 쓰면 {ok:false, error} */
function runAnalyze(body){
  return new Promise(resolve=>{
    const id=Date.now()+'-'+Math.random().toString(36).slice(2);
    const reqf=path.join(os.tmpdir(),'hmos-req-'+id+'.json');
    const outf=path.join(os.tmpdir(),'hmos-out-'+id+'.json');
    fs.writeFileSync(reqf,JSON.stringify(body||{}),'utf8');
    execFile(process.execPath,[path.join(__dirname,'analyze-runner.mts'),reqf,outf],{cwd:__dirname,timeout:60000,maxBuffer:10*1024*1024},(err,stdout,stderr)=>{
      let out=null;
      try{out=JSON.parse(fs.readFileSync(outf,'utf8'));}catch(_){}
      for(const f of [reqf,outf]){try{fs.unlinkSync(f);}catch(_){}}
      resolve(out||{ok:false,러너실패:true,error:{멈춤:'러너 실패',사유:(err&&err.message)||String(stderr).slice(-2000)}});
    });
  });
}

/** 러너를 하나씩 — 서버가 작아 러너 여럿을 한꺼번에 띄우면 멈춘다 (2026-10-14 스테이징에서 재인식 4개 병렬로 서버가 먹통) */
async function 하나씩(목록,fn){
  const out=[];
  for(const x of 목록)out.push(await fn(x));
  return out;
}

app.post('/analyze',async(req,res)=>{
  const out=await runAnalyze(req.body);
  res.status(out.러너실패?500:out.ok?200:400).json(out);
});

// ── POST /api/generate — HMOS 이론 기반 제안 (루브릭·모범답안·해설) ──────────
// 교사가 탭 4의 버튼을 눌렀을 때만 불린다. /analyze 인식 결과(급소·5색)를 받아 Claude API로 제안을 만든다.
const Anthropic=require('@anthropic-ai/sdk').default;
// ANTHROPIC_API_KEY는 .env에서 (pm2 --env-file=.env). 사용자 키(sk-ant-usr-)는 워크스페이스 헤더가 있어야 한다 —
// .env에 ANTHROPIC_WORKSPACE_ID가 있으면 붙인다 (scripts/run-grader.mjs와 같다, 2026-10-14 새 서버)
const client=new Anthropic(process.env.ANTHROPIC_WORKSPACE_ID?{defaultHeaders:{'anthropic-workspace-id':process.env.ANTHROPIC_WORKSPACE_ID}}:{});
const MODEL='claude-sonnet-5-5';
// /api/rubric 줄모범답안 · 소문항모범답안 — 서버 측 「default」 대체에서 reasoning_extraction 거절이 되풀이돼서
// 대체 모델을 claude-sonnet-4-6 하나로 고정한다 (오종래 2026-10-21). 서버 측 대체는 sonnet-5-5 → sonnet-5만 받아서,
// 서버 측 대체 없이 부르고 거절이면 같은 요청을 claude-sonnet-4-6으로 한 번 더 부른다
const 루브릭대체모델='claude-sonnet-4-6';
// max_tokens 16000 — sonnet-5-5는 적응형 사고가 기본이라 사고 토큰도 한도 안에 든다. 8000이면 조각 많은 인문논술(하나고 [라]~[사], 60점)에서 잘렸다 (2026-10-21)
const 루브릭최대토큰=16000;
async function 루브릭호출(params){
  params={...params,max_tokens:루브릭최대토큰};
  const msg=await client.messages.create({model:MODEL,...params});
  if(msg.stop_reason!=='refusal')return msg;
  console.warn(`/api/rubric ${MODEL} 거절 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'}) → ${루브릭대체모델}`);
  return client.messages.create({model:루브릭대체모델,...params});
}
// 명세는 정적 서빙 폴더 밖에 둔다
const SPEC=process.env.HMOS_SPEC||path.join(__dirname,'..','hmos-spec','HMOS_루브릭_구현명세-7.md');

/** 명세 F2~F6 절을 원문 그대로 잘라 시스템 프롬프트에 싣는다 — 이론을 여기서 새로 쓰지 않는다 */
function loadSpecRules(){
  const md=fs.readFileSync(SPEC,'utf8');
  return md.slice(md.indexOf('### F2.'),md.indexOf('## 3½.')).trim();
}

const SYSTEM=`너는 HMOS 루브릭 생성기다. 아래 「HMOS 루브릭 구현 명세」의 F2~F6 규칙에 따라, 주어진 문항의 조각을 역산하고 루브릭·모범답안·해설을 제안한다.

지킬 것:
- 급소(k)와 5색 노드·조합은 HMOS 질문 인식 엔진의 산출이다. 다시 계산하거나 바꾸지 말고 그대로 받는다.
- 조각은 파트 ①근거대기 ②세우기 ③풀기 ④답구하기 ⑤표현 순서로 낸다. ⑤표현은 조각 하나다.
- 각 파트의 조각 수는 F2의 「급소에서 역산한 최소 핵심 수」를 따른다. 문항 조건을 그냥 세지 않는다.
- 요소는 F3대로 파트가 정한 후보 안에서만 고른다(①: b·d / ②: c·p / ④: k·q / ③·⑤: none).
- 충족조건은 F4대로 O/X로 판정할 수 있게 쓴다. 계열이 수리면 완전 일치, 인문사회국어면 급소 도달.
- 모범조각은 F6대로 인식이 준 정보(급소·요소)를 따라 편다. 급소를 벗어난 그럴듯한 서술을 넣지 않는다.
- 배점은 쓰지 않는다. 배점은 서버가 F5 파트 지수로 계산한다.
- 규칙이 [봉인]으로 비어 있어 판단이 갈리는 곳은 문항평가에 「[가정] …」으로 밝힌다.
- 해설은 이 문항이 무엇을 묻는지(급소), 왜 그 조각들로 나뉘는지를 학생·교사가 읽을 말로 쓴다.
- 모든 출력은 한국어.

=== HMOS 루브릭 구현 명세 (F2~F6 원문) ===
${loadSpecRules()}`;

const 파트들=['①','②','③','④','⑤'];
const 파트이름={'①':'근거대기','②':'세우기','③':'풀기','④':'답구하기','⑤':'표현'};
const 파트지수={'①':2,'②':3,'③':2,'④':2,'⑤':1}; // 명세 F5 1층 (고정 2:3:2:2:1)

/** 구조화 출력 스키마 — 명세 F2~F6에 따라 역산한 조각·모범답안·해설·문항평가 */
const OUTPUT_FORMAT={
  type:'json_schema',
  schema:{
    type:'object',
    additionalProperties:false,
    required:['pieces','commentary','item_review'],
    properties:{
      pieces:{
        type:'array',
        description:'파트 순서(①→⑤)로 늘어선 조각',
        items:{
          type:'object',
          additionalProperties:false,
          required:['part','element','entity','criterion','model_piece'],
          properties:{
            part:{type:'string',enum:파트들},
            element:{type:'string',enum:['b','d','c','p','k','q','none']},
            entity:{type:'string',description:'이 조각이 다루는 문항 속 실체 (문항 표현 그대로)'},
            criterion:{type:'string',description:'F4 충족조건 — O/X 경계'},
            model_piece:{type:'string',description:'F6 모범조각 — 이 조각을 채운 답안 문장/식'},
          },
        },
      },
      commentary:{type:'string',description:'해설'},
      item_review:{type:'array',items:{type:'string'},description:'문항평가 경고·[가정]'},
    },
  },
};

/** 문항의 「[N점]」을 총배점으로 — 없으면 10 */
function totalScore(q){
  const m=q.match(/\[(\d+(?:\.\d+)?)\s*점\]/);
  return m?{총배점:Number(m[1]),가정:null}:{총배점:10,가정:'[가정] 문항에 [N점] 표기가 없어 총배점 10'};
}

app.post('/api/generate',async(req,res)=>{
  // 인식: /analyze 의 단계.인식.전체 그대로 { 조합[], 노드[], 급소[], 급소실패 }
  // 계열: 교사가 탭 4에서 고른 값 — 서버가 파이프라인으로 짐작하지 않는다
  const {문항원문,파이프라인,계열,논제,제시문,인식}=req.body||{};
  const q=(문항원문||'').trim();
  if(!q||!인식){res.status(400).json({error:'문항원문·인식이 필요합니다'});return;}
  if(!['수리','인문사회국어'].includes(계열)){res.status(400).json({error:'계열(수리·인문사회국어)을 골라야 합니다'});return;}
  if(!Array.isArray(인식.급소)||!인식.급소.length){
    res.status(422).json({error:`급소가 서지 않아 제안을 만들 수 없습니다 (${(인식.급소실패&&인식.급소실패.flag)||'급소 없음'})`});
    return;
  }

  const user=[
    `계열: ${계열} (파이프라인 ${파이프라인||'—'})`,
    `문항:\n${q}`,
    논제?`논제:\n${논제}`:'',
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문.map(p=>`[${p.id}] ${p.텍스트}`).join('\n')}`:'',
    `HMOS 인식 결과 (그대로 받을 것):\n${JSON.stringify({조합:인식.조합,노드:인식.노드,급소_k:인식.급소,...(인식.급소덩어리?{급소덩어리_논술:인식.급소덩어리}:{})},null,2)}`,
  ].filter(Boolean).join('\n\n');

  let msg;
  try{
    msg=await client.beta.messages.create({
      model:MODEL,
      max_tokens:16000,
      betas:['server-side-fallback-2026-07-01'],
      fallbacks:'default', // 안전 분류기가 거절하면 서버가 권장 모델로 다시 돌린다
      system:SYSTEM,
      output_config:{format:OUTPUT_FORMAT},
      messages:[{role:'user',content:user}],
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError){res.status(500).json({error:'API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인'});return;}
    if(e instanceof Anthropic.RateLimitError){res.status(429).json({error:'API 요청 한도 초과 — 잠시 뒤 다시'});return;}
    if(e instanceof Anthropic.APIError){res.status(502).json({error:`Claude API 오류 ${e.status}: ${e.message}`});return;}
    res.status(502).json({error:'Claude API 연결 실패: '+e.message});
    return;
  }

  if(msg.stop_reason==='refusal'){res.status(502).json({error:`모델이 거절함 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'})`});return;}
  if(msg.stop_reason==='max_tokens'){res.status(502).json({error:'응답이 max_tokens에서 잘림'});return;}
  const text=msg.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  let out=null;
  try{out=JSON.parse(text);}catch(_){}
  if(!out||!Array.isArray(out.pieces)||!out.pieces.length){
    res.status(502).json({error:`제안을 받지 못함 (stop_reason: ${msg.stop_reason})`});
    return;
  }

  // F5 배점 — 1층 파트 지수, 2층 파트 안 조각 수로 균등 분배
  const {총배점,가정}=totalScore(q);
  const 조각수=Object.fromEntries(파트들.map(p=>[p,out.pieces.filter(x=>x.part===p).length]));
  const 배점=p=>총배점*파트지수[p]/10/조각수[p];
  const 빈파트=파트들.filter(p=>!조각수[p]);

  const 축=out.pieces.map(x=>({
    소문항:`${x.part} ${파트이름[x.part]}`,
    이름:`${x.element==='none'?'':x.element+' · '}${x.entity}`,
    배점:Math.round(배점(x.part)*100)/100,
    판정:x.criterion,
  }));

  const 모범답안=out.pieces.map(x=>x.model_piece).join(' ');
  const keywords=인식.급소.map(p=>(p.keyword||p.실체||'').trim()).filter(Boolean);
  const 급소포함=keywords.some(k=>모범답안.includes(k));

  res.json({
    model:msg.model,
    usage:msg.usage,
    단계4:{
      제안:true,
      축,
      공통정책:[
        `계열 ${계열} (교사 선택) — 충족조건 O/X 경계: ${계열==='수리'?'완전 일치':'급소 도달'}`,
        `총배점 ${총배점} · 파트 지수 ①2 : ②3 : ③2 : ④2 : ⑤1 (명세 F5 1층, 고정)`,
        '파트 안 조각당 배점 = 파트 배점 ÷ 조각 수 (F5 2층)',
        '[가정] 반올림 [봉인④-a] 비어 있음 — 소수 둘째 자리까지 표시',
        '[게이트] ④(k) X → 다른 파트 상한, 상한 값은 봉인이라 비워 둠',
        ...(가정?[가정]:[]),
        ...(빈파트.length?[`조각 없는 파트: ${빈파트.join(' ')} — 그 파트 배점은 배분되지 않음`]:[]),
        ...out.item_review,
      ],
    },
    단계5:{
      제안:true,
      인식대조:{
        급소포함,
        일치여부:null, // GJ(급소일치판정)는 봉인⑤⑥ — 비어 있어 판정하지 않는다
        플래그:급소포함?null:`모범답안에 급소(${keywords.join(' / ')})가 글자로 나타나지 않음 — 교사 확인`,
      },
      조각:out.pieces.map(x=>({이름:`${x.part} ${파트이름[x.part]}${x.element==='none'?'':' · '+x.element}`,내용:x.model_piece})),
      해설:out.commentary,
    },
  });
});

// ── POST /api/rubric — C 8·9단계 루브릭·모범답안 (오종래 2026-10-14) ──────────
// 엔진이 확정 논제의 소문항마다 조각을 뽑는다 (F1 파트투영 → F2 조각역산 → F3 요소색판정 → F4 충족조건 → F5 배점 → 문항평가, 러너 작업 '루브릭').
// Claude는 엔진 조각 하나하나를 문장으로 표현할 뿐이다 — 조각·실체·배점·충족조건은 바꾸지 않는다.
// 검산은 GJ가 아니라 조각 충족 여부다: 조각 문장에 그 조각의 실체 글자가 그대로 들어 있으면 충족 (오종래 2026-10-14 — GJ는 서술문 답안에서 급소를 세우지 못함).
// 충족하지 못한 조각만 다시 쓰게 한다 — 2회까지 (오종래 2026-10-14). 그래도 못 채우면 표시만 하고 넘긴다.
// 모범답안 = 조각 문장을 파트 순서(근거대기 → 세우기 → 풀기 → 답구하기)로 이은 것.
const 루브릭재시도=2;

const RUBRIC_SYSTEM=`너는 HMOS 모범답안 작성기다. HMOS 엔진이 논제에서 뽑은 루브릭 조각을 한 조각씩 답안 문장으로 표현한다.

지킬 것:
- 조각(파트·요소·실체·확인물음·충족조건·배점)은 엔진 산출이다. 조각을 더하거나 빼거나 합치지 말고, 받은 조각마다 문장을 하나씩 쓴다.
- 각 조각 문장에는 그 조각의 「실체」 글자를 반드시 그대로 넣는다 (「경로」가 붙은 답구하기 조각은 실체 전체 대신 「급소핵심어」 글자). 실체가 어절 중간에서 끊긴 꼴(예: 「…에 미치」)이면 그 글자를 그대로 둔 채 자연스러운 활용(「…에 미치는」)으로 잇는다.
- 파트마다 하는 일:
  · 근거대기 — 실체의 뜻·개념을 제시문 근거로 밝힌다. 「제시문단락」이 붙은 근거대기 조각(인문논술)은 논제가 시킨 것이 아니라 제시문에서 실제 가져온 개념이다 — 그 단락에서 실체(단락 급소)가 무엇을 뜻하는지 밝힌다.
  · 세우기 — 실체(조건·상황)를 이 논제의 논지로 세운다. 「근거문장」이 붙은 세우기 조각은 그 제시문 문장 하나를 근거로 논지를 세운다 (인문논술: 세우기 조각 = 연결 단락의 문장 하나).
  · 풀기 — 세운 논지를 근거와 이어 전개한다.
  · 답구하기 — 논제의 급소가 요구한 것에 직접 답한다. 「경로」가 붙은 답구하기 조각(서술·논술형)은 값을 맞추는 문장이 아니라, 제시문 → 논제 요구 대상 → 급소로 따라온 길을 보이는 문장이다: 급소 핵심어(「급소핵심어」 — 급소 실체의 마지막 명사) 글자를 넣고, 경로 앞 표지(제시문 단락급소·논제 노드) 가운데 하나 이상의 글자도 그대로 넣는다.
- 근거는 주어진 제시문에서만 가져온다. 제시문에 없는 사실·용어를 지어내지 않는다. 제시문이 없으면 논제 글 안에서만 쓴다.
- 조각 문장을 받은 순서대로 이으면 한 편의 답안으로 자연스럽게 읽히게 쓴다. 조각마다 1~2문장.
- 모든 출력은 한국어.`;

const RUBRIC_FORMAT={
  type:'json_schema',
  schema:{
    type:'object',
    additionalProperties:false,
    required:['pieces'],
    properties:{
      pieces:{
        type:'array',
        items:{
          type:'object',
          additionalProperties:false,
          required:['id','text'],
          properties:{
            id:{type:'string',description:'받은 조각 id 그대로'},
            text:{type:'string',description:'이 조각을 표현한 답안 문장 — 조각의 실체 글자를 그대로 포함'},
          },
        },
      },
    },
  },
};

/** 조각의 실체 — 노드에서 오지 않은 조각은 급소 실체. 앞 쉼표·공백은 뗀다 (대시보드 displayEntity와 같다) */
const 조각실체=(c,급소)=>String(c.실체??급소.실체??'').trim().replace(/^[,，]\s*/,'');
/** 조각 문장에 있어야 하는 글자 — 서술·논술형 ④(경로)는 K 핵심어(급소 실체의 마지막 명사, 엔진 산출, 오종래 2026-10-14), 나머지는 실체 */
const K글자=(c,급소={})=>{
  const K=c.경로&&c.경로.length?c.경로[c.경로.length-1]:null;
  return K?(K.핵심어||K.실체):조각실체(c,급소);
};

/** Claude 한 번 — 조각 문장 { id: text }. 실패하면 Error(사유) */
async function 조각문장(user){
  let msg;
  try{
    msg=await 루브릭호출({
      system:RUBRIC_SYSTEM,
      output_config:{format:RUBRIC_FORMAT},
      messages:[{role:'user',content:user}],
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError)throw new Error('API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인');
    if(e instanceof Anthropic.RateLimitError)throw new Error('API 요청 한도 초과 — 잠시 뒤 다시');
    if(e instanceof Anthropic.APIError)throw new Error(`Claude API 오류 ${e.status}: ${e.message}`);
    throw new Error('Claude API 연결 실패: '+e.message);
  }
  if(msg.stop_reason==='refusal')throw new Error(`모델이 거절함 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'})`);
  if(msg.stop_reason==='max_tokens')throw new Error('응답이 max_tokens에서 잘림');
  let out=null;
  try{out=JSON.parse(msg.content.filter(b=>b.type==='text').map(b=>b.text).join(''));}catch(_){}
  if(!out||!Array.isArray(out.pieces))throw new Error(`조각 문장을 받지 못함 (stop_reason: ${msg.stop_reason})`);
  return {문장:Object.fromEntries(out.pieces.map(p=>[String(p.id),String(p.text||'').trim()])),usage:msg.usage};
}

/** 엔진 조각 → Claude에 보내는 표 */
const 조각표of=(c,급소)=>({id:c.id,파트:c.파트,요소:c.요소,실체:조각실체(c,급소),...(c.제시문?{제시문단락:`[${c.제시문.단락}]`}:{}),...(c.근거?{근거문장:`[${c.근거.단락}] ${c.근거.문장}`}:{}),...(c.경로?{경로:c.경로.map(p=>`${p.색}「${p.실체}」${p.단락?`[${p.단락}]`:''}`).join(' → '),급소핵심어:K글자(c,급소)}:{}),확인물음:c.확인물음,충족조건:c.충족조건});

// ── 모범답안 자동 생성 (오종래 2026-10-16) — 서술형 B · 논술형 C(8단계, 같은 날 추가)에 교사 모범답안이 없을 때 ──
// 엔진 인식(5색 노드·급소)과 엔진 조각(풀기 없음)을 바탕으로 Claude가 줄바꿈 원칙대로 모범답안을 쓴다:
//   앞 줄 = 근거·세우기 (세우기 실체 글자) · 풀이 단계 하나 = 한 줄 · 마지막 줄 = 답 (급소 핵심어 글자).
// 풀기 조각은 이 글을 엔진 split_solve_lines가 나눈다 — Claude는 글만 쓴다. 생성된 글은 5단계 모범답안 칸에 들어가 교사가 확인·수정한다
const LINES_SYSTEM=`너는 HMOS 서술형·논술형 모범답안 작성기다. HMOS 엔진이 논제에서 인식한 5색 노드·급소와 루브릭 조각을 바탕으로, 학생이 쓰는 모범답안을 줄 단위로 쓴다.

줄바꿈 원칙 (엔진이 줄로 풀이 단계를 나눈다 — 반드시 지킨다):
- 첫 줄: 근거와 세우기 — 제시문(자료) 근거를 대고 논제의 조건을 세운다. 「세우기 실체」 글자를 그대로 넣는다.
- 가운데 줄: 풀이 단계 하나에 한 줄. 세운 조건에서 답까지 가는 과정을 단계마다 줄을 바꿔 쓴다. 풀이 단계는 한 줄 이상. 가운데 줄에는 「세우기 실체」 글자를 다시 쓰지 않는다(「이」「그」 등으로 받는다).
- 마지막 줄: 답 — 논제가 요구한 것에 직접 답한다. 「급소핵심어」 글자를 그대로 넣고, 경로 앞 표지 가운데 하나 이상의 글자도 넣는다.

지킬 것:
- 근거는 주어진 논제·자료 안에서만 가져온다. 자료에 없는 사실·용어를 지어내지 않는다. 계산·추론은 논제가 시킨 풀이만 한다.
- 앞 소문항 모범답안이 주어지면(단계형) 앞 결과를 이어받되 되풀이하지 않는다.
- 학생 답안 문장으로 쓴다. 채점 용어(근거대기·세우기·풀기·답구하기·조각·급소·루브릭·채점·충족조건)와 「논지를 세운다」 같은 채점 틀 말투를 쓰지 않는다. 줄 머리에 번호·라벨을 붙이지 않는다.
- 모든 출력은 한국어.`;

const LINES_FORMAT={
  type:'json_schema',
  schema:{type:'object',additionalProperties:false,required:['lines'],properties:{lines:{type:'array',items:{type:'string'},description:'모범답안 줄 — 첫 줄 근거·세우기, 가운데 풀이 단계마다 한 줄, 마지막 줄 답'}}},
};

const 깨끗이=t=>String(t??'').trim().replace(/^[,，]\s*/,'');

/** 생성된 줄 점검 — 엔진 split_solve_lines가 풀기를 나눌 수 있는 꼴인가 (답 줄·세우기 줄·풀이 줄·채점 용어) */
function 줄점검(줄,s){
  const 답=s.조각.filter(c=>c.파트==='답구하기').map(c=>깨끗이(K글자(c,s.급소))).filter(Boolean);
  const 세우기=s.조각.filter(c=>c.파트==='세우기').map(c=>깨끗이(c.근거?c.근거.단락급소:c.실체)).filter(Boolean);
  const 마지막=줄[줄.length-1]||'';
  // 엔진은 세우기 실체가 답 줄 앞에서 마지막으로 나온 줄까지를 앞 구간으로 본다 — 가운데 줄에 다시 나오면 풀이 줄이 줄어든다
  const 가운데=줄.slice(1,-1);
  const 문제=[];
  if(줄.length<3)문제.push(`줄이 ${줄.length}개다 — 근거·세우기 줄, 풀이 단계 줄(하나 이상), 답 줄로 3줄 이상 쓴다`);
  if(답.length&&!답.some(t=>마지막.includes(t)))문제.push(`마지막 줄에 급소핵심어가 없다: ${답.map(t=>`「${t}」`).join(' ')}`);
  if(세우기.length&&!세우기.some(t=>(줄[0]||'').includes(t)))문제.push(`첫 줄에 세우기 실체가 없다: ${세우기.map(t=>`「${t}」`).join(' ')}`);
  const 겹친=가운데.map((l,i)=>세우기.some(t=>l.includes(t))?i+2:0).filter(Boolean);
  if(겹친.length)문제.push(`세우기 실체(${세우기.map(t=>`「${t}」`).join(' ')})가 풀이 줄(${겹친.join('·')}째 줄)에 다시 나온다 — 풀이 줄에서는 다른 말(「이」「그」 등)로 받는다`);
  const 용어=채점용어.filter(w=>줄.some(l=>l.includes(w))&&![...답,...세우기].some(t=>t.includes(w)));
  if(용어.length)문제.push(`채점 용어가 남았다: ${용어.map(w=>`「${w}」`).join(' ')}`);
  return 문제;
}

async function 줄쓰기(user){
  let msg;
  try{
    msg=await 루브릭호출({
      system:LINES_SYSTEM,output_config:{format:LINES_FORMAT},messages:[{role:'user',content:user}],
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError)throw new Error('API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인');
    if(e instanceof Anthropic.RateLimitError)throw new Error('API 요청 한도 초과 — 잠시 뒤 다시');
    if(e instanceof Anthropic.APIError)throw new Error(`Claude API 오류 ${e.status}: ${e.message}`);
    throw new Error('Claude API 연결 실패: '+e.message);
  }
  if(msg.stop_reason==='refusal')throw new Error(`모델이 거절함 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'})`);
  if(msg.stop_reason==='max_tokens')throw new Error('응답이 max_tokens에서 잘림');
  let out=null;
  try{out=JSON.parse(msg.content.filter(b=>b.type==='text').map(b=>b.text).join(''));}catch(_){}
  if(!out||!Array.isArray(out.lines))throw new Error(`모범답안 줄을 받지 못함 (stop_reason: ${msg.stop_reason})`);
  return {줄:out.lines.map(l=>String(l||'').replace(/\s*\n\s*/g,' ').trim()).filter(Boolean),usage:msg.usage};
}

/** 소문항 하나 — 엔진 인식·조각 → Claude 줄 모범답안 → 줄 점검 → 어긋나면 다시 (2회까지) */
async function 줄모범답안(s,{논제,제시문,계열,앞답안}){
  const 바탕=[
    `계열: ${계열}`,
    `이 소문항:\n${s.공통발문?s.공통발문+'\n':''}${s.번호?`(${s.번호}) `:''}${s.텍스트}`,
    `전체 논제:\n${논제}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문.map(p=>(p.id==='보기'?'〈보기〉 ':/^(?:[가-하ㄱ-ㅎ]|I{1,3}|IV|VI{0,3}|IX|X)$/.test(p.id)?`[${p.id}] `:'')+p.텍스트).join('\n\n')}`:'',
    앞답안?`앞 소문항 모범답안 (단계형 — 앞 결과를 이어받는다):\n${앞답안}`:'',
    s.인식?`엔진 5색 인식 (조합 ${s.인식.조합||'—'}):\n${s.인식.노드.map(n=>`- ${n.색} 「${n.실체}」`).join('\n')}`:'',
    `급소(엔진): 「${조각실체({},s.급소)}」`,
    `세우기 실체 (첫 줄에): ${[...new Set(s.조각.filter(c=>c.파트==='세우기').map(c=>깨끗이(c.근거?c.근거.단락급소:c.실체)).filter(Boolean))].map(t=>`「${t}」`).join(' ')||'(없음)'}`,
    `급소핵심어 (마지막 줄에): ${[...new Set(s.조각.filter(c=>c.파트==='답구하기').map(c=>깨끗이(K글자(c,s.급소))).filter(Boolean))].map(t=>`「${t}」`).join(' ')||'(없음)'}`,
    `엔진 루브릭 조각 (풀기 조각은 네가 쓴 풀이 줄로 엔진이 만든다):\n${JSON.stringify(s.조각.map(c=>조각표of(c,s.급소)),null,1)}`,
  ].filter(Boolean).join('\n\n');
  const 사용=[];
  let 줄=[],문제=[],시도=0;
  while(시도<=루브릭재시도){
    const user=시도===0?바탕:`${바탕}\n\n앞서 쓴 모범답안 줄:\n${줄.map((l,i)=>`${i+1}. ${l}`).join('\n')}\n\n고칠 것:\n${문제.map(x=>`- ${x}`).join('\n')}\n\n고쳐서 다시 쓴다.`;
    const r=await 줄쓰기(user);
    사용.push(r.usage);
    줄=r.줄;문제=줄점검(줄,s);시도++;
    if(!문제.length)break;
  }
  return {글:줄.join('\n'),시도,문제,usage:사용};
}

/** 소문항 하나 — 조각 문장 → 충족 확인 → 못 채운 조각만 다시 (2회까지) → 모범답안 */
async function 소문항모범답안(s,{논제,제시문,계열}){
  const 조각표=c=>({id:c.id,파트:c.파트,요소:c.요소,실체:조각실체(c,s.급소),...(c.제시문?{제시문단락:`[${c.제시문.단락}]`}:{}),...(c.근거?{근거문장:`[${c.근거.단락}] ${c.근거.문장}`}:{}),...(c.경로?{경로:c.경로.map(p=>`${p.색}「${p.실체}」${p.단락?`[${p.단락}]`:''}`).join(' → '),급소핵심어:K글자(c,s.급소)}:{}),확인물음:c.확인물음,충족조건:c.충족조건,엔진모범조각틀:c.모범조각틀});
  const 바탕=[
    `계열: ${계열}`,
    `이 소문항:\n${s.공통발문?s.공통발문+'\n':''}${s.번호?`(${s.번호}) `:''}${s.텍스트}`,
    `전체 논제:\n${논제}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문.map(p=>(p.id==='보기'?'〈보기〉 ':/^(?:[가-하ㄱ-ㅎ]|I{1,3}|IV|VI{0,3}|IX|X)$/.test(p.id)?`[${p.id}] `:'')+p.텍스트).join('\n\n')}`:'제시문: (없음)',
    `급소(엔진): 「${조각실체({},s.급소)}」`,
  ];
  const 문장={};
  const 사용=[];
  // 서술·논술형 ④(경로가 있는 조각) — 표지 흔적 도달 (오종래 2026-10-14): 급소 K 글자는 그 조각 문장에,
  //   경로 앞 표지(제시문 단락급소·논제 노드) 흔적은 하나 이상 답안 어디에든. 경로가 K뿐이면 K만. 나머지 조각은 실체 글자
  const 흔적=c=>{
    if(!c.경로||c.경로.length<2)return null;
    const 답안=s.조각.map(x=>문장[x.id]||'').join(' ');
    return c.경로.slice(0,-1).filter(p=>답안.includes(p.실체)).map(p=>p.실체);
  };
  const 채움=c=>{
    if(교사풀기(c))return true;
    if(!(문장[c.id]||'').includes(K글자(c,s.급소)))return false;
    const 남은흔적=흔적(c);
    return 남은흔적===null||남은흔적.length>0;
  };
  // 서술형 B 교사 풀기 조각 — 표현 = 교사 모범답안의 풀기 줄 그대로, Claude에 보내지 않는다 (오종래 2026-10-16)
  const 교사풀기=c=>!!c.풀기글;
  for(const c of s.조각)if(교사풀기(c))문장[c.id]=c.풀기글;
  const 쓸조각=s.조각.filter(c=>!교사풀기(c));
  let 시도=0;
  let 남은=쓸조각;
  while(남은.length&&시도<=루브릭재시도){
    const 일=시도===0
      ?`엔진 조각 (이 순서로 문장을 쓴다):\n${JSON.stringify(쓸조각.map(조각표),null,1)}`
      :`아래 조각은 앞서 쓴 문장이 충족하지 못했다 — 실체 글자가 빠졌거나, 경로가 붙은 답구하기 조각은 급소 글자 또는 경로 앞 표지 흔적(하나 이상)이 빠졌다. 그 글자를 그대로 넣어 이 조각들만 다시 쓴다.\n`+
       `이미 쓴 다른 조각 문장 (참고만, 다시 쓰지 말 것):\n${s.조각.filter(c=>!남은.includes(c)).map(c=>`- ${c.id}: ${문장[c.id]}`).join('\n')||'(없음)'}\n\n`+
       `다시 쓸 조각:\n${JSON.stringify(남은.map(조각표),null,1)}`;
    const r=await 조각문장([...바탕,일].join('\n\n'));
    사용.push(r.usage);
    for(const c of 남은)if(r.문장[c.id])문장[c.id]=r.문장[c.id];
    시도++;
    남은=쓸조각.filter(c=>!채움(c));
  }
  const 조각=s.조각.map(c=>({...c,표현:문장[c.id]||'',충족:채움(c),...(c.경로?{흔적:흔적(c)}:{})}));
  return {
    ...s,
    조각,
    모범답안:조각.map(c=>c.표현).filter(Boolean).join(' '),
    충족:{조각수:조각.length,충족수:조각.filter(c=>c.충족).length,시도,재시도한도:루브릭재시도},
    usage:사용,
  };
}

/** 인문 세우기 필터 (오종래 2026-10-19) — 소문항마다 엔진 세우기 조각(근거 문장)을 급소 수만큼 filterSeuwogi로 거른다.
 *  거를 것이 없는 소문항은 null. 고르는 일은 Claude, 실패하면 filterSeuwogi가 앞에서 급소 수만큼 남긴다 */
async function 세우기거르기(소문항들,계열){
  if(계열!=='인문사회국어')return 소문항들.map(()=>null);
  const {filterSeuwogiDetailed}=await import(require('url').pathToFileURL(path.join(process.env.HMOS_GRADER||GRADER,'src','rubric','filterSeuwogi.ts')).href);
  const 기록=[];
  for(const s of 소문항들){
    // 배경 제시문 단락 실체(근거.배경)는 단락마다 하나라 거르지 않는다 (오종래 2026-10-20)
    // 「모두 활용하여」 보장 조각(근거.보장 — 제시문마다 핵심 메시지 하나)도 거르지 않고, 남길 수 = max(급소 수, 제시문 수) (오종래 2026-10-20 확정)
    const 꼴=c=>({entity:c.근거.단락급소,source:c.근거.단락,text:c.근거.문장});
    const 보장=(s.조각||[]).filter(c=>c.파트==='세우기'&&c.근거&&c.근거.보장).map(꼴);
    const 원본=(s.조각||[]).filter(c=>c.파트==='세우기'&&c.근거&&!c.근거.배경&&!c.근거.보장).map(꼴);
    const 급소수=s.급소수||1;
    const 남길수=보장.length?Math.max(급소수,보장.length)-보장.length:급소수;
    if(원본.length<=남길수){기록.push(null);continue;}
    const f=남길수>0?await filterSeuwogiDetailed(원본,{keyword:s.급소.실체},남길수,'humanities',client):{결과:[],방법:'보장 하한'};
    if(f.사유)console.warn('세우기 필터 실패 — 앞에서 급소 수만큼:',f.사유);
    기록.push({원본:[...보장,...원본],남김:[...보장,...f.결과],급소수,...(보장.length?{보장수:보장.length}:{}),방법:f.방법,...(f.사유?{사유:f.사유}:{})});
  }
  return 기록;
}

/** 엔진 멈춤 → 화면 오류 글. 계열오류(수학 문항을 인문사회국어로)는 엔진 글 그대로 — 「이 문항은 수리 계열로 채점해야 합니다」 (2026-10-16) */
const 엔진실패글=(머리,r)=>r.error&&r.error.종류==='계열오류'?r.error.사유:머리+((r.error&&r.error.사유)||'알 수 없음');

// 채점 문제 형식 (dashboard2 탭1, 오종래 2026-10-19) — 서술형 B · C1 인문논술 · C2 수리논술.
// [오종래 2026-10-20 확정] 서술형 B = B-s1·B-s2(수리계산, 소문항 1개·2개 이상) · B-h1·B-h2(논리서술, 소문항 1개·2개 이상). 옛 B1·B2 대신
//   C1 = 논리서술논술(C-1a) · C2 = 수리계산논술(C-2a · C-2b)
// 지금은 받아서 결과에 그대로 돌려줄 뿐이다 — 형식별 채점 기준(프롬프트에 넣을 글)은 확정 대기
const 채점형식들=['B-s1','B-s2','B-h1','B-h2','C1','C2'];
// [오종래 2026-10-20 확정] 형식은 교사가 고른 그대로 (자동 판별 없음) — format-detect.js는 형식 → 엔진 계열만 쓴다
const 형식판별=require('./format-detect.js');
const 채점형식=req=>채점형식들.includes(req.body&&req.body.gradeFormat)?req.body.gradeFormat:null;

app.post('/api/rubric',async(req,res)=>{
  // 논제: 7단계에서 교사가 확정한 논제 글 · 계열: 교사가 8단계에서 고른 값 · 총배점: 소문항 하나의 배점 (교사 입력)
  // 모범답안: 서술형 B — 소문항 순서대로 교사 모범답안 글. 세우기 이후 ~ 답구하기 이전 줄이 풀기 조각이 된다 (오종래 2026-10-16)
  //   한 칸 글(문항 등록창)도 받는다 — 소문항 「(1)」「(2)」 줄 머리로 엔진이 나눈다
  // 정답: 검증용(채점 기준 아님) — 모범답안 답구하기 줄과 대조해 어긋나면 교사 확인 · 핵심: 출제의도 — 루브릭 참고 표시만, 급소는 바꾸지 않는다 (오종래 2026-10-16)
  // 자동답안: 서술형 B — 모범답안이 없으면 엔진 인식·조각으로 Claude가 줄 모범답안을 쓰고, 그 글로 엔진 루브릭을 다시 돌려 풀기 조각을 낸다 (오종래 2026-10-16)
  // 서술형: 서술형 B — 엔진이 서술형 급소 규칙(실체 명사 B, 서술 방식 C-F 제외)으로 인식한다 (오종래 2026-10-19)
  // 형식: 0단계 문제 형식 (C-1a면 엔진이 서술 방향 제외 급소로 인식한다, 오종래 2026-10-20) — 러너에 그대로
  // 앞답안: 소문항 창 하나 — 엔진이 이어받기 표지(「[1-3]에서 구한」)를 읽은 소문항이면 가리킨 창의 모범답안 (자동답안이 앞 결과를 이어받는다, 오종래 2026-10-20)
  // 소문항배점: 채점 대시보드 — 소문항마다 배점(수 배열) 또는 「균등」(총배점 ÷ 소문항 수). 없으면 엔진 규칙(「[N점]」 · 없으면 총배점) 그대로 (오종래 2026-10-21)
  // 계단: 수리논술 C-2 정교화 — 교사가 확정한 계단 글(소문항 차례마다 배열). 있으면 엔진이 계단을 루브릭 뼈대로 쓴다 (첫 계단 세우기 · 사이 풀기 · 목적지 답구하기, 오종래 2026-10-21)
  const {논제,계열:요청계열,총배점,제시문,공통자료,이어받기,모범답안,정답,핵심,자동답안,서술형,앞답안:요청앞답안,형식:요청형식,소문항배점,계단}=req.body||{};
  let 계열=요청계열;
  // [오종래 2026-10-20 확정] 교사가 고른 형식이 엔진 계열을 정한다 — 수리계산 B-s1·B-s2·C-2a·C-2b → 수리 · 논리서술 B-h1·B-h2·C-1a → 인문사회국어 (「자동」·교사 고른 값 대신).
  //   형식 = 계열형식(문항분석 형식 — 러너에 넘기지 않는다) · 형식 · gradeFormat(채점 대시보드) 차례로. 형식이 없으면 요청 계열 그대로
  const 형식계열=형식판별.엔진계열(req.body.계열형식||요청형식||req.body.gradeFormat);
  if(형식계열)계열=형식계열;
  const 글칸=x=>Array.isArray(x)?(x.some(v=>v!=null&&String(v).trim())?x.map(v=>v==null?null:String(v)):null):typeof x==='string'&&x.trim()?x:null;
  const t=String(논제||'').trim();
  if(!t){res.status(400).json({error:'확정 논제가 필요합니다'});return;}
  // 「자동」 — 수학 문항이면 수리, 아니면 인문사회국어를 엔진이 고른다 (서술형 B, 오종래 2026-10-16 수학 문항 계열 고정)
  if(!['수리','인문사회국어','자동'].includes(계열)){res.status(400).json({error:'계열(수리·인문사회국어)을 골라야 합니다'});return;}
  const 배점=Number(총배점);
  if(!(배점>0)){res.status(400).json({error:'총배점은 0보다 큰 수여야 합니다'});return;}

  // 제시문 — 인문논술 세우기 조각(연결 단락의 문장)을 엔진이 세는 데 쓴다
  // 공통자료: 서술형 B — 소문항 공통발문의 대화·자료를 제시문으로 (오종래 2026-10-14)
  let 세우기남길=null; // 세우기 필터가 고른 문장 (소문항 차례마다, 거르지 않은 소문항은 null)
  const 요청=답안=>({파이프라인:'C',작업:'루브릭',논제:t,계열,총배점:배점,...(Array.isArray(제시문)&&제시문.length?{제시문}:{}),...(공통자료?{공통자료:true}:{}),...(이어받기?{이어받기:true}:{}),...(서술형?{서술형:true}:{}),...(typeof 요청형식==='string'&&요청형식?{형식:요청형식}:{}),...(글칸(답안)?{모범답안:글칸(답안)}:{}),...(글칸(정답)?{정답:글칸(정답)}:{}),...(글칸(핵심)?{핵심:글칸(핵심)}:{}),...(세우기남길?{세우기남길}:{}),...(소문항배점==='균등'||(Array.isArray(소문항배점)&&소문항배점.length)?{소문항배점}:{}),...(Array.isArray(계단)&&계단.some(x=>Array.isArray(x)&&x.length)?{계단:계단.map(x=>Array.isArray(x)?x.map(t=>String(t??'')):null)}:{})});
  const 실패=r=>!r.ok||!r.단계||!r.단계.루브릭;
  let r=await runAnalyze(요청(모범답안));
  if(실패(r)){res.status(r.러너실패?500:400).json({error:엔진실패글('엔진 루브릭 실패: ',r)});return;}
  계열=r.단계.루브릭.계열; // 엔진이 정한 계열 (「자동」이면 엔진이 고른 값)
  // 세우기 필터 (오종래 2026-10-19) — 인문 세우기(연결 단락의 문장)가 급소 수보다 많으면 급소 수만큼만 남기고 엔진 루브릭을 다시 돌린다
  //   (F5 배점이 남은 조각에 나뉘도록). 필터가 실패해도 루브릭 생성은 막지 않는다
  const 필터기록=await 세우기거르기(r.단계.루브릭.소문항,계열);
  if(필터기록.some(Boolean)){
    세우기남길=필터기록.map(x=>x&&x.남김.map(s=>s.text));
    const r2=await runAnalyze(요청(모범답안));
    if(실패(r2)){res.status(r2.러너실패?500:400).json({error:엔진실패글('엔진 루브릭 실패 (세우기 필터): ',r2)});return;}
    r=r2;
  }
  const 필터붙임=()=>r.단계.루브릭.소문항.forEach((s,j)=>{if(필터기록[j])s.세우기필터={원본수:필터기록[j].원본.length,필터후수:필터기록[j].남김.length,급소수:필터기록[j].급소수,방법:필터기록[j].방법,...(필터기록[j].사유?{사유:필터기록[j].사유}:{}),원본:필터기록[j].원본};});
  필터붙임();
  const 소문항=[];
  try{
    // 모범답안 자동 생성 — 교사 모범답안이 없을 때만. 소문항 순서대로, 단계형이면 앞 생성 글을 이어받는다
    if(자동답안&&!글칸(모범답안)){
      const 생성=[];
      const 받은앞=typeof 요청앞답안==='string'&&요청앞답안.trim()?요청앞답안.trim():null;
      let 앞=null;
      for(const [j,s] of r.단계.루브릭.소문항.entries()){
        if(!s.조각||!s.조각.length){생성.push(null);continue;}
        const g=await 줄모범답안(s,{논제:t,제시문,계열,앞답안:(이어받기&&앞)||(j===0?받은앞:null)});
        생성.push(g);앞=g.글;
      }
      if(생성.some(Boolean)){
        const r2=await runAnalyze(요청(생성.map(g=>g?g.글:null)));
        if(실패(r2)){res.status(r2.러너실패?500:400).json({error:'엔진 루브릭 실패 (생성 모범답안): '+((r2.error&&r2.error.사유)||'알 수 없음')});return;}
        r2.단계.루브릭.소문항.forEach((s,j)=>{if(생성[j])s.자동답안={시도:생성[j].시도,문제:생성[j].문제,usage:생성[j].usage};});
        r=r2;
        필터붙임();
      }
    }
    // Claude 호출도 소문항마다 하나씩 차례로
    for(const s of r.단계.루브릭.소문항){
      소문항.push(s.조각&&s.조각.length?await 소문항모범답안(s,{논제:t,제시문,계열}):s);
    }
  }catch(e){
    res.status(502).json({error:e.message});
    return;
  }
  res.json({엔진:r.엔진,계열,총배점:배점,...(채점형식(req)?{형식:채점형식(req)}:{}),소문항});
});

// ── POST /api/answer — C 9단계 모범답안 잇기 (오종래 2026-10-14) ──────────
// 8단계 루브릭 조각 문장(엔진 조각마다 Claude가 쓴 문장)을 루브릭 경로 순서(근거대기 → 세우기 → 풀기 → 답구하기) 그대로
// 한 편의 답안 문단으로 잇는다. Claude는 잇기만 한다 — 조각을 더하거나 빼지 않고, 새 사실을 지어내지 않는다.
// 검산은 /api/rubric과 같은 조각 흔적: 조각마다 필요한 글자(실체 · ④는 K 핵심어 + 경로 흔적 하나 이상)가 이은 문단에 남았는가.
// 빠지면 2회까지 다시 잇게 한다 (루브릭재시도). 교사 확인·수정·확정은 대시보드가 한다.
const ANSWER_SYSTEM=`너는 HMOS 모범답안 편집자다. 엔진 루브릭 조각마다 이미 쓴 답안 문장들을 받아 한 편의 답안 문단으로 자연스럽게 잇는다.

지킬 것:
- 받은 조각 순서(근거대기 → 세우기 → 풀기 → 답구하기)를 그대로 지킨다. 조각을 빼거나 합쳐 없애지 않는다.
- 각 조각의 「반드시 남길 글자」는 글자 그대로 문단에 남긴다.
- 조각 문장에 없는 사실·용어·수치를 더하지 않는다. 겹치는 말·군더더기·「제시문 [가]에서 보듯」 같은 반복 머리만 다듬고, 이음말로 문장 사이를 잇는다.
- 제시문 문장을 따옴표로 그대로 옮겨 적지 않는다 — 답안 문장으로 풀어 쓴다.
- 학생이 쓰는 답안 문장으로 쓴다. 채점 용어를 문장에 쓰지 않는다 — 파트 이름(근거대기·세우기·풀기·답구하기), 조각·급소·루브릭·채점·충족조건, 「논지를 세운다」「~라고 세울 수 있다」 같은 채점 틀 말투를 쓰지 않는다.
- 한국어 문단 하나로 낸다.`;

/** 채점 용어 — 이은 문단에 남으면 다시 잇게 한다 (오종래 2026-10-14). 일반 낱말(「세운다」)을 막지 않게 구절로 둔다 */
const 채점용어=['근거대기','세우기','풀기','답구하기','조각','급소','루브릭','채점','충족조건','논지를 세'];
/** 이은 문단에 남은 채점 용어 — 조각이 반드시 남겨야 할 글자 안에 든 말은 뺀다 */
const 남은채점용어=(글,확인)=>채점용어.filter(w=>글.includes(w)&&!확인.some(x=>x.글자.includes(w)));

const ANSWER_FORMAT={
  type:'json_schema',
  schema:{type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string',description:'이어 쓴 모범답안 문단'}}},
};

/** 이은 문단에서 조각 흔적 — /api/rubric 채움과 같은 기준 (실체 · ④는 K 핵심어 + 경로 앞 표지 하나 이상) */
function 문단흔적(글,s){
  // 교사 풀기 조각(모범답안 줄)은 실체가 없다 — 흔적을 보지 않는다 (2026-10-16)
  return s.조각.filter(c=>!c.풀기글).map(c=>{
    const 글자=K글자(c,s.급소);
    const 앞=c.경로&&c.경로.length>1?c.경로.slice(0,-1).map(p=>p.실체):null;
    const 경로흔적=앞?앞.filter(t=>글.includes(t)):null;
    return {id:c.id,글자,있음:글.includes(글자),경로흔적,충족:글.includes(글자)&&(!앞||경로흔적.length>0)};
  });
}

async function 답안잇기(user){
  let msg;
  try{
    msg=await client.beta.messages.create({
      model:MODEL,max_tokens:8000,betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
      system:ANSWER_SYSTEM,output_config:{format:ANSWER_FORMAT},messages:[{role:'user',content:user}],
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError)throw new Error('API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인');
    if(e instanceof Anthropic.RateLimitError)throw new Error('API 요청 한도 초과 — 잠시 뒤 다시');
    if(e instanceof Anthropic.APIError)throw new Error(`Claude API 오류 ${e.status}: ${e.message}`);
    throw new Error('Claude API 연결 실패: '+e.message);
  }
  if(msg.stop_reason==='refusal')throw new Error(`모델이 거절함 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'})`);
  if(msg.stop_reason==='max_tokens')throw new Error('응답이 max_tokens에서 잘림');
  let out=null;
  try{out=JSON.parse(msg.content.filter(b=>b.type==='text').map(b=>b.text).join(''));}catch(_){}
  if(!out||typeof out.text!=='string'||!out.text.trim())throw new Error(`모범답안 문단을 받지 못함 (stop_reason: ${msg.stop_reason})`);
  return {글:out.text.trim(),usage:msg.usage};
}

app.post('/api/answer',async(req,res)=>{
  // 소문항: /api/rubric 응답의 소문항 하나 그대로 (조각마다 표현·실체·경로) · 논제·제시문·계열은 바탕으로만
  // 앞답안: 단계형(서술형 B) — 앞 소문항 모범답안. 이어받아 쓴다 (오종래 2026-10-14)
  const {소문항:s,논제,계열,앞답안}=req.body||{};
  if(!s||!Array.isArray(s.조각)||!s.조각.length){res.status(400).json({error:'루브릭 조각이 있는 소문항이 필요합니다 — 8단계에서 루브릭을 먼저 만드세요'});return;}
  if(s.조각.some(c=>!String(c.표현||'').trim())){res.status(400).json({error:'문장이 없는 조각이 있습니다 — 8단계에서 루브릭을 다시 만드세요'});return;}
  const 순서=['근거대기','세우기','풀기','답구하기'];
  const 조각=[...s.조각].sort((a,b)=>순서.indexOf(a.파트)-순서.indexOf(b.파트));
  const 바탕=[
    계열?`계열: ${계열}`:'',
    `이 소문항:\n${s.공통발문?s.공통발문+'\n':''}${s.번호?`(${s.번호}) `:''}${s.텍스트||''}`,
    논제?`전체 논제:\n${논제}`:'',
    앞답안?`앞 소문항 모범답안 (단계형 — 앞에서 보인 결과를 이어받아 쓴다. 앞 답을 되풀이하지 말고 「앞에서 보인 바와 같이」처럼 받아 잇는다):\n${앞답안}`:'',
    `조각 문장 (이 순서로 잇는다):\n${조각.map((c,i)=>`${i+1}. [${c.파트}] ${c.표현}${c.풀기글?'':`\n   반드시 남길 글자: 「${K글자(c,s.급소)}」`}${c.경로&&c.경로.length>1?` · 경로 흔적 하나 이상: ${c.경로.slice(0,-1).map(p=>`「${p.실체}」`).join(' ')}`:''}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
  const 사용=[];
  let 글='',확인=[],용어=[],시도=0;
  try{
    while(시도<=루브릭재시도){
      const 빠짐=확인.filter(x=>!x.충족);
      const 고칠=[
        ...(빠짐.length?[`이 문단에서 빠진 글자가 있다 — 그 글자를 그대로 넣는다:\n${빠짐.map(x=>`- ${x.id}: 「${x.글자}」${x.경로흔적&&!x.경로흔적.length?' + 경로 흔적 하나 이상':''}`).join('\n')}`]:[]),
        ...(용어.length?[`이 문단에 채점 용어가 남았다 — 학생 답안 문장으로 바꾼다: ${용어.map(w=>`「${w}」`).join(' ')}`]:[]),
      ];
      const user=시도===0?바탕:`${바탕}\n\n앞서 이은 문단:\n${글}\n\n${고칠.join('\n\n')}\n\n고쳐서 다시 잇는다.`;
      const r=await 답안잇기(user);
      사용.push(r.usage);
      글=r.글;확인=문단흔적(글,{...s,조각});용어=남은채점용어(글,확인);시도++;
      if(확인.every(x=>x.충족)&&!용어.length)break;
    }
  }catch(e){res.status(502).json({error:e.message});return;}
  res.json({모범답안:글,확인,채점용어:용어,시도,재시도한도:루브릭재시도,usage:사용});
});

// ── POST /api/verify — C 9단계 정답 검증 (오종래 2026-10-16) ──────────
// 정답은 채점 기준이 아니라 검증이다. 엔진이 모범답안(한 문단)을 문장으로 나눠 답 문장(급소 핵심어가 마지막으로 나온 문장)과
// 정답을 대조한다 — 어긋나면 「문항 오류 또는 정답 오류」, 교사 확인은 대시보드가 받는다. Claude는 쓰지 않는다
app.post('/api/verify',async(req,res)=>{
  // 소문항: /api/rubric 응답의 소문항 하나 (조각·번호) · 모범답안: 지금 모범답안 글 · 정답: 0단계 정답 (소문항 머리 (1-1)로 엔진이 나눈다)
  const {소문항:s,모범답안,정답}=req.body||{};
  if(!s||!Array.isArray(s.조각)){res.status(400).json({error:'루브릭 조각이 있는 소문항이 필요합니다'});return;}
  const r=await runAnalyze({파이프라인:'C',작업:'정답검증',논제:'정답검증',번호:s.번호??null,조각:s.조각,모범답안:String(모범답안||''),정답:String(정답||''),단위:req.body.단위==='줄'?'줄':'문장'});
  if(!r.ok||!r.단계||!r.단계.정답검증){res.status(r.러너실패?500:400).json({error:'엔진 정답 검증 실패: '+((r.error&&r.error.사유)||'알 수 없음')});return;}
  res.json(r.단계.정답검증);
});

// ── 학생 경로 나누기 (오종래 2026-10-21 확정 B · Hybrid) ──
// [오종래 2026-10-21 확정 — Claude는 조각 분리만, O/X 판단은 엔진] 이 프롬프트 · 스키마에 O/X · 맞음 · 점수 칸을 넣지 않는다. 판정은 러너 → src/rubric/path_grade.ts
// Claude는 학생 답을 학생이 쓴 순서대로 파트(근거대기·세우기·풀기·답구하기) 단계로 나누고, 모범답안과 다른 경로면 「다경로」만 표시한다.
// O/X · 계산이 맞는지는 판단하지 않는다 — 단계마다 계산(양변) · 같은 단계 모범 값 · 최종값 정답 대조는 엔진(src/rubric/path_grade.ts), 점수는 코드, 확정은 교사(⑤)
const PATH_SYSTEM=`너는 HMOS 학생 답안 분리기다. 학생 답안을 학생이 쓴 풀이 경로 그대로 파트별 단계로 나눈다.

파트:
- 근거대기: 문제의 조건·개념을 확인한 단계 (계산 없음 — 「모음은 a, a, e이다」)
- 세우기: 문제 조건을 식으로 세운 단계 — 경우를 나누어 각 경우의 수를 식으로 세운 줄, 부분 값을 구하는 식 줄
- 풀기: 세운 식들을 이어 계산·결합한 단계 — 경우 값을 더하거나 곱한 줄
- 답구하기: 최종 답을 낸 단계 (결론 줄)

지킬 것:
- 너는 채점하지 않는다. 단계가 맞는지·계산이 맞는지·값이 정답인지 판단하지 않고 말하지도 않는다. 점수를 매기지 않는다.
- 글: 학생 답안의 줄을 한 글자도 바꾸지 않고 그대로 옮긴다 (한 줄 또는 이어진 여러 줄). 학생 답에 없는 글을 만들지 않는다.
- 학생이 쓴 순서대로 나눈다. 루브릭에 있는 파트는 학생 답에 그 내용이 있으면 빠짐없이 채운다.
- 결론 줄이 결합 계산과 최종 답을 함께 담으면(「따라서 24+48=72가지」 「∴ 4×24=96(가지)」) 같은 줄을 풀기 단계와 답구하기 단계에 모두 쓴다.
- 대응: 그 단계가 모범답안의 어느 조각 줄과 같은 단계(같은 자리의 계산)인지 그 조각 id. 같은 단계가 없으면 "".
- 다경로: 모범답안과 다른 방법·다른 경로로 푼 단계면 true (예: 같은 것이 있는 순열 대신 경우를 나누어 셈 · 여사건). 같은 방법인데 값만 다르면 false — 값이 맞는지는 보지 않는다.
- 까닭: 다경로면 어떤 경로인지 한 줄, 아니면 대응한 까닭 한 줄. 교사가 읽는 말로, 맞다·틀리다는 쓰지 않는다.
- 모든 출력은 한국어.`;
const PATH_FORMAT=ids=>({type:'json_schema',schema:{type:'object',additionalProperties:false,required:['단계'],properties:{단계:{type:'array',items:{type:'object',additionalProperties:false,required:['파트','글','대응','다경로','까닭'],properties:{
  파트:{type:'string',enum:['근거대기','세우기','풀기','답구하기']},
  글:{type:'string',description:'학생 답안 줄 그대로'},
  대응:{type:'string',enum:[...ids,''],description:'같은 단계의 모범 조각 id, 없으면 ""'},
  다경로:{type:'boolean'},
  까닭:{type:'string'},
}}}}}});
/** 소문항 하나의 학생 답 → 학생 단계들 (Claude). 글이 학생 답에 없으면 경고 */
async function 경로나누기(s,학생답,모범답안){
  const ids=s.조각.map(c=>c.id);
  const 모범줄=c=>c.줄글||c.풀기글||(c.모범답?c.모범답.줄:'')||c.실체||'';
  const user=[
    `문항:\n${[s.공통발문,s.텍스트].filter(Boolean).join('\n')}`,
    `모범답안:\n${String(모범답안||s.모범답안글||s.모범답안||'(없음)')}`,
    `루브릭 조각 (모범답안 경로 — 참고):\n${s.조각.map(c=>`- ${c.id} · ${c.파트} · ${c.배점}점 · 「${모범줄(c)}」`).join('\n')}`,
    `학생 답안:\n${학생답}`,
  ].join('\n\n');
  let msg;
  try{
    msg=await client.beta.messages.create({
      model:MODEL,max_tokens:8000,betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
      system:PATH_SYSTEM,output_config:{format:PATH_FORMAT(ids)},messages:[{role:'user',content:user}],
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError)throw new Error('API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인');
    if(e instanceof Anthropic.RateLimitError)throw new Error('API 요청 한도 초과 — 잠시 뒤 다시');
    if(e instanceof Anthropic.APIError)throw new Error(`Claude API 오류 ${e.status}: ${e.message}`);
    throw new Error('Claude API 연결 실패: '+e.message);
  }
  if(msg.stop_reason==='refusal')throw new Error(`모델이 거절함 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'})`);
  if(msg.stop_reason==='max_tokens')throw new Error('응답이 max_tokens에서 잘림');
  let out=null;
  try{out=JSON.parse(msg.content.filter(b=>b.type==='text').map(b=>b.text).join(''));}catch(_){}
  if(!out||!Array.isArray(out.단계))throw new Error(`학생 단계를 받지 못함 (stop_reason: ${msg.stop_reason})`);
  const 붙인=t=>String(t||'').replace(/\s+/g,'');
  const 답=붙인(학생답);
  const 단계=out.단계.map(d=>({파트:d.파트,글:String(d.글||'').trim(),대응:d.대응||null,다경로:!!d.다경로,까닭:String(d.까닭||'')})).filter(d=>d.글);
  const 없는글=단계.filter(d=>!답.includes(붙인(d.글))).map(d=>d.글);
  return {단계,usage:msg.usage,...(없는글.length?{경고:`학생 답에 없는 글로 나눈 단계가 있습니다 — ${없는글.map(t=>`「${t}」`).join(' ')}`}:{})};
}

// ── POST /api/prescription — ⑤ 처방전 구술 (오종래 2026-10-22) ──
// [엔진 우선] 4축 O/X · 막힌 조각 · 급소는 엔진 판정 + 교사 확정 그대로 받는다. Claude는 그것을 학생에게 하는 말로 옮기기만 한다 — 판정하지 않는다.
// 구술 구조: 4축 구술(형식별 고정 템플릿 — dashboard2가 쓴다, Claude 아님, 오종래 2026-10-22 확정) → 잘한 것(O 축 학생 줄 인용) → 막힌 곳(X 축 · 조각) → 다음에 할 것(한 줄).
//   Claude는 잘한 것 · 막힌 곳 · 다음. 서버가 인용(학생 줄에 있는 글인가) · 축 이름 · 길이 · 채점 용어를 검사해 어긋나면 한 번 다시 쓰게 한다
const 처방SYSTEM=`너는 HMOS 처방전 구술자다. 교사가 확정한 채점 결과를 학생에게 직접 말하듯 짧게 옮긴다.
4축을 한 줄로 요약한 문장(잘한 축 · 못한 축)은 처방전에 따로 있다 — 너는 그 요약을 되풀이하지 않고, 잘한 곳 · 막힌 곳의 구체적인 줄과 다음에 할 것을 쓴다.

지킬 것:
- 너는 채점하지 않는다. 축마다 O · X · ?(교사 확인 중) · —(이 문항에 없음)는 받은 그대로다. 바꾸거나 새로 판단하지 않는다.
- 잘한것: O인 축만 말한다. 받은 「잘한 줄」에서 학생이 쓴 줄을 「」로 그대로 짧게 인용하고(한 글자도 바꾸지 않는다), 그 줄로 무엇을 해냈는지 1~2문장. O 축이 없으면 "".
- 막힌곳: X인 축과 막힌 조각만 말한다. 학생이 쓴 줄을 「」로 짧게 인용하고, 엔진 근거에 있는 내용만으로 무엇이 빠졌는지 1~2문장. 근거에 없는 오류를 만들지 않는다. X 축이 없으면 "".
- 다음: 한 문장. 받은 「기본 처방」(처음 X인 축)을 이 학생의 막힌 조각에 맞게 구체적으로 바꾼다. 막힌 조각 근거에 빠진 처리가 식으로 나와 있으면(예: ÷2!) 그 처리를 이름과 함께 연습할 것으로 쓴다. X 축이 없으면 다음 문항에서도 같은 순서로 풀라는 한 문장.
- 정답 값이나 모범 풀이 전체를 그대로 알려주지 않는다 (근거에 나온 빠진 처리 하나를 짚는 것은 된다). 점수 · 배점 숫자를 쓰지 않는다. ? 축을 틀렸다고 말하지 않는다.
- 축 이름은 근거대기 · 세우기 · 풀기 · 답구하기 그대로 쓴다. 해요체, 학생이 읽는 말로. 채점 용어(조각 · 판정 · 엔진 · 배점 · 루브릭)는 쓰지 않는다.
- 모든 출력은 한국어로 쓴다. 영어 낱말 · 영어 문장을 쓰지 않는다 (학생 줄 인용 「」 안의 식 · 기호는 그대로).`;
const 처방FORMAT={type:'json_schema',schema:{type:'object',additionalProperties:false,required:['잘한것','막힌곳','다음'],properties:{
  잘한것:{type:'string',description:'O 축이 없으면 빈 글'},막힌곳:{type:'string',description:'X 축이 없으면 빈 글'},다음:{type:'string',description:'한 문장'}}}};
const 처방축=['근거대기','세우기','풀기','답구하기'];
// 다음에 할 것 기본 처방 — 형식 갈래(수리계산 · 인문사회)마다
const 처방기본={
  수리:{근거대기:'풀기 전에 문제 조건과 쓰일 개념(공식 이름)을 한 줄로 먼저 적어 보세요.',세우기:'조건 하나하나가 식의 어느 부분이 되는지 짝지어 보세요.',풀기:'계산을 한 줄에 한 단계씩, 중간 값을 적어 가며 이어 보세요.',답구하기:'마지막 줄에 문제가 묻는 값을 문제의 꼴 그대로 다시 써 보세요.'},
  인문:{근거대기:'제시문에서 핵심 개념이 드러난 문장을 먼저 찾아 한 줄로 정리해 보세요.',세우기:'내 주장을 한 문장으로 먼저 적고, 그 문장이 논제의 물음에 답하는지 확인해 보세요.',풀기:'주장마다 제시문 근거를 하나씩 붙여 「왜냐하면」으로 이어 보세요.',답구하기:'마지막 문단에 논제가 묻는 것에 대한 결론을 한 문장으로 분명히 써 보세요.'},
};
const 붙임=t=>String(t||'').replace(/\s+/g,'');
/** 구술 검사 — 잘한것 인용이 O 줄에 없음 · X 축 이름, 막힌곳에 X 축이 없음, 다음이 여러 줄, 길이, 채점 용어 */
function 처방검사(o,축,잘한,막힌){
  // 막힌 조각 근거의 빠진 처리 식 (「÷2! 없음」 → ÷2!) — 다음에 그 처리가 있어야 한다
  const 처리=[...new Set((막힌||[]).flatMap(b=>[...String(b.근거||'').matchAll(/(÷\s*\d+!)\s*없음/g)].map(m=>붙임(m[1]))))];
  const O=축.filter(a=>a.판정==='O').map(a=>a.이름),X=축.filter(a=>a.판정==='X').map(a=>a.이름),틀=[];
  const 줄들=(잘한||[]).map(b=>붙임(b.글)).filter(Boolean);
  if(O.length&&줄들.length){
    const 인용=[...o.잘한것.matchAll(/「([^」]{2,})」/g)].map(m=>붙임(m[1]));
    if(!인용.length)틀.push('잘한것에 학생이 쓴 줄을 「」로 인용하지 않았다');
    else{const 없는=인용.filter(q=>!줄들.some(l=>l.includes(q)));if(없는.length)틀.push(`잘한것의 인용이 학생 줄에 없다 — 받은 잘한 줄에서 그대로: ${없는.map(q=>`「${q}」`).join(' ')}`);}
    if(o.잘한것.length<15)틀.push('잘한것이 너무 짧다 — 1~2문장');
  }
  if(!O.length&&o.잘한것.trim())틀.push('O 축이 없으니 잘한것은 빈 글');
  const 잘못X=X.filter(a=>o.잘한것.includes(a));
  if(잘못X.length)틀.push(`잘한것에 X 축 ${잘못X.join(' · ')}을 말했다 — O 축(${O.join(' · ')})만`);
  if(X.length&&!X.some(a=>o.막힌곳.includes(a)))틀.push(`막힌곳에 X 축 이름(${X.join(' · ')})이 없다`);
  if(!X.length&&o.막힌곳.trim())틀.push('X 축이 없으니 막힌곳은 빈 글');
  if(/\n/.test(o.다음.trim()))틀.push('다음은 한 문장');
  if(X.length&&o.막힌곳.length<20)틀.push('막힌곳이 너무 짧다 — 학생이 쓴 줄과 빠진 것을 1~2문장');
  if(o.다음.length<15)틀.push('다음이 너무 짧다 — 구체적인 한 문장');
  // 한국어 — 「」 인용 밖에 영어 낱말(세 글자 이상, 수학 함수 이름 빼고)이 있으면 다시 (오종래 2026-10-22)
  const 영어=[o.잘한것,o.막힌곳,o.다음].flatMap(t=>(t.replace(/「[^」]*」/g,'').match(/[A-Za-z]{3,}/g)||[])).filter(w=>!/^(lim|sin|cos|tan|log|max|min)$/i.test(w));
  if(영어.length)틀.push(`영어 낱말 ${[...new Set(영어)].slice(0,5).map(w=>`「${w}」`).join(' ')} — 모두 한국어로`);
  const 빠진처리=처리.filter(p=>!붙임(o.다음).includes(p));
  if(빠진처리.length)틀.push(`다음에 막힌 근거의 빠진 처리 ${빠진처리.map(p=>`「${p}」`).join(' ')}를 연습할 것으로 넣는다`);
  const 용어=['조각','판정','엔진','배점','루브릭'].filter(w=>[o.잘한것,o.막힌곳,o.다음].some(t=>t.includes(w)));
  if(용어.length)틀.push(`채점 용어 ${용어.map(w=>`「${w}」`).join(' ')}를 학생 말로`);
  return 틀;
}
app.post('/api/prescription',async(req,res)=>{
  // 학생 · 문항 · 급소[{번호,글}] · 축[{이름,판정:'O'|'X'|'?'|'—'}] · 막힌[{번호,파트,글,근거,교사고침}] — 모두 ⑤ 교사 확정 재집계 그대로
  //   갈래: '수리'(수리계산 B-s1 · B-s2 · C-2a · C-2b) · '인문'(인문사회 B-h1 · B-h2 · C-1a) — 기본 처방 고르기
  //   잘한[{번호,파트,글}] = 교사 확정 O 조각의 학생 줄 (잘한 것 인용 근거)
  //   계산실수 = 풀기 O · 답구하기 X (근거대기 · 세우기 X 아님) — 막힌곳은 마지막 계산 줄을 짚는다, 다음은 dashboard2 고정 문구 (오종래 2026-10-22 확정)
  const {학생,문항,급소,축,막힌,잘한,계산실수}=req.body||{};
  const 갈래=req.body&&req.body.갈래==='인문'?'인문':'수리';
  if(!Array.isArray(축)||축.length!==4||축.some(a=>!처방축.includes(a.이름)||!['O','X','?','—'].includes(a.판정))){res.status(400).json({error:'4축 판정(근거대기 · 세우기 · 풀기 · 답구하기 O/X/?/—)이 필요합니다'});return;}
  const 첫X=축.find(a=>a.판정==='X');
  const user=[
    `문항:\n${String(문항||'').slice(0,1500)}`,
    `급소: ${(급소||[]).map(g=>`${g.번호?`(${g.번호}) `:''}「${g.글||'미확인'}」`).join(' ')||'미확인'}`,
    `4축 (교사 확정):\n${축.map(a=>`- ${a.이름}: ${a.판정}`).join('\n')}`,
    `잘한 줄 (O — 학생이 쓴 줄):\n${(잘한||[]).length?(잘한||[]).slice(0,8).map(b=>`- ${b.번호?`(${b.번호}) `:''}${b.파트}: 「${String(b.글).slice(0,200)}」`).join('\n'):'없음'}`,
    `막힌 곳 (X — 학생이 쓴 줄 · 근거):\n${(막힌||[]).length?(막힌||[]).slice(0,8).map(b=>`- ${b.번호?`(${b.번호}) `:''}${b.파트}: ${String(b.글||'').trim()?`「${String(b.글).slice(0,200)}」`:'(학생이 이 단계를 쓰지 않음 — 인용하지 말고 쓰지 않았다고 말한다)'} — ${b.교사고침?'선생님이 틀렸다고 확정함':String(b.근거||'').slice(0,300)}`).join('\n'):'없음'}`,
    ...(계산실수?[`계산 실수: 풀이 과정(세우기 · 풀기)은 맞았고 마지막 계산 값이 틀렸다 — 막힌곳은 답구하기 줄을 인용해 그 마지막 계산에서 값이 어긋났다고 짚는다 (어느 계산이 틀렸는지 학생 줄에서 보이면 그 부분을 말하되 맞는 값은 쓰지 않는다)`]:[]),
    `기본 처방 (처음 X인 축${첫X?` ${첫X.이름}`:' 없음'}): ${첫X?처방기본[갈래][첫X.이름]:'다음 문항에서도 근거대기 → 세우기 → 풀기 → 답구하기 순서로 풀기'}`,
  ].join('\n\n');
  const 사용=[];let out=null,틀=[];
  try{
    for(let 시도=0;시도<2;시도++){
      // max_tokens — sonnet-5-5 사고 토큰 포함, 2000이면 구술이 잘린다 (q3 학생 7)
      const msg=await client.beta.messages.create({model:MODEL,max_tokens:8000,betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
        system:처방SYSTEM,output_config:{format:처방FORMAT},
        messages:[{role:'user',content:시도===0?user:`${user}\n\n앞서 쓴 구술:\n${JSON.stringify(out)}\n\n고칠 것:\n${틀.map(t=>'- '+t).join('\n')}\n\n고쳐서 다시 쓴다.`}]});
      사용.push(msg.usage);
      if(msg.stop_reason==='refusal')throw new Error('모델이 거절함');
      if(msg.stop_reason==='max_tokens')throw new Error('구술이 길이 한도에서 잘렸습니다 — 다시 누르세요');
      let o=null;try{o=JSON.parse(msg.content.filter(b=>b.type==='text').map(b=>b.text).join(''));}catch(_){}
      if(!o)throw new Error('구술을 받지 못했습니다 — 다시 누르세요');
      out={잘한것:String(o.잘한것||'').trim(),막힌곳:String(o.막힌곳||'').trim(),다음:String(o.다음||'').trim()};
      틀=처방검사(out,축,잘한,막힌);
      if(!틀.length)break;
    }
  }catch(e){
    // 처방전 꼬리에 그대로 찍히므로 SDK의 영어 오류 글은 한국어로 바꿔 보낸다
    const 글=e instanceof Anthropic.AuthenticationError?'API 키 인증 실패 — 관리자에게 문의하세요':e instanceof Anthropic.RateLimitError?'요청이 많아 잠시 막혔습니다 — 잠시 뒤 다시 누르세요'
      :e instanceof Anthropic.APIError?`구술 서버 오류 (${e.status||'상태 없음'}) — 잠시 뒤 다시 누르세요`:/[가-힣]/.test(e.message)?e.message:'구술 서버에 연결하지 못했습니다 — 잠시 뒤 다시 누르세요';
    res.status(502).json({error:글});return;
  }
  res.json({...out,학생:학생||null,검사:틀,usage:사용});
});

// ── POST /api/prescriptions — 처방전 저장 (오종래 2026-10-22) ── 검증/처방전/<이름>.json, 같은 이름이면 새 처방전으로 덮는다
const 처방전폴더=path.join(검증폴더,'처방전');
app.post('/api/prescriptions',(req,res)=>{
  const {이름,처방전}=req.body||{};
  const n=샘플이름(이름);
  if(!n){res.status(400).json({error:'처방전 이름은 글자 · 숫자 · _ · - 로만'});return;}
  if(!처방전||typeof 처방전!=='object'||!Array.isArray(처방전.축)){res.status(400).json({error:'저장할 처방전이 없습니다'});return;}
  try{
    fs.mkdirSync(처방전폴더,{recursive:true});
    fs.writeFileSync(path.join(처방전폴더,n+'.json'),JSON.stringify({종류:'HMOS 처방전',이름:n,...처방전,저장:new Date().toISOString()},null,1)+'\n','utf8');
  }catch(e){res.status(500).json({error:'처방전 저장 실패: '+e.message});return;}
  res.json({ok:true,파일:'검증/처방전/'+n+'.json'});
});

// ── POST /api/grade — C 8단계 학생 답안 채점 (오종래 2026-10-14) ──────────
// 엔진 G1이 조각마다 O/X를 판정한다 (봉인⑥ 조각 대조 · 봉인④-b 게이트, 계열별). Claude는 쓰지 않는다.
// 인문 세우기는 판정불가로 오고 교사가 매긴다. 교사 수정·확정·여러 학생 목록은 대시보드가 한다.
// [오종래 2026-10-21 확정 B] 채점 대시보드(dashboard2 — gradeFormat)의 수리는 학생 경로 채점 — 위 경로나누기(Claude, 단계만) → 엔진 경로채점.
//   엔진 조각 채점(모범 경로)은 모범경로로 함께 돌려준다. /dashboard · /grader(gradeFormat 없음)는 엔진 조각 채점 그대로
app.post('/api/grade',async(req,res)=>{
  // 소문항: /api/rubric 응답의 소문항 하나 그대로 (조각·급소) · 학생답: 학생 답안 글 · 계열: 8단계에서 고른 값
  const {소문항:s,학생답,계열,앞학생답}=req.body||{}; // 앞학생답: 단계형 앞 소문항들의 학생 답 (② 방정식 세우기 자동 적용, 2026-10-16)
  if(!s||!Array.isArray(s.조각)||!s.조각.length){res.status(400).json({error:'루브릭 조각이 있는 소문항이 필요합니다'});return;}
  if(!String(학생답||'').trim()){res.status(400).json({error:'학생 답안을 넣으세요'});return;}
  if(!['수리','인문사회국어'].includes(계열)){res.status(400).json({error:'계열(수리·인문사회국어)이 필요합니다'});return;}
  // 논제 = 공통 발문 + 소문항 글 — 엔진이 수학 문항인지 본다 (q4처럼 식이 공통 발문에만 있는 소문항, 2026-10-16)
  const 논제글=[s.공통발문,s.텍스트].filter(Boolean).join('\n')||'채점';
  let 경로=null,경로경고=null;
  if(채점형식(req)&&계열==='수리'){
    try{경로=await 경로나누기(s,String(학생답),req.body.모범답안);}
    catch(e){경로경고='학생 경로 나누기 실패 — 엔진 조각 채점(모범 경로)으로 보입니다: '+e.message;}
  }
  const r=await runAnalyze({파이프라인:'C',작업:'채점',논제:논제글,계열,학생답:String(학생답),앞학생답:String(앞학생답||''),조각:s.조각,급소:s.급소,
    ...(경로?{단계들:경로.단계,정답:String(req.body.정답||''),번호:s.번호??null}:{})});
  if(!r.ok||!r.단계||!r.단계.채점){res.status(r.러너실패?500:400).json({error:엔진실패글('엔진 채점 실패: ',r)});return;}
  const 형식칸=채점형식(req)?{형식:채점형식(req)}:{};
  if(경로&&r.단계.경로채점){
    const p=r.단계.경로채점,e=r.단계.채점;
    res.json({엔진:r.엔진,방식:'학생 경로',...p,경고:[...p.경고,...(경로.경고?[경로.경고]:[])],모범경로:{부분점수:e.부분점수,만점:e.만점,조각별:e.조각별},usage:경로.usage,...형식칸});
    return;
  }
  res.json({엔진:r.엔진,...r.단계.채점,...(경로경고?{경고:[...(r.단계.채점.경고||[]),경로경고]}:{}),...형식칸});
});

// ── POST /api/axis-grade — dashboard2 형식별 4축 채점 (오종래 2026-10-19 확정) ──
// 루브릭은 엔진(/api/rubric)이 문항 인식에서 낸 조각 그대로 — 조각의 파트(근거대기·세우기·풀기·답구하기)를 4축에 자동 매핑한다.
//   수리: 1 근거대기 · 2 세우기 · 3 풀기 · 4 답구하기 / 인문: 1 근거대기 · 2 세우기 · 3 논리 펼치기 · 4 답표현하기
// [오종래 2026-10-21 확정 — 4축도 엔진 판단, Claude 개입 없음] 예전에는 Claude가 조각마다 도달을 대조했다 — 지금은 /api/grade 엔진 채점(학생 경로 · 엔진 조각)을 축으로 모은다 (아래)
//   (축 O = 그 축 조각이 모두 O · 하나라도 X면 X · 판정불가가 있으면 판정불가, 점수 = 그 축 O 조각 득점 합). 엔진이 조각을 내지 않은 축은 「조각 없음」
const 축이름={수리:['근거대기','세우기','풀기','답구하기'],인문사회국어:['근거대기','세우기','논리 펼치기','답표현하기']};
const 파트축={근거대기:0,세우기:1,풀기:2,답구하기:3};
// 형식 이름 (오종래 2026-10-20 — 서술형 수리계산 · 논리서술, 논술 수리계산논술 · 논리서술논술). 옛 B1·B2 이름표는 B-s·B-h 뒤로 「undefined」가 나가던 것을 고침
const 형식이름={'B-s1':'서술형 수리계산 · 소문항 1개','B-s2':'서술형 수리계산 · 소문항 2개 이상','B-h1':'서술형 논리서술 · 소문항 1개','B-h2':'서술형 논리서술 · 소문항 2개 이상',C1:'논리서술논술',C2:'수리계산논술'};
// [오종래 2026-10-21 확정 — 4축도 엔진 판단, Claude 개입 없음] 4축 카드는 /api/grade 결과(수리 = 학생 경로 채점 path_grade · 그 밖 = 엔진 조각 판정 G1)의
//   조각 O/X · 득점을 파트 → 축으로 모으기만 한다. 엔진이 세는 조건(답구하기 ②단위 · ③형식, 답표현하기 ②분량 · ④완결, 논리 펼치기 ②기능표지)은 엔진 그대로.
//   예전에 Claude가 답하던 칸 — 수리 ①결과값은 엔진 답구하기 조각 판정으로, 인문 ①근거 추출 · ③매듭 · ①서술 형식 · ③결론은 「교사 판정」(⑤ 교사 확정)으로 둔다
/** 조건 축 — 조건(맞음 false가 하나라도 있으면 X · '교사'면 판정불가 · null은 따지지 않음)과 그 축 조각 판정을 함께 본다 */
function 조건축판정(조건목록,xs){
  const 조각X=xs.some(x=>x.결과==='X'),조각미정=xs.some(x=>x.결과==='판정불가');
  const 틀린=[...조건목록.filter(c=>c.맞음===false).map(c=>c.이름),...(조각X?['엔진 조각']:[])];
  const 교사=[...조건목록.filter(c=>c.맞음==='교사').map(c=>c.이름),...(조각미정?['엔진 조각']:[])];
  return 틀린.length?{판정:'X',근거:`${틀린.join(' · ')} 틀림`}:교사.length?{판정:'판정불가',근거:`${교사.join(' · ')} — 교사 판정`}:{판정:'O',근거:'조건 · 엔진 조각 모두 충족'};
}
app.post('/api/axis-grade',async(req,res)=>{
  // 소문항: /api/rubric 응답의 소문항 하나 · 학생답: 이 소문항 학생 답 · 계열 · 채점: 이 소문항 /api/grade 응답 그대로 (조각별 O/X · 득점)
  const {소문항:s,학생답,계열,채점}=req.body||{};
  const 형식=채점형식(req);
  if(!형식){res.status(400).json({error:'문제 형식(B-s1·B-s2·B-h1·B-h2·C1·C2)이 필요합니다'});return;}
  if(!축이름[계열]){res.status(400).json({error:'계열(수리·인문사회국어)이 필요합니다'});return;}
  if(!s||!Array.isArray(s.조각)||!s.조각.length){res.status(400).json({error:'엔진 루브릭 조각이 있는 소문항이 필요합니다'});return;}
  const 답=String(학생답||'').trim();
  if(!답){res.status(400).json({error:'학생 답안이 없습니다'});return;}
  if(!채점||!Array.isArray(채점.조각별)){res.status(400).json({error:'채점 결과(/api/grade 조각별)가 필요합니다 — 4축은 엔진 채점을 모아 셉니다'});return;}
  const 논리=계열==='인문사회국어';
  let 표지=null;
  if(논리){
    const t=await runAnalyze({파이프라인:'C',작업:'논리표지',논제:'논리표지',학생답:답});
    if(!t.ok||!t.단계||!t.단계.논리표지){res.status(502).json({error:'엔진 논리 표지 찾기 실패: '+((t.error&&t.error.사유)||'알 수 없음')});return;}
    표지=t.단계.논리표지;
  }
  const 모범=String(s.모범답안글||(s.답안&&((s.답안.확정&&s.답안.확정.글)||s.답안.교사||s.답안.글))||s.모범답안||'');
  const 답t=await runAnalyze({파이프라인:'C',작업:'답표지',논제:'답표지',계열,문항:`${s.공통발문?s.공통발문+'\n':''}${s.텍스트||''}`,학생답:답,모범답안:모범});
  if(!답t.ok||!답t.단계||!답t.단계.답표지){res.status(502).json({error:'엔진 답 조건 세기 실패: '+((답t.error&&답t.error.사유)||'알 수 없음')});return;}
  const 답표지=답t.단계.답표지;
  const 목록글=xs=>xs.length?xs.map(x=>`「${x}」`).join(' '):'없음';
  const 찾은표지=표지?Object.entries(표지).filter(([,xs])=>xs.length).map(([k,xs])=>`${k} ${xs.map(x=>`「${x}」`).join(' ')}`):[];
  const 축=축이름[계열];
  const 둘째=x=>Math.round(x*100)/100;
  // 조각 — 엔진 채점의 조각(학생 경로면 학생 단계) 그대로. 도달 = O, 판정불가는 null
  const 조각결과=채점.조각별.filter(x=>파트축[x.파트]!=null).map(x=>({id:x.조각id,파트:x.파트,축:파트축[x.파트]+1,실체:x.글||x.요소||x.조각id,배점:Number(x.배점)||0,득점:Number(x.득점)||0,결과:x.결과,
    도달:x.결과==='O'?true:x.결과==='X'?false:null,인용:String(x.글||''),근거:String(x.판단근거||'')}));
  const 축결과=축.map((이름,i)=>{
    const xs=조각결과.filter(x=>x.축===i+1);
    const 배점=둘째(xs.reduce((a,x)=>a+x.배점,0)),득점=둘째(xs.reduce((a,x)=>a+x.득점,0));
    const 조건으로=(조건목록)=>{const p=조건축판정(조건목록,xs);return {축:i+1,이름,판정:p.판정,근거:p.근거,점수:p.판정==='O'?득점:0,배점,조각수:xs.length,조건목록};};
    if(논리&&i===2)return 조건으로([
      {이름:'① 근거 추출',맞음:'교사'},
      {이름:'② 기능표지',맞음:찾은표지.length>0,덧:찾은표지.length?찾은표지.join(' · '):'엔진이 찾은 표지 없음'},
      {이름:'③ 매듭',맞음:'교사'},
    ]);
    if(i===3&&xs.length){
      const 답조각=xs.filter(x=>x.파트==='답구하기');
      const 결과값=답조각.length?(답조각.some(x=>x.결과==='X')?false:답조각.every(x=>x.결과==='O')?true:'교사'):'교사';
      return 조건으로(계열==='수리'?[
        {이름:'① 결과값',맞음:결과값,덧:답조각.map(x=>x.근거).filter(Boolean).join(' · ')},
        {이름:'② 단위',맞음:답표지.단위.맞음,덧:`기준 ${답표지.단위.기준출처} ${목록글(답표지.단위.기준)} · 학생 ${목록글(답표지.단위.학생)}`},
        {이름:'③ 형식',맞음:답표지.형식.맞음,덧:답표지.형식.요구.length?`요구 ${목록글(답표지.형식.요구)} · 학생 ${답표지.형식.학생||'값 없음'}`:'논제 요구 없음'},
      ]:[
        {이름:'① 서술 형식',맞음:'교사',덧:답표지.형식.요구.length?`논제 ${목록글(답표지.형식.요구)}`:''},
        {이름:'② 분량',맞음:답표지.분량.맞음,덧:답표지.분량.맞음===null?'논제에 분량 없음':`${답표지.분량.글자수}자 / ${답표지.분량.규칙.최소??'—'}~${답표지.분량.규칙.최대??'—'}자`},
        {이름:'③ 결론',맞음:'교사'},
        {이름:'④ 완결',맞음:답표지.완결.맞음,덧:답표지.완결.맞음?`「${답표지.완결.표지}」`:'완결 표지 없음'},
      ]);
    }
    if(!xs.length)return {축:i+1,이름,판정:'조각 없음',근거:'엔진이 이 축의 조각을 내지 않았습니다',점수:0,배점:0,조각수:0};
    const 판정=xs.some(x=>x.결과==='X')?'X':xs.some(x=>x.결과==='판정불가')?'판정불가':'O';
    const 대표=xs.find(x=>x.결과===판정)||xs[0];
    return {축:i+1,이름,판정,근거:`「${대표.실체}」 — ${대표.근거}`,점수:득점,배점,조각수:xs.length};
  });
  res.json({형식,계열,방식:'엔진',축:축결과,조각:조각결과,...(논리?{논리펼치기:{표지}}:{}),답표지,부분점수:둘째(축결과.reduce((a,x)=>a+x.점수,0)),만점:둘째(조각결과.reduce((a,x)=>a+x.배점,0))});
});

// ── POST /api/axis-rubric — dashboard2 탭2 문항분석 · 4축 루브릭 (오종래 2026-10-18) ──────────
// 1단계 엔진: 문항을 기능표지로 읽어 5색 · 급소 K (러너 C 2단계 인식, 제시문이 오면 3·4단계 연결까지) — 값은 엔진 출력 그대로
// 2단계 Claude: 엔진 5색 · K만 받아 4축(논점소환 · 세우기 · 논증펴기 · 답표현하기) 기준 문장과 축마다 닿는 엔진 노드만 쓴다.
//   점수는 코드가 정한다 — 축 배점 = 총배점 ÷ 4, 부분점수 0 · 1 (그 축의 5색 노드에 닿으면 1). 엔진에 없는 색은 Claude가 채우지 않는다
// 3단계: 검증/<이름>_루브릭.json 저장 — 탭7 채점 샘플이 /api/axis-rubrics로 읽는다
const 축들=['논점소환','세우기','논증펴기','답표현하기'];
const 오색=['B','C','P','D','Q'];
const 축루브릭파일=이름=>/^[0-9A-Za-z가-힣_-]{1,60}$/.test(이름)?이름+'_루브릭.json':null;
const 축SYSTEM=()=>`당신은 HMOS 채점 엔진입니다.
5색 분해 결과를 받아
4축(논점소환·세우기·논증펴기·답표현하기)을 도출하고
각 축별 부분점수(0·1)를 산정하는
루브릭을 생성합니다.
임의로 점수표를 만들지 않습니다.
5색 도달 여부만으로 점수를 산정합니다.

[지킬 것]
${공통지킬것}
- 축마다 「기준」 한 문장과, 학생 답이 그 축에서 닿아야 할 엔진 노드 id(도달노드)를 고른다. 도달노드는 받은 노드 id 중에서만, 한 축에 하나 이상.
- 배점·점수 숫자는 쓰지 않는다 — 배점은 총배점을 4축에 똑같이 나누고, 부분점수는 도달노드에 닿으면 1 · 아니면 0으로 코드가 센다.
- 엔진 5색에 없는 색(빈 칸)은 기준에 끌어오지 않는다. 문항 글에 있는 말로만 쓴다. 제시문 내용이나 정답을 기준에 넣지 않는다.`;
const 축Format=ids=>({type:'json_schema',schema:{type:'object',additionalProperties:false,required:축들,properties:Object.fromEntries(축들.map(a=>[a,{type:'object',additionalProperties:false,required:['기준','도달노드','근거'],properties:{
  기준:{type:'string',description:'교사가 읽는 채점 기준 한 문장'},
  도달노드:{type:'array',items:{type:'string',enum:ids},description:'이 축에서 학생 답이 닿아야 할 엔진 노드 id'},
  근거:{type:'string',description:'왜 이 노드인지 — 엔진 노드 · 급소 K로 한 줄'},
}}]))}});

app.post('/api/axis-rubric',async(req,res)=>{
  const {문항,제시문,이름}=req.body||{};
  const 총배점=Number(req.body&&req.body.총배점);
  const 파일=축루브릭파일(String(이름||'').trim());
  if(!String(문항||'').trim()){res.status(400).json({error:'문항을 넣으세요'});return;}
  if(!(총배점>0)){res.status(400).json({error:'총배점을 넣으세요'});return;}
  if(!파일){res.status(400).json({error:'저장 이름은 글자 · 숫자 · _ · - 로만 (예: q8_문항1)'});return;}
  const 목록=Array.isArray(제시문)?제시문.filter(p=>p&&String(p.텍스트||'').trim()).map(p=>({id:String(p.id||'제시문'),텍스트:String(p.텍스트)})):[];

  // 1단계 — 엔진
  const r=await runAnalyze({파이프라인:'C',논제:String(문항),...(목록.length?{제시문:목록}:{})});
  const 소=r.ok&&r.단계&&r.단계.인식&&r.단계.인식.소문항;
  if(!소||!소.length){res.status(r.러너실패?500:400).json({error:엔진실패글('엔진 인식 실패: ',r)});return;}
  if(소.length>1){res.status(400).json({error:`소문항이 ${소.length}개로 읽혔습니다 — 소문항 하나씩 넣으세요`});return;}
  const s=소[0];
  if(!s.급소||!s.급소.length){res.status(400).json({error:'엔진이 급소 K를 잡지 못했습니다'+(s.급소실패?` (${s.급소실패.flag})`:'')});return;}
  const 노드=s.노드||[];
  const 다섯=Object.fromEntries(오색.map(c=>[c,노드.filter(n=>n.색===c).map(n=>n.실체).join(' · ')]));
  const 덩=(s.급소덩어리||[])[0];
  const 색of=id=>(노드.find(n=>n.id===id)||{}).색;
  const 급소K=덩?[[색of(덩.B),...덩.C.map(색of)].filter(Boolean).join('×'),...[...new Set(덩.Q.map(색of))]].join('→'):s.급소.map(k=>k.색).join('·');
  const 엔진={commit:r.엔진&&r.엔진.commit,노드,급소:s.급소,급소덩어리:s.급소덩어리||[],연결단락:((r.단계.정합&&r.단계.정합.소문항)||[]).find(x=>x.번호===s.번호)?.연결단락||[]};

  // 2단계 — Claude: 기준 문장 · 도달노드만
  const user=`[문항]\n${s.텍스트}\n\n[엔진 5색 노드 — id · 색 · 실체 · 기능표지]\n${노드.map(n=>`${n.id} · ${n.색} · ${n.실체} · ${n.표지}`).join('\n')}\n\n[엔진 급소 K]\n${급소K} — ${s.급소.map(k=>`${k.노드} ${k.실체}`).join(' / ')}${덩?`\n급소덩어리: B ${덩.B} · C ${덩.C.join(',')||'없음'} · Q ${덩.Q.join(',')}`:''}\n\n[빈 색]\n${오색.filter(c=>!다섯[c]).join(' · ')||'없음'}\n\n4축 루브릭을 쓰십시오.`;
  const a=await askClaude(res,축SYSTEM(),user,축Format(노드.map(n=>n.id)),o=>축들.every(k=>o[k]&&String(o[k].기준||'').trim()&&Array.isArray(o[k].도달노드)&&o[k].도달노드.length)); // temperature는 이 모델에서 받지 않는다 (400) — 점수는 코드가 세니 문장만 달라진다
  if(!a)return;

  // 배점 · 부분점수 — 코드가 센다 (총배점 ÷ 4, 0.1 단위. 끝수는 마지막 축에)
  const 몫=Math.floor(총배점/축들.length*10)/10;
  const 축배점=축들.map((_,i)=>i<축들.length-1?몫:Math.round((총배점-몫*(축들.length-1))*10)/10);
  const 실체of=id=>{const n=노드.find(x=>x.id===id);return n?`${n.색} ${n.실체}`:id;};
  const 루브릭={
    문항:s.번호?`(${s.번호})`:'',
    총배점,
    '5색':다섯,
    급소K,
    급소실체:s.급소.map(k=>k.실체).join(' · '),
    '4축루브릭':Object.fromEntries(축들.map((k,i)=>[k,{기준:a.out[k].기준,배점:축배점[i],부분점수:{1:축배점[i],0:0},도달:a.out[k].도달노드.map(실체of),도달노드:a.out[k].도달노드,근거:a.out[k].근거}])),
    문항글:s.텍스트,
    엔진,
    모델:a.msg.model,
    작성:new Date().toISOString(),
  };

  // 3단계 — 저장
  try{fs.writeFileSync(path.join(검증폴더,파일),JSON.stringify(루브릭,null,1)+'\n','utf8');}
  catch(e){res.status(500).json({error:'저장 실패: '+e.message,루브릭});return;}
  res.json({파일,루브릭});
});

// ── POST /api/subq-save — 소문항 창 분석 결과 자동 저장 (오종래 2026-10-19) ──
// 검증/<문항명>_<소문항번호>.json. 같은 이름이면 덮어쓴다 (다시 분석하면 새 결과). 내용은 화면이 모은 그대로 — 여기서 고치지 않는다.
// 문항명은 공백을 떼고 글자·숫자·_·- 만 남긴다 — 경로 문자로 폴더 밖에 쓰지 못하게
const 소문항파일=(문항명,번호)=>{
  const 이름=String(문항명||'').replace(/\s+/g,'').replace(/[^0-9A-Za-z가-힣_-]/g,'').slice(0,60);
  const 번=String(번호||'').replace(/[^0-9-]/g,'').slice(0,20);
  return 이름&&번?`${이름}_${번}.json`:null;
};
app.post('/api/subq-save',(req,res)=>{
  const {문항명,번호,내용}=req.body||{};
  const 파일=소문항파일(문항명,번호);
  if(!파일){res.status(400).json({error:'문항명(글자·숫자·_·-)과 소문항 번호가 있어야 저장합니다'});return;}
  if(!내용||typeof 내용!=='object'){res.status(400).json({error:'저장할 내용이 없습니다'});return;}
  try{fs.writeFileSync(path.join(검증폴더,파일),JSON.stringify({...내용,저장:new Date().toISOString()},null,1)+'\n','utf8');}
  catch(e){res.status(500).json({error:'저장 실패: '+e.message});return;}
  res.json({ok:true,파일:'검증/'+파일});
});

// POST /api/samples — 샘플 저장 (덮어쓰기). 내용은 화면이 모은 그대로 (입력 · 형식 · 결과 C · 소문항 창, 서술형 B는 결과 AB)
app.post('/api/samples',(req,res)=>{
  const {이름,내용}=req.body||{};
  const n=샘플이름(이름);
  if(!n){res.status(400).json({error:'샘플 이름은 글자 · 숫자 · _ · - 로만'});return;}
  const 결과=내용&&typeof 내용==='object'?내용.결과:null;
  if(!결과||!((결과.C&&결과.C.분석)||(결과.AB&&결과.AB.단계2)||(Array.isArray(결과.창)&&결과.창.some(w=>w&&w.C&&w.C.분석)))){res.status(400).json({error:'저장할 분석 결과가 없습니다 — 분석을 먼저 돌리세요'});return;}
  // 형식 폴더에 둔다 (모르는 형식은 맨 위). 같은 이름이 다른 폴더에 있으면 옮긴다 — 이름은 하나뿐
  const 폴더=샘플형식폴더.includes(내용.형식)?내용.형식:'';
  const 경로=path.join(폴더,n+'.json');
  const 옛경로=샘플파일들().get(n);
  try{fs.mkdirSync(path.join(샘플폴더,폴더),{recursive:true});fs.writeFileSync(path.join(샘플폴더,경로),JSON.stringify({...내용,종류:'HMOS 샘플',이름:n,저장:new Date().toISOString()})+'\n','utf8');
    if(옛경로&&옛경로!==경로)fs.unlinkSync(path.join(샘플폴더,옛경로));}
  catch(e){res.status(500).json({error:'샘플 저장 실패: '+e.message});return;}
  res.json({ok:true,이름:n,파일:'검증/샘플/'+경로.split(path.sep).join('/')});
});

// ── 채점 결과 저장 (오종래 2026-10-21) — dashboard2 ④ 「채점 결과 저장」 → 검증/채점결과/<문항명>_<날짜 YYYYMMDD>.json
//   같은 날 같은 문항명이 이미 있으면 _2 · _3 …을 붙인다 (덮어쓰지 않는다). 내용 = 채점 기록 그대로(문항 · 루브릭 · 학생 답 · 채점 · 4축) + 교사 고침
//   GET은 목록 — 경로 1 「문항분석에서 불러오기」가 저장된 루브릭으로 다른 학생을 채점하고, 저장한 결과를 ④에서 다시 연다
const 채점결과폴더=path.join(검증폴더,'채점결과');
const 채점결과이름=f=>/^[0-9A-Za-z가-힣_-]{1,100}\.json$/.test(String(f||''))?String(f):null;
/** 채점결과/ 맨 위(dashboard2 저장) + 하위 폴더 한 겹(q3 · 기타 …) — id = 채점결과/ 아래 경로 */
const 채점결과파일들=()=>{
  let 하위=[];try{하위=fs.readdirSync(채점결과폴더,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[0-9A-Za-z가-힣_-]{1,40}$/.test(d.name)).map(d=>d.name);}catch(_){}
  return [...json들(채점결과폴더).filter(채점결과이름),...하위.flatMap(d=>json들(path.join(채점결과폴더,d)).filter(채점결과이름).map(x=>`${d}/${x}`))];
};
app.post('/api/grade-results',(req,res)=>{
  const {문항명,내용}=req.body||{};
  const n=샘플이름(문항명);
  if(!n){res.status(400).json({error:'문항명은 글자 · 숫자 · _ · - 로만'});return;}
  if(!내용||typeof 내용!=='object'||!내용.루브릭||!Array.isArray(내용.채점)||!내용.채점.some(g=>g&&g.out&&g.out.조각별)){res.status(400).json({error:'저장할 채점 결과가 없습니다 — 채점을 먼저 하세요'});return;}
  const 날짜=new Date(Date.now()+9*3600e3).toISOString().slice(0,10).replace(/-/g,''); // 한국 날짜
  let 파일=`${n}_${날짜}.json`;
  try{
    fs.mkdirSync(채점결과폴더,{recursive:true});
    for(let k=2;fs.existsSync(path.join(채점결과폴더,파일));k++)파일=`${n}_${날짜}_${k}.json`;
    fs.writeFileSync(path.join(채점결과폴더,파일),JSON.stringify({...내용,종류:'HMOS 채점결과',문항명:n,저장:new Date().toISOString()},null,1)+'\n','utf8');
  }catch(e){res.status(500).json({error:'채점 결과 저장 실패: '+e.message});return;}
  res.json({ok:true,문항명:n,파일:'검증/채점결과/'+파일});
});
app.get('/api/grade-results',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 목록=채점결과파일들().map(파일=>{
    try{
      const j=JSON.parse(fs.readFileSync(path.join(채점결과폴더,파일),'utf8'));
      const gs=(j.채점||[]).filter(g=>g&&g.out&&g.out.조각별);
      const 합=k=>Math.round(gs.reduce((a,g)=>a+Number(g.out[k]||0),0)*100)/100;
      // 옛 채점 기록(q3 · 기타)은 문항명 · 저장이 없다 — 파일 이름 앞(q3)과 파일 날짜로
      const 폴더=파일.includes('/')?파일.split('/')[0]:'';
      const 앞=(파일.split('/').pop().match(/^q\d+/)||[''])[0];
      return {파일,폴더,문항명:j.문항명||앞||폴더||파일,저장:j.저장||(j.재채점&&j.재채점.일시)||(()=>{try{return fs.statSync(path.join(채점결과폴더,파일)).mtime.toISOString();}catch(_){return '';}})(),학생:j.학생||'',형식:j.형식||null,계열:j.계열||'',문항:j.문항||'',정답:j.정답||'',모범답안:j.모범답안||'',부분점수:합('부분점수'),만점:합('만점'),루브릭:j.루브릭&&j.루브릭.out?{계열:j.루브릭.out.계열,총배점:j.루브릭.out.총배점,소문항:j.루브릭.out.소문항||[]}:null};
    }catch(e){return {파일,오류:e.message};}
  }).sort((a,b)=>String(b.저장||'').localeCompare(String(a.저장||'')));
  res.json({ok:true,목록});
});
app.get('/api/grade-results/*file',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  // .json을 떼고 부른다 — nginx가 .json으로 끝나는 주소를 막는다 (서버가 붙인다)
  // 목록에 있는 경로만 — 경로 문자로 폴더 밖을 열지 못하게
  const 파일=[].concat(req.params.file||[]).join('/').replace(/\.json$/,'')+'.json';
  if(!채점결과파일들().includes(파일)){res.status(404).json({error:'채점 결과 파일이 없습니다'});return;}
  res.type('application/json').send(fs.readFileSync(path.join(채점결과폴더,파일),'utf8'));
});

// GET /api/axis-rubrics — 저장한 4축 루브릭 (탭7 채점 샘플). 읽기만, 쿠키는 /api/results와 같게 여기서 본다
app.get('/api/axis-rubrics',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 목록=[];
  for(const 파일 of 검증파일들().filter(f=>f.endsWith('_루브릭.json'))){
    try{const j=JSON.parse(fs.readFileSync(path.join(검증폴더,파일),'utf8'));if(j&&j['4축루브릭'])목록.push({파일,...j});}catch(_){}
  }
  res.json({ok:true,목록});
});

// GET /api/axis-results · /api/axis-results/:dir/:file — 4축 루브릭 학생 채점 (scripts/grade-axis-rubric.mjs, 검증/<문항>/<문항>_vv_NN.json)
// dashboard2 탭3 (오종래 2026-10-18). 읽기만 — 판정 · 근거 · 점수는 JSON 그대로
const 축결과파일들=()=>{
  const out=[];
  let 폴더들=[];
  try{폴더들=fs.readdirSync(검증폴더,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch(_){}
  for(const d of 폴더들){
    try{for(const f of fs.readdirSync(path.join(검증폴더,d)))if(/_vv_\d+\.json$/.test(f))out.push(d+'/'+f);}catch(_){}
  }
  return out.sort();
};
app.get('/api/axis-results',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 목록=[];
  for(const 파일 of 축결과파일들()){
    try{
      const j=JSON.parse(fs.readFileSync(path.join(검증폴더,파일),'utf8'));
      if(!Array.isArray(j.채점))continue;
      목록.push({파일,문항:j.문항,학생:j.학생,점수:j.점수,총배점:j.총배점,도달수:j.도달수,칸:j.채점.map(c=>({축:c.축,항목:c.항목||null,판정:c.판정}))});
    }catch(_){}
  }
  res.json({ok:true,목록});
});
app.get('/api/axis-results/:dir/:file',(req,res)=>{ // :file = 결과 파일 이름 (.json 없이 — nginx가 .json 주소를 막는다)
  res.setHeader('Cache-Control','no-store');
  if(!접속됨(req)){res.status(401).json({ok:false,error:접속만료});return;}
  const 파일=String(req.params.dir||'')+'/'+String(req.params.file||'').replace(/\.json$/,'')+'.json';
  if(!축결과파일들().includes(파일)){res.status(404).json({ok:false,error:'채점 결과 파일이 없습니다'});return;}
  res.type('application/json').send(fs.readFileSync(path.join(검증폴더,파일),'utf8'));
});

// ── POST /api/refine — C 5단계 논제 정교화 (조립설명서 C·논술 9단계) ──────────
// 진단은 엔진([봉인⑬], /analyze 응답의 단계.정교화.진단)이 한다. Claude는 진단된 ①②③ 갈래마다 정교화안만 쓴다.
// ④사족은 표시만 — 생성하지 않는다. 정교화안은 다시 엔진에 태워 급소·진단을 돌려준다 (명세서-2 §3 자가검증 순환).
const REFINE_SPEC=process.env.HMOS_REFINE_SPEC||path.join(__dirname,'..','hmos-spec','HMOS_논제생성_명세서-2.md');
// 보완 = 6단계 ⑤에서 넘어온 진단 — 참조 범위 안 단락을 끌어들일 수 있는 소문항 (오종래 2026-10-14)
const 생성갈래=['일방흐름','서술복잡','급소불명확','보완'];

/**
 * 갈래별 처방 — 진단마다 같은 처방을 싣는다 (오종래 2026-10-14: Claude가 매번 같은 근거로 판단하게).
 * 핵심유지 = 정교화안에 엔진 핵심(B) 실체가 그대로 남아야 하는 갈래
 */
const 처방={
  일방흐름:{글:'핵심은 그대로 두고, 핵심에서 묻는 말로 넘어가기 전에 조건(범위·관점·기준) 하나 이상을 더한다.',핵심유지:true},
  서술복잡:{글:'핵심은 그대로 두고, 다룰 대상을 (1)(2)(3) 소문항 계단으로 나눈다. 각 계단은 대상 하나만 다룬다.',핵심유지:true},
  급소불명확:{글:'묻는 말 바로 앞에 「무엇을(핵심 실체) + 어떻게(조건)」 덩어리가 서도록 다시 쓴다. 핵심 실체는 원 논제와 제시문에 있는 말로만 쓴다.',핵심유지:false},
  보완:{글:'원 소문항의 핵심은 그대로 두고, 「끌어들일 단락」의 제시문 단락과 그 실체를 조건으로 끌어들인다. 그 단락 기호([가] 꼴)를 논제에 쓴다. 참조 범위 밖 단락은 끌어들이지 않는다.',핵심유지:true},
};

/** 소문항의 엔진 핵심 — 급소덩어리(Q 앞 B+C)의 B 실체, 없으면 엔진 급소 실체 */
function 핵심실체(s){
  if(!s)return [];
  const B=new Set((s.급소덩어리||[]).map(d=>d.B));
  const 덩어리B=(s.노드||[]).filter(n=>B.has(n.id)).map(n=>n.실체.trim().replace(/^[\s,]+/,''));
  return 덩어리B.length?덩어리B:(s.급소||[]).map(k=>k.실체.trim().replace(/^[\s,]+/,''));
}

/** 명세서-2 §3 원문 그대로 — 이론을 여기서 새로 쓰지 않는다. 파일이 없어도 서버는 뜨게, 부를 때 읽는다 */
function loadRefineRules(){
  const md=fs.readFileSync(REFINE_SPEC,'utf8');
  const a=md.indexOf('## 3. 서술형 문제 정교화'),b=md.indexOf('## 3-5.');
  if(a<0||b<0)throw new Error('명세서-2에서 §3 정교화 절을 찾지 못함');
  return md.slice(a,b).trim();
}

/** 정교화 출력 — 진단 id마다 하나. 갈래·단위·근거는 서버가 엔진 진단에서 붙인다 (Claude가 다시 쓰지 않는다) */
const refineFormat=ids=>({
  type:'json_schema',
  schema:{
    type:'object',
    additionalProperties:false,
    required:['proposals'],
    properties:{
      proposals:{
        type:'array',
        description:'작업 블록 하나당 정교화안 하나 — 블록의 id를 그대로',
        items:{
          type:'object',
          additionalProperties:false,
          required:['id','refined','change'],
          properties:{
            id:{type:'string',enum:ids},
            refined:{type:'string',description:'정교화한 소문항 논제 전문'},
            change:{type:'string',description:'원 논제에서 무엇을 바꿨는가 — 교사가 읽는 문장'},
          },
        },
      },
    },
  },
});

/** 두 단락 관계를 교사 말로 — 관계 이름(유사·대비·보완·병렬)은 내지 않는다 */
const 관계말={유사:'같은 실체를 함께 다룬다',대비:'같은 종류의 물음에 서로 다른 답을 담고 있다',보완:'한쪽이 다른 쪽의 빈 곳을 채운다',병렬:'서로 겹치지 않고 나란히 놓여 있다'};

/**
 * 고칠 곳 — 엔진 진단을 교사 말로 (오종래 2026-10-14). 엔진 근거 원문(「급소 B「X」(n2) → Q…, C 노드 없음」)을 넘기면
 * 그 내부 표현이 「바꾼 점」에 옮겨져서, 진단 근거의 실체·노드 id를 소문항 노드 실체로 풀어 교사 말을 짓는다
 */
function 진단설명(d,s){
  const 근거=String(d.근거||'');
  const 실체들=[...근거.matchAll(/「(.+?)」/g)].map(m=>m[1].trim());
  const 노드실체=id=>{const n=((s&&s.노드)||[]).find(x=>x.id===id);return n?n.실체.trim().replace(/^[\s,]+/,''):null;};
  const 묶음=xs=>xs.map(x=>`「${x}」`).join('·');
  if(d.갈래==='일방흐름')return 실체들.length>=2
    ?`핵심 「${실체들[0]}」에서 조건 없이 바로 묻는 말 「${실체들[1]}」로 넘어간다 — 답이 한 방향으로만 흐른다.`
    :'조건 없이 한 방향으로만 흐르는 논제다.';
  if(d.갈래==='서술복잡'){
    const ids=(근거.match(/\(([^)]*)\)/)||[])[1];
    const 대상=ids?ids.split('·').map(노드실체).filter(Boolean):[];
    return 대상.length
      ?`다룰 대상 ${묶음(대상)} ${대상.length}개가 한 문장에 얽혀 있고, 어떤 방식으로 서술할지는 정해져 있지 않다.`
      :'다룰 대상이 여럿 얽혀 있고, 어떤 방식으로 서술할지는 정해져 있지 않다.';
  }
  if(d.갈래==='급소불명확')return /^MULTIPLE_CONVERGENCE/.test(근거)&&실체들.length
    ?`핵심 후보가 ${묶음(실체들)}로 갈려 하나로 모이지 않는다.`
    :'묻는 말 앞에 무엇을 묻는지(핵심 실체)가 서지 않는다.';
  if(d.갈래==='보완')return `참조 범위 안의 제시문 [${d.단락}]의 ${실조사(d.급소,'이','가')} 이 소문항에 아직 들어와 있지 않다. 이미 이어진 [${d.연결단락}]의 ${실조사(d.연결급소,'과','와')} ${관계말[d.관계]||'이어져 있다'}.`;
  return 근거;
}

/** 정교화 작업 블록 — 진단 하나를 엔진 값(소문항·핵심·고칠 곳)과 처방으로 못 박는다 */
function 정교화작업(대상,소문항){
  return 대상.map((d,i)=>{
    const s=소문항.find(x=>x.번호===d.단위)||(소문항.length===1?소문항[0]:null);
    const 핵심=핵심실체(s);
    return {id:'d'+(i+1),진단:d,소문항:s,핵심,
      글:[
        `[작업 d${i+1}]`,
        `소문항: ${d.단위?`(${d.단위})`:'논제 전체'}`,
        `원 논제: ${s?s.텍스트:'(소문항을 찾지 못함 — 논제 전체를 본다)'}`,
        `논제 핵심: ${핵심.length?핵심.map(k=>`「${k}」`).join(' · '):'서지 않음'}${s&&s.급소덩어리&&s.급소덩어리.length?` (핵심 덩어리 ${s.급소덩어리.map(x=>`「${x.실체}」`).join(' · ')})`:''}`,
        `고칠 곳: ${진단설명(d,s)}`,
        ...(d.갈래==='보완'?[`끌어들일 단락: [${d.단락}] 「${d.급소}」`]:[]),
        `처방: ${처방[d.갈래].글}`,
        ...(처방[d.갈래].핵심유지&&핵심.length?[`반드시 남길 말: ${핵심.map(k=>`「${k}」`).join(' · ')}${d.갈래==='보완'?` · 「[${d.단락}]」`:''}`]:[]),
      ].join('\n')};
  });
}

/** 바꾼 점에 들어가면 안 되는 말 — 공통 내부 표현 + 진단 갈래 이름·메타 표현 (오종래 2026-10-14) */
const 정교화메타목록=[/진단/,/갈래/,/일방흐름/,/서술복잡/,/급소불명확/,/처방/];

/** 정교화안 점검 — 처방이 핵심을 남기라 했는데 빠졌거나, 바꾼 점에 내부 표현이 있으면 교사 확인 (판정하지 않는다, 표시만) */
function 정교화점검(w,refined,change){
  const 점검=[];
  if(처방[w.진단.갈래].핵심유지)for(const k of w.핵심)if(!refined.includes(k))점검.push(`핵심 「${k}」가 정교화안에 그대로 남지 않음`);
  if(w.진단.갈래==='보완'&&!refined.includes(`[${w.진단.단락}]`))점검.push(`끌어들일 단락 [${w.진단.단락}] 기호가 정교화안에 없음`);
  const 메타=정교화메타목록.flatMap(re=>{const m=String(change||'').match(re);return m?[m[0]]:[];});
  for(const x of [...new Set([...내부표현(change),...메타])])점검.push(`「바꾼 점」에 내부 표현 「${x}」`);
  return 점검;
}

app.post('/api/refine',async(req,res)=>{
  // 소문항: /analyze 의 단계.인식.소문항 · 진단: /analyze 의 단계.정교화.진단 — 둘 다 엔진 값 그대로
  const {논제,제시문,소문항,진단}=req.body||{};
  const 키워드=키워드of((req.body||{}).키워드);
  const t=(논제||'').trim();
  if(!t||!Array.isArray(소문항)||!소문항.length||!Array.isArray(진단)){res.status(400).json({error:'논제·소문항·진단이 필요합니다'});return;}
  const 사족=진단.filter(d=>d.갈래==='사족');
  const 대상=진단.filter(d=>생성갈래.includes(d.갈래));
  if(!대상.length){res.json({정교화:[],사족});return;}

  let rules;
  try{rules=loadRefineRules();}catch(e){res.status(500).json({error:'정교화 명세를 읽지 못함 — '+e.message});return;}
  const 작업=정교화작업(대상,소문항);
  const system=`너는 HMOS 논제 정교화기다. 아래 「서술형 문제 정교화」 원문에 따라, 작업 블록마다 정교화한 논제 하나를 쓴다.

지킬 것:
- 작업 블록의 소문항·논제 핵심·고칠 곳은 HMOS 엔진 산출이다. 다시 진단하거나 핵심을 바꾸지 않는다. 판단의 근거는 언제나 그 블록의 「고칠 곳」 하나다.
- 블록 하나당 정교화안 하나. id는 블록의 id 그대로. 블록에 없는 소문항을 만들지 않는다.
- 블록의 「처방」을 그대로 따른다. 「반드시 남길 말」이 있으면 그 말을 글자 그대로 정교화안에 남긴다.
- 정교화는 새 문제를 만드는 것이 아니다. 원 논제가 겨눈 핵심·의도를 더 정확하게 만든다. 원 논제의 공통 발문·소문항 번호는 쓰지 않는다 — 소문항 본문만 쓴다.
- 제시문이 주어지면 제시문 실체에서 벗어나지 않는다.
- change는 교사가 읽는 문장이다 (오종래 2026-10-13·10-14). 원 논제에서 무엇을 어떻게 바꿨는지와 그 까닭을 「고칠 곳」의 실체 말로 쓴다. 「제약 C를 더했다」 → 「조건을 더했다」처럼 쓴다.
- change에 다음을 쓰지 않는다: 분석 도구를 주어로 한 말(「엔진이 …」「진단이 …」), 「근거는 … 진단이다」 같은 판단 과정 설명, 엔진·급소·사족·봉인·진단·갈래·처방·노드·열쇠, 갈래 이름(일방흐름·서술복잡·급소불명확), 5색 기호(B·C·P·D·Q), 노드 id(n2 등), C-F, 「○○ 관계」 같은 관계 이름.
- 근거를 밝힐 때(아래 공통 규칙)도 change에서는 「엔진 노드」「단락 급소」라는 말 없이 실체 말로만 밝힌다.
${공통지킬것}${키워드지킬것(키워드,'change')}

=== HMOS 논제생성 명세서-2 §3 (원문) ===
${rules}`;

  const user=[
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문글(제시문)}`:'',
    `정교화 작업 (HMOS 엔진 진단 — 그대로 받을 것):\n\n${작업.map(w=>w.글).join('\n\n')}`,
  ].filter(Boolean).join('\n\n');

  const ids=작업.map(w=>w.id);
  const r=await askClaude(res,system,user,refineFormat(ids),o=>Array.isArray(o.proposals));
  if(!r)return;

  // 자가검증 — 정교화안을 엔진에 다시 태운다. 보완은 제시문과 함께 태워 끌어들인 단락에 연결되는지 본다
  const 정교화=await 하나씩(작업,async w=>{
    const p=r.out.proposals.find(x=>x.id===w.id);
    const 원급소=w.핵심;
    if(!p)return {id:w.id,갈래:w.진단.갈래,단위:w.진단.단위,진단:w.진단,원급소,논제:'',바꾼점:'',점검:['Claude가 이 진단의 정교화안을 내지 않음'],재인식:{오류:'정교화안 없음'}};
    const 보완=w.진단.갈래==='보완'&&Array.isArray(제시문)&&제시문.length;
    // 보완은 원 소문항의 참조 범위 안에서 다시 잇는다 — 정교화안만 보내면 공통 발문의 참조가 빠진다
    const 원참조=(w.소문항&&w.소문항.참조)||[];
    const a=await runAnalyze({파이프라인:'C',논제:p.refined,...(보완?{제시문,...(원참조.length?{참조:원참조}:{})}:{})});
    const 재인식=a.ok&&a.단계&&a.단계.인식
      ?{소문항:a.단계.인식.소문항.map(s=>({번호:s.번호,급소:s.급소.map(k=>k.실체.trim()),급소실패:s.급소실패})),진단:(a.단계.정교화&&a.단계.정교화.진단)||[],
        ...(보완?{연결단락:((a.단계.정합&&a.단계.정합.소문항)||[]).flatMap(x=>x.연결단락||[])}:{})}
      :{오류:(a.error&&a.error.사유)||'재인식 실패'};
    const 점검=정교화점검(w,p.refined,p.change);
    if(보완&&재인식.연결단락&&!재인식.연결단락.includes(w.진단.단락))점검.push(`엔진에 다시 넣으니 [${w.진단.단락}]에 연결되지 않음`);
    return {id:w.id,갈래:w.진단.갈래,단위:w.진단.단위,진단:w.진단,원급소,논제:p.refined,바꾼점:p.change,점검,재인식};
  });

  res.json({model:r.msg.model,usage:r.msg.usage,...(키워드?{키워드}:{}),정교화,사족});
});

// ── C·논술 9단계 Claude 몫 — 6단계 /api/propose (5단계 /api/refine은 위) ──────────
// HMOS 절대 원칙 (오종래 2026-10-13): 인식·제시문 급소 추출·연결 대조는 엔진이 한다(/analyze).
// AI는 엔진이 잡은 결과를 문장으로 구성할 뿐, 엔진이 못 잡은 것을 채우지 않는다. 프롬프트는 원전 md의 절을 그대로 싣는다.

/** md에서 「from」 머리부터 「to」 머리 앞까지 — 머리를 못 찾으면 던진다 */
function sliceSpec(file,from,to){
  const md=fs.readFileSync(file,'utf8');
  const a=md.indexOf(from),b=to?md.indexOf(to,a+1):md.length;
  if(a<0||b<0)throw new Error(`${path.basename(file)}에서 「${from}」 절을 찾지 못함`);
  return md.slice(a,b).trim();
}

const 공통지킬것=`- HMOS 엔진 산출(소문항별 급소·5색 노드, 논제 급소↔제시문 단락 급소 연결, 사족)은 다시 계산하거나 바꾸지 말고 그대로 받는다.
- 엔진이 잡지 못한 연결·실체를 새로 지어내지 않는다. 엔진 결과를 문장으로 구성한다.
- 출력마다 근거(엔진 노드·단락 급소)를 밝힌다.
- AI는 제안만 한다. 확정은 교사가 한다.
- 모든 출력은 한국어.`;

/** 교사 방향 키워드 (오종래 2026-10-21) — 「비교」「비판」「원인」「구체화」 등. 없으면 빈 글 = 지금처럼 엔진 진단·후보대로 */
const 키워드of=v=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,60):'';
/** 키워드가 있으면 프롬프트 「지킬 것」 끝에 붙인다. 엔진 산출은 그대로 두고 그 안에서 방향만 고른다 */
const 키워드지킬것=(k,설명칸)=>k?`
- 교사 방향 키워드: 「${k}」. 이 방향을 살려 쓴다 — 예: 비교 → 둘을 견주게, 비판 → 평가·비판하게, 원인 → 까닭을 묻게, 구체화 → 범위·관점을 좁혀서.
  단 위의 엔진 산출(블록의 실체·고칠 곳·처방·반드시 남길 말·유형·뼈대)은 그대로 지키고, 그 안에서 더할 조건·관점·묻는 초점을 이 방향으로 고른다. 키워드가 엔진 산출과 맞지 않으면 엔진 산출을 따른다.
  ${설명칸}에 키워드 방향을 어떻게 살렸는지 한 마디 넣는다 (「교사 키워드」라는 말은 쓰지 않는다).`:'';

/** Claude 한 번 — 성공이면 {out, msg}, 실패면 res에 오류를 쓰고 null */
async function askClaude(res,system,user,format,check){
  let msg;
  try{
    msg=await client.beta.messages.create({
      model:MODEL,
      max_tokens:16000,
      betas:['server-side-fallback-2026-07-01'],
      fallbacks:'default',
      system,
      output_config:{format},
      messages:[{role:'user',content:user}],
    });
  }catch(e){
    if(e instanceof Anthropic.AuthenticationError){res.status(500).json({error:'API 키 인증 실패 — .env의 ANTHROPIC_API_KEY 확인'});return null;}
    if(e instanceof Anthropic.RateLimitError){res.status(429).json({error:'API 요청 한도 초과 — 잠시 뒤 다시'});return null;}
    if(e instanceof Anthropic.APIError){res.status(502).json({error:`Claude API 오류 ${e.status}: ${e.message}`});return null;}
    res.status(502).json({error:'Claude API 연결 실패: '+e.message});
    return null;
  }
  if(msg.stop_reason==='refusal'){res.status(502).json({error:`모델이 거절함 (${(msg.stop_details&&msg.stop_details.category)||'분류 없음'})`});return null;}
  if(msg.stop_reason==='max_tokens'){res.status(502).json({error:'응답이 max_tokens에서 잘림'});return null;}
  let out=null;
  try{out=JSON.parse(msg.content.filter(b=>b.type==='text').map(b=>b.text).join(''));}catch(_){}
  if(!out||!check(out)){res.status(502).json({error:`응답을 받지 못함 (stop_reason: ${msg.stop_reason})`});return null;}
  return {out,msg};
}

const 제시문글=제시문=>제시문.map(p=>`[${p.id}] ${p.텍스트}`).join('\n');
// 6단계 — 추가 논제 (조립설명서 6단계, 오종래 2026-10-14). 엔진(/analyze 단계.관계)이 단락 관계·6유형·추가 판단·논제 뼈대를 낸다.
// Claude는 뼈대를 자연스러운 논제 문장으로 다듬고 「기존과 다른 점」·「새로 측정하는 것」만 쓴다. 뼈대의 실체·단락 기호는 바꾸지 않는다.
// 쓴 논제는 제시문과 함께 엔진에 다시 넣어 두 단락에 연결되는지 본다 (자가검증).
const proposeFormat=ids=>({type:'json_schema',schema:{type:'object',additionalProperties:false,required:['proposals'],properties:{
  proposals:{type:'array',description:'후보 블록 하나당 하나 — 블록의 id를 그대로',items:{type:'object',additionalProperties:false,required:['id','thesis','difference','measures'],properties:{
    id:{type:'string',enum:ids},
    thesis:{type:'string',description:'뼈대를 다듬은 추가 논제 전문'},
    difference:{type:'string',description:'기존과 다른 점 — 교사가 읽는 문장'},
    measures:{type:'string',description:'새로 측정하는 것 — 교사가 읽는 문장'},
  }}},
}}});

/**
 * 두 제시문의 관계 — Claude에 주는 교사용 문장 (오종래 2026-10-14). 엔진 근거 원문(「기준 「시행한」」·관계 이름)을 넘기면
 * 그 내부 표현이 「기존과 다른 점」에 그대로 옮겨져서, 엔진 산출(관계·단락·실체)만으로 교사 말을 짓는다
 */
/** 「실체」 + 조사 — 받침이 있으면 앞 조사, 없으면 뒤 조사. 끝 글자가 한글이 아니면 「과(와)」처럼 둘 다 */
function 실조사(x,받침,없음){
  const c=String(x).trim().slice(-1).charCodeAt(0)-0xAC00;
  const j=!(c>=0&&c<=11171)?`${받침}(${없음})`:c%28?받침:없음;
  return `「${x}」${j}`;
}

function 관계설명(c){
  const [A,B]=c.단락.map(l=>'['+l+']');
  const [a,b]=c.실체들;
  if(c.관계==='대비')return `${A}의 ${실조사(a,'과','와')} ${B}의 ${실조사(b,'은','는')} 같은 종류의 물음에 서로 다른 답을 담고 있다.`;
  if(c.관계==='유사')return `${A}와 ${B}가 ${실조사(a,'을','를')} 함께 다룬다.`;
  if(c.관계==='병렬')return `${A}의 ${실조사(a,'과','와')} ${B}의 ${실조사(b,'은','는')} 서로 겹치지 않는, 나란히 놓인 내용이다.`;
  // 보완 — 실체들: 근거·주장 [채움, 빈 곳] · 설명·분석 [빈 곳, 채움]
  const [채움,빈]=c.유형==='설명·분석'?[b,a]:[a,b];
  return `한 제시문의 ${실조사(채움,'이','가')} 다른 제시문의 「${빈}」에서 비어 있는 부분을 채운다.`;
}

/** 교사 문장 속 내부 표현 — 찾은 말들 (없으면 빈 배열). 판정하지 않고 「교사 확인」으로 표시만 한다 */
const 내부표현목록=[/엔진/,/급소/,/사족/,/봉인/,/뼈대/,/후보/,/열쇠/,/노드/,/\bn\d+\b/,/(?:유사|대비|보완|병렬) 관계/,/C-F/,/(?:^|[^A-Za-z])[BCPDQ](?:\s*노드|\s*색|「)/];
function 내부표현(글){
  return [...new Set(내부표현목록.flatMap(re=>{const m=String(글||'').match(re);return m?[m[0].trim()]:[];}))];
}

app.post('/api/propose',async(req,res)=>{
  // 관계: /analyze 의 단계.관계 (엔진 [봉인⑭]) · 소문항: 단계.인식.소문항 — 엔진 값 그대로
  const {논제,소문항,제시문,관계}=req.body||{};
  const 키워드=키워드of((req.body||{}).키워드);
  if(!(논제||'').trim()||!Array.isArray(소문항)||!소문항.length){res.status(400).json({error:'논제·소문항(2단계 인식)이 필요합니다'});return;}
  if((req.body||{}).방향){await 키워드방향논제(res,{소문항,제시문,키워드,인식:(req.body||{}).인식||{}});return;}
  if(!관계||!Array.isArray(관계.추가후보)){res.status(400).json({error:'6단계 엔진 결과(단계.관계)가 없습니다 — 제시문을 넣고 다시 분석하세요'});return;}
  const 후보=관계.추가후보;
  if(!후보.length){res.json({비교불가:!!관계.비교불가,추가논제:[],사유:'엔진이 추가할 단락 쌍을 찾지 못했습니다 — 모든 단락 쌍이 기존 논제에 이미 들어 있거나 5단계 보완으로 넘어갔습니다'});return;}
  let rules;
  try{rules=sliceSpec(REFINE_SPEC,'## 4. 추가 논제의 원칙','## 6.');}
  catch(e){res.status(500).json({error:'명세서-2를 읽지 못함 — '+e.message});return;}
  const system=`너는 HMOS 추가 논제 문장가다. HMOS 엔진이 제시문 단락 관계에서 고른 후보마다, 엔진이 지은 논제 뼈대를 자연스러운 논제 문장으로 다듬는다.

지킬 것:
- 유형·관계·두 단락·실체·뼈대는 HMOS 엔진 산출이다. 다시 고르거나 바꾸지 않는다. 후보 블록 하나당 논제 하나, id는 블록의 id 그대로.
- 뼈대의 「제시문 [A], [B]를 참고하여」 머리와 두 단락 기호, 「반드시 남길 말」은 글자 그대로 남긴다. 조사·어미·어순만 다듬는다.
- 새 실체·새 조건·새 단락을 더하지 않는다. 묻는 말(설명하시오·논하시오·서술하시오·제시하시오)은 뼈대의 것을 쓴다.
- difference는 기존 소문항과 무엇이 다른지, measures는 이 논제가 새로 재는 능력을 블록의 「두 제시문의 관계」 문장에 기대어 쓴다.
- difference·measures는 교사가 읽는 문장이다 (오종래 2026-10-13·10-14). 분석 도구를 주어로 삼지 않는다 — 「엔진이 잡은」「엔진이 정한」처럼 쓰지 않고, 「이 논제는」「두 제시문은」처럼 쓴다.
- 다음 내부 표현을 쓰지 않는다: 엔진, 급소, 사족, 봉인, 뼈대, 후보, 열쇠, 노드, 5색 기호(B·C·P·D·Q), 노드 id(n2 등), 「유사 관계」「대비 관계」「보완 관계」「병렬 관계」 같은 관계 이름. 「급소」는 「핵심」으로 쓴다.
- 근거를 밝힐 때(아래 공통 규칙)도 difference·measures에서는 「엔진 노드」「단락 급소」라는 말 없이, 두 제시문 기호와 실체 말로만 밝힌다.
${공통지킬것}${키워드지킬것(키워드,'difference')}

=== 명세서-2 §4·§5 (원문) ===
${rules}`;
  const 블록=후보.map(c=>[
    `[후보 ${c.id}]`,
    `유형: ${c.유형} (단락 관계: ${c.관계})`,
    `두 단락: [${c.단락[0]}] · [${c.단락[1]}]`,
    `두 제시문의 관계: ${관계설명(c)}`,
    `논제 뼈대: ${c.뼈대}`,
    `반드시 남길 말: ${[...c.실체들.map(x=>`「${x}」`),...c.단락.map(l=>`「[${l}]」`)].join(' · ')}`,
  ].join('\n'));
  const user=[
    `기존 논제 (비교 대상 — 그대로 받을 것):\n${소문항.map(s=>`${s.번호?`(${s.번호}) `:''}${s.텍스트}`).join('\n')}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문글(제시문)}`:'',
    `추가 논제 후보 (HMOS 엔진 — 그대로 받을 것):\n\n${블록.join('\n\n')}`,
  ].filter(Boolean).join('\n\n');
  const r=await askClaude(res,system,user,proposeFormat(후보.map(c=>c.id)),o=>Array.isArray(o.proposals));
  if(!r)return;

  const 추가논제=await 하나씩(후보,async c=>{
    const p=r.out.proposals.find(x=>x.id===c.id);
    const 기본={id:c.id,유형:c.유형,관계:c.관계,뼈대:c.뼈대,제시문:c.단락,근거:c.근거};
    if(!p)return {...기본,논제:'',기존과다른점:'',새로측정하는것:'',점검:['Claude가 이 후보의 논제를 내지 않음'],자가검증:{통과:false,사유:'논제 없음'}};
    const 점검=[...c.실체들.filter(x=>!p.thesis.includes(x)).map(x=>`실체 「${x}」가 논제에 그대로 남지 않음`),
      ...내부표현(p.difference).map(w=>`「기존과 다른 점」에 내부 표현 「${w}」`),
      ...내부표현(p.measures).map(w=>`「새로 측정하는 것」에 내부 표현 「${w}」`),
      ...c.단락.filter(l=>!p.thesis.includes(`[${l}]`)).map(l=>`단락 기호 [${l}]가 논제에 없음`)];
    const a=await runAnalyze({파이프라인:'C',논제:p.thesis,...(Array.isArray(제시문)&&제시문.length?{제시문}:{})});
    let 자가검증;
    if(!a.ok||!a.단계||!a.단계.인식)자가검증={통과:false,사유:(a.error&&a.error.사유)||'재인식 실패'};
    else{
      const 연결단락=[...new Set(((a.단계.정합&&a.단계.정합.소문항)||[]).flatMap(x=>x.연결단락||[]))];
      const 급소=a.단계.인식.소문항.flatMap(s=>s.급소.map(k=>k.실체.trim().replace(/^[\s,]+/,'')));
      const 빠진=c.단락.filter(l=>!연결단락.includes(l));
      자가검증={통과:!빠진.length&&급소.length>0,연결단락,급소,
        ...(빠진.length?{사유:`[${빠진.join('], [')}]에 연결되지 않음`}:!급소.length?{사유:'핵심이 서지 않음'}:{})};
    }
    return {...기본,논제:p.thesis,기존과다른점:p.difference,새로측정하는것:p.measures,점검,자가검증};
  });
  res.json({model:r.msg.model,usage:r.msg.usage,...(키워드?{키워드}:{}),비교불가:!!관계.비교불가,추가논제});
});

// 키워드 + 인식 기반 논제 (오종래 2026-10-21 확정) — /api/propose {방향:true, 키워드, 인식}.
// 엔진 인식 결과(소문항 급소 · 제시문 핵심 · 제시문 관계 봉인⑧ · 논제 요구 봉인⑨)를 프롬프트에 싣고, Claude는 그 가운데서 급소·관계를 골라
// 키워드 방향으로 논제를 쓴다. 고른 급소·관계는 목록 id로만 받아 생성 근거 줄은 서버가 짓는다 (Claude가 근거를 지어내지 않게).
// 키워드 없이 · 인식 결과(논제 급소) 없이 생성하지 않는다. 쓴 논제는 엔진에 다시 넣어 핵심·연결 단락을 본다 (표시만 — 교사 확인).
const 방향논제수=3;
const 방향Format=(급소ids,관계ids)=>({type:'json_schema',schema:{type:'object',additionalProperties:false,required:['proposals'],properties:{
  proposals:{type:'array',description:`키워드 방향 논제 ${방향논제수}개`,items:{type:'object',additionalProperties:false,required:['thesis','pivots','relations','difference','measures'],properties:{
    thesis:{type:'string',description:'논제 전문'},
    pivots:{type:'array',items:{type:'string',enum:급소ids},description:'이 논제가 기댄 논제 급소 id (g1 꼴) — 하나 이상'},
    relations:{type:'array',items:관계ids.length?{type:'string',enum:관계ids}:{type:'string'},description:'이 논제가 기댄 제시문 관계 id (r1 꼴). 관계를 쓰지 않았거나 목록이 없으면 빈 배열'},
    difference:{type:'string',description:'기존 논제와 다른 점 — 교사가 읽는 문장'},
    measures:{type:'string',description:'새로 측정하는 것 — 교사가 읽는 문장'},
  }}},
}}});

/** 인식 결과 → 목록 (id 붙임). 급소는 소문항 급소 실체, 관계는 핵심요약.관계(⑧), 요구는 논제요구(⑨) */
function 인식목록(소문항,인식){
  const 급소=[...new Set(소문항.flatMap(s=>(s.급소||[]).map(k=>String(k.실체).trim().replace(/^[\s,]+/,''))).filter(Boolean))].map((실체,i)=>({id:'g'+(i+1),실체}));
  const 핵심=Array.isArray(인식.제시문핵심)?인식.제시문핵심:[];
  const 관계=(Array.isArray(인식.제시문관계)?인식.제시문관계:[]).map((x,i)=>({id:'r'+(i+1),a:x.a,b:x.b,유형:x.유형,핵심:x.핵심||[],소문항:x.소문항??null}));
  const 요구=Array.isArray(인식.논제요구)?인식.논제요구:[];
  return {급소,핵심,관계,요구};
}

async function 키워드방향논제(res,{소문항,제시문,키워드,인식}){
  if(!키워드){res.status(400).json({error:'방향 키워드를 입력하세요'});return;}
  const 목록=인식목록(소문항,인식);
  if(!목록.급소.length){res.status(400).json({error:'엔진 인식 결과(논제 급소)가 없습니다 — 2단계 인식에서 급소가 서야 생성할 수 있습니다'});return;}
  const 제시문있음=Array.isArray(제시문)&&제시문.length;
  let rules;
  try{rules=sliceSpec(REFINE_SPEC,'## 4. 추가 논제의 원칙','## 6.');}
  catch(e){res.status(500).json({error:'명세서-2를 읽지 못함 — '+e.message});return;}
  const system=`너는 HMOS 논제 문장가다. HMOS 엔진 인식 결과를 바탕으로, 교사가 준 방향 키워드 「${키워드}」로 논제 ${방향논제수}개를 쓴다.

지킬 것:
- 논제는 엔진 인식 결과(논제 급소 · 제시문 핵심 · 제시문 관계 · 논제 요구)에서 짓는다. 인식 결과는 다시 계산하거나 바꾸지 않는다.
- 논제마다 기댄 논제 급소를 pivots에 id로 하나 이상 고르고, 그 급소 실체를 글자 그대로 논제에 쓴다. 목록에 없는 실체를 논제의 핵심으로 세우지 않는다.
- 제시문 관계를 쓰면 relations에 id로 고르고, 그 두 제시문 기호를 [가] 꼴로 논제에 쓴다. 관계의 유형(유사·대비·실증)에 맞게 묻는다 — 대비면 견주거나 맞서게, 유사면 공통 근거를, 실증이면 사례로 뒷받침하게.
- 논제 요구(표적·관계·도구)는 원 논제가 제시문을 어떻게 쓰는지다. 새 논제가 제시문을 쓰는 방식을 정할 때 참고한다.
- 키워드 방향을 논제의 묻는 초점으로 삼는다 — 예: 비교 → 둘을 견주게, 비판 → 평가·비판하게, 원인 → 까닭을 묻게, 구체화 → 범위·관점을 좁혀서. ${방향논제수}개는 서로 다른 급소·관계 조합으로 쓴다.
- 제시문에 없는 사실·사례를 지어내지 않는다. 묻는 말은 설명하시오·논하시오·서술하시오·제시하시오 가운데서 쓴다. 기존 논제의 공통 발문·소문항 번호는 쓰지 않는다.
- difference·measures는 교사가 읽는 문장이다. 「이 논제는」「두 제시문은」처럼 쓰고, 다음 내부 표현을 쓰지 않는다: 엔진, 급소, 사족, 봉인, 뼈대, 후보, 열쇠, 노드, 5색 기호(B·C·P·D·Q), 노드 id(n2·g1·r1 등), 「유사 관계」「대비 관계」 같은 관계 이름, 「교사 키워드」.
- AI는 제안만 한다. 확정은 교사가 한다. 모든 출력은 한국어.

=== 명세서-2 §4·§5 (원문) ===
${rules}`;
  const 요구줄=목록.요구.flatMap(u=>(u.요구||[]).map(r=>`${u.번호?`(${u.번호}) `:''}${(r.제시문||[]).map(l=>`[${l}]`).join('')}를 ${r.종류}로${r.표지?` — 표지 「${r.표지}」`:''}${(r.쌍||[]).length?` · 쌍 ${r.쌍.map(x=>`[${x.a}]↔[${x.b}] ${(x.실제||[]).join('·')||'관계 없음'}`).join(', ')}`:''}`));
  const user=[
    `방향 키워드: 「${키워드}」`,
    `기존 논제 (비교 대상):\n${소문항.map(s=>`${s.번호?`(${s.번호}) `:''}${s.텍스트}`).join('\n')}`,
    `HMOS 엔진 인식 결과 (그대로 받을 것):`,
    `논제 급소:\n${목록.급소.map(g=>`${g.id} 「${g.실체}」`).join('\n')}`,
    목록.핵심.length?`제시문 핵심 (논제가 그 제시문에 요구하는 역할 · 논제에 닿은 부분):\n${목록.핵심.map(x=>`[${x.id}] ${(x.핵심||[]).length?`${x.역할?x.역할+' · ':''}${x.핵심.map(k=>`「${k}」`).join(' · ')}`:'도구 — 논제가 짚은 부분 없음'}`).join('\n')}`:'제시문 핵심: 없음',
    목록.관계.length?`제시문 관계 (같은 소문항에 함께 걸린 쌍):\n${목록.관계.map(x=>`${x.id}${x.소문항?` (${x.소문항})`:''} [${x.a}]↔[${x.b}] ${x.유형}${x.핵심.length?` (핵심 「${x.핵심[0]}」·「${x.핵심[1]}」)`:''}`).join('\n')}`:'제시문 관계: 없음',
    요구줄.length?`논제 요구:\n${요구줄.join('\n')}`:'논제 요구: 없음',
    제시문있음?`제시문:\n${제시문글(제시문)}`:'',
  ].filter(Boolean).join('\n\n');
  const r=await askClaude(res,system,user,방향Format(목록.급소.map(g=>g.id),목록.관계.map(x=>x.id)),o=>Array.isArray(o.proposals));
  if(!r)return;

  const 추가논제=await 하나씩(r.out.proposals.slice(0,방향논제수).map((p,i)=>({...p,id:'k'+(i+1)})),async p=>{
    const 급소=목록.급소.filter(g=>(p.pivots||[]).includes(g.id));
    const 관계=목록.관계.filter(x=>(p.relations||[]).includes(x.id));
    // 쓰는 제시문 = 고른 관계의 두 제시문 + 논제에 기호로 쓴 제시문
    const 단락=(제시문있음?제시문.map(x=>x.id):[]).filter(id=>관계.some(x=>x.a===id||x.b===id)||new RegExp(`[\\[(]\\s*${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*[\\])]`).test(p.thesis));
    // 생성 근거 — 서버가 엔진 목록에서 짓는다 (오종래 2026-10-21: 「급소 [X], 제시문 관계 [Y↔Z: 대비], 키워드 [비판] 방향으로 생성」)
    const 근거=[`급소 ${급소.length?급소.map(g=>`[${g.실체}]`).join(' '):'[없음]'}`,
      ...(관계.length?[`제시문 관계 ${관계.map(x=>`[${x.a}↔${x.b}: ${x.유형}]`).join(' ')}`]:[]),
      `키워드 [${키워드}] 방향으로 생성`].join(', ');
    const 점검=[...(급소.length?[]:['기댄 논제 급소를 고르지 않음']),
      ...급소.filter(g=>!p.thesis.includes(g.실체)).map(g=>`급소 「${g.실체}」가 논제에 그대로 남지 않음`),
      ...관계.flatMap(x=>[x.a,x.b]).filter((l,i,a)=>a.indexOf(l)===i&&!p.thesis.includes(`[${l}]`)).map(l=>`관계의 제시문 기호 [${l}]가 논제에 없음`),
      ...내부표현(p.difference).map(w=>`「기존과 다른 점」에 내부 표현 「${w}」`),
      ...내부표현(p.measures).map(w=>`「새로 측정하는 것」에 내부 표현 「${w}」`)];
    const a=await runAnalyze({파이프라인:'C',논제:p.thesis,...(제시문있음?{제시문}:{})});
    let 자가검증;
    if(!a.ok||!a.단계||!a.단계.인식)자가검증={통과:false,사유:(a.error&&a.error.사유)||'재인식 실패'};
    else{
      const 연결단락=[...new Set(((a.단계.정합&&a.단계.정합.소문항)||[]).flatMap(x=>x.연결단락||[]))];
      const 재급소=a.단계.인식.소문항.flatMap(s=>s.급소.map(k=>k.실체.trim().replace(/^[\s,]+/,'')));
      const 빠진=제시문있음?단락.filter(l=>!연결단락.includes(l)):[];
      자가검증={통과:!빠진.length&&재급소.length>0,연결단락,급소:재급소,
        ...(빠진.length?{사유:`[${빠진.join('], [')}]에 연결되지 않음`}:!재급소.length?{사유:'핵심이 서지 않음'}:{})};
    }
    return {id:p.id,유형:`키워드 「${키워드}」`,제시문:단락,논제:p.thesis,기존과다른점:p.difference,새로측정하는것:p.measures,근거,점검,자가검증};
  });
  res.json({model:r.msg.model,usage:r.msg.usage,키워드,방향:true,추가논제});
}

// ── POST /api/interview — 출제도구 면접 2단계: 급소별 면접 질문 (오종래 2026-10-19) ──
// 급소는 1단계에서 엔진(/analyze)이 잡고 교사가 확인한 것 그대로 받는다. Claude는 급소마다 본질문·꼬리질문 2·근거 문장만 쓴다.
// 급소가 없으면 만들지 않는다 (일반 질문 차단). 원문은 근거 인용용으로만 준다 — 질문은 급소에서만.
// 성적 분위 · 면접관 유형 (오종래 2026-10-19 — 두 변수 결합). 화면 목록과 같은 값만 받는다 — 다른 글이 프롬프트에 들어가지 않게
const 면접성적분위=['3','10','25','50'];
const 면접관목록={전문성:['학자형','경영인형','실무형'],성향:['내성적','외향적'],성별:['남성','여성'],연령대:['중년 (40~50대)','장년 (60대 이상)'],직위:['교수','부교수','산업체','기타']};
// 면접 유형 (오종래 2026-10-19) — 유형별 기대 수준과 질문 방향. 입사·이직은 성적 분위가 없다 (직무 역량 · 경력 수준 중심)
const 면접유형목록={
  고입:{기대:'중학생 눈높이·성장 가능성',분위:true},
  대입:{기대:'학문적 잠재력·전공 적합성',분위:true},
  편입:{기대:'전공 기초 지식·학업 연속성',분위:true},
  입사:{기대:'직무 역량·조직 적응력',분위:false,분위없음:'직무 역량 중심'},
  이직:{기대:'경력 성과·문제해결·성장',분위:false,분위없음:'경력 수준 중심'},
};
// 대입 세부 유형 (오종래 2026-10-19) — 2단계에서 고른다. 질문 방식은 사용자 메시지에 넣는다. MMI는 꼬리질문 없이 본질문만
const 대입세부목록={
  '학생부 기반':'활동 경험·배움·성장 중심 질문',
  '제시문 기반':'급소를 제시문 논리와 연결해 분석·비교 질문',
  '교과 심층':'급소 개념의 원리·적용·추론 질문',
  '인성·상황':'급소 관련 가치관·판단·갈등 해결 질문',
  'MMI':'급소마다 짧고 독립적인 판단 질문 (꼬리질문 없이 본질문만)',
};
const 꼬리수of=세부=>세부==='MMI'?0:2;
const 면접시스템=(면접관,분위,유형,꼬리수=2)=>`이것은 ${유형} 면접입니다.
기대 수준과 질문 방향: ${면접유형목록[유형].기대}

당신은 ${면접관.직위} ${면접관.연령대} ${면접관.성별} ${면접관.성향} ${면접관.전문성} 면접관입니다.
${면접유형목록[유형].분위?`지원자는 상위 ${분위}% 학생입니다.

면접관 기대 수준:
- 상위 3%: 개념 깊이·독창성·연구 가능성 집중.
  날카롭고 압박적 질문.
- 상위 10%: 응용력·문제해결력 검증.
- 상위 25%: 기본기 확인·성장 가능성 중심.
  격려형 포함.
- 상위 50%: 가능성·열정 발굴.
  부드럽고 개방적 질문.`:`지원자의 성적 분위는 없습니다 — ${면접유형목록[유형].분위없음}으로 묻습니다.`}

면접관 성향:
- 학자형: 개념·논리·근거 중심
- 경영인형: 실용·성과·문제해결 중심
- 실무형: 현장 적용·협업·경험 중심
- 내성적: 짧고 핵심만
- 외향적: 대화식·편안하게

반드시:
- 아래 급소만 기반으로 질문할 것
- 급소 없는 내용은 묻지 말 것
- 각 질문마다 근거 명시
  (자소서 N번·학생부 ○○과목 세특)
${꼬리수?'- 본질문 1개·꼬리질문 2개 세트로':'- 본질문 1개만 (꼬리질문 없이 — followups는 빈 배열)'}

지킬 것:
- 급소 블록 하나당 카드 하나. id는 블록의 id 그대로. 블록에 없는 급소를 만들지 않는다.
- 급소는 HMOS 엔진이 잡고 교사가 확인한 것이다. 다시 고르거나 바꾸지 않는다. 본질문은 그 급소를 직접 묻는다.
- 「근거 대목」은 근거를 인용하는 데만 쓴다. 대목에 있어도 급소와 닿지 않는 내용은 묻지 않는다.
- basis는 「자료 근거」(예: 자소서 2번 문항)를 그대로 쓰고, 근거 대목에서 급소가 나온 말을 작은따옴표로 짧게 인용한다.
${꼬리수?'- 꼬리질문 둘은 본질문의 답을 더 깊이 확인하는 질문이다. 같은 급소 안에서만 묻는다.\n':''}- 사용자 메시지의 「질문 방식」에 맞는 톤·방향으로 묻는다.
- 지원처(학교·학과·기업·직무·전형)는 질문 말투를 맞추는 데만 쓴다. 지원처 정보로 새 주제를 묻지 않는다.
- 지원자가 읽고 답할 질문이다. 엔진·급소·노드·5색 같은 분석 용어를 질문과 근거에 쓰지 않는다.
- 모든 출력은 한국어.`;

const 면접형식=ids=>({type:'json_schema',schema:{type:'object',additionalProperties:false,required:['cards'],properties:{
  cards:{type:'array',description:'급소 블록 하나당 하나 — 블록의 id를 그대로',items:{type:'object',additionalProperties:false,required:['id','question','followups','basis'],properties:{
    id:{type:'string',enum:ids},
    question:{type:'string',description:'본질문 — 급소를 직접 묻는다'},
    followups:{type:'array',items:{type:'string'},description:'꼬리질문 두 개 — 같은 급소에서 (MMI는 빈 배열)'},
    basis:{type:'string',description:"근거 — 자료 근거 + 원문 대목 인용 (예: 자소서 2번 문항 '○○ 경험'에서)"},
  }}},
}}});

const 면접용어=[/엔진/,/급소/,/노드/,/5색/,/봉인/];
/** 근거 대목 — 원문에서 급소가 나온 문장만 (없으면 급소 낱말이 든 문장). 원문 전체를 주면 급소 밖 내용까지 묻는다 (2026-10-19 로컬 확인) */
function 근거대목(원문,급소){
  const 문장=String(원문||'').split(/(?<=[.!?。])\s+|\n+/).map(t=>t.trim()).filter(Boolean);
  const 낱=String(급소).split(/[\s,·]+/).filter(w=>w.length>=2);
  const 딱=문장.filter(t=>t.includes(급소));
  return (딱.length?딱:문장.filter(t=>낱.some(w=>t.includes(w)))).join(' ').slice(0,600);
}
app.post('/api/interview',async(req,res)=>{
  const {급소,지원,성적분위,면접관,면접유형,대입세부}=req.body||{};
  const 유형=String(면접유형||'');
  if(!면접유형목록[유형]){res.status(400).json({error:'면접 유형(고입·대입·편입·입사·이직)을 골라야 합니다 — 0단계'});return;}
  const 세부=유형==='대입'?String(대입세부||''):null;
  if(세부!==null&&!대입세부목록[세부]){res.status(400).json({error:`대입 세부 유형(${Object.keys(대입세부목록).join('·')})을 골라야 합니다 — 2단계`});return;}
  const 꼬리수=꼬리수of(세부);
  const 분위=면접유형목록[유형].분위?String(성적분위||''):null;
  if(분위!==null&&!면접성적분위.includes(분위)){res.status(400).json({error:'지원자 성적 분위(상위 3·10·25·50%)를 골라야 합니다 — 0단계'});return;}
  const 관=면접관&&typeof 면접관==='object'?면접관:{};
  const 빠진칸=Object.keys(면접관목록).filter(k=>!면접관목록[k].includes(관[k]));
  if(빠진칸.length){res.status(400).json({error:`면접관 유형을 고르세요 — ${빠진칸.join('·')}`});return;}
  const 목록=Array.isArray(급소)?급소.filter(u=>u&&typeof u.id==='string'&&String(u.급소||'').trim()&&String(u.근거||'').trim()):[];
  if(!목록.length){res.status(400).json({error:'급소가 없습니다 — 1단계에서 급소를 확인하세요 (급소 없이 일반 질문은 만들지 않습니다)'});return;}
  const ids=[...new Set(목록.map(u=>u.id))];
  if(ids.length!==목록.length){res.status(400).json({error:'급소 id가 겹칩니다'});return;}
  const 지원글=지원&&typeof 지원==='object'?['대학','학과','전형'].map(k=>String(지원[k]||'').trim()).filter(Boolean).join(' · '):'';
  const user=[
    지원글?`지원: ${지원글}`:'',
    세부?`질문 방식: 대입 면접 — ${세부}: ${대입세부목록[세부]}`:`질문 방식: ${유형} 면접 — ${면접유형목록[유형].기대} 중심 질문`,
    `급소 (HMOS 엔진 · 교사 확인 — 그대로 받을 것):\n\n${목록.map(u=>[
      `[급소 ${u.id}]`,
      `급소: 「${String(u.급소).trim()}」`,
      `자료 근거: ${String(u.근거).trim()}`,
      `근거 대목 (급소가 나온 문장 — 인용용): ${근거대목(u.원문,String(u.급소).trim())||'(급소가 나온 문장을 찾지 못함 — 자료 근거만 밝힐 것)'}`,
    ].join('\n')).join('\n\n')}`,
  ].filter(Boolean).join('\n\n');
  const r=await askClaude(res,면접시스템(관,분위,유형,꼬리수),user,면접형식(ids),o=>Array.isArray(o.cards));
  if(!r)return;
  // 점검 — 판정하지 않고 면접관 확인으로 표시만: 카드 빠짐 · 꼬리질문 수 · 근거에 자료 근거 없음 · 급소 말이 질문·근거에 없음 · 분석 용어
  const 질문=목록.map(u=>{
    const c=r.out.cards.find(x=>x.id===u.id);
    const 기본={id:u.id,급소:String(u.급소).trim(),자료:u.자료||'',자료근거:String(u.근거).trim(),급소출처:u.출처||'엔진'};
    if(!c)return {...기본,본질문:'',꼬리질문:Array(꼬리수).fill(''),근거:'',점검:['Claude가 이 급소의 질문을 내지 않음']};
    const 꼬리=(c.followups||[]).slice(0,꼬리수);
    while(꼬리.length<꼬리수)꼬리.push('');
    const 점검=[];
    if((c.followups||[]).length!==꼬리수)점검.push(`꼬리질문이 ${(c.followups||[]).length}개${꼬리수?'':' (MMI는 본질문만)'}`);
    if(!String(c.basis).includes(기본.자료근거))점검.push(`근거에 「${기본.자료근거}」가 없음`);
    if(![c.question,c.basis].some(t=>String(t).includes(기본.급소)))점검.push(`급소 「${기본.급소}」가 본질문·근거에 그대로 나오지 않음`);
    const 용어=[...new Set([c.question,...꼬리,c.basis].flatMap(t=>면접용어.flatMap(re=>{const m=String(t).match(re);return m?[m[0]]:[];})))];
    if(용어.length)점검.push(`분석 용어 ${용어.map(x=>`「${x}」`).join(' ')}`);
    return {...기본,본질문:c.question,꼬리질문:꼬리,근거:c.basis,점검};
  });
  res.json({model:r.msg.model,usage:r.msg.usage,면접유형:유형,대입세부:세부,성적분위:분위,면접관:Object.fromEntries(Object.keys(면접관목록).map(k=>[k,관[k]])),질문});
});

// ── POST /api/passage-relation —출제도구 논술 3단계: 제시문 급소 사이 관계 6유형 (오종래 2026-10-19) ──
// 급소는 엔진이 제시문마다 따로 잡은 것 그대로 받는다 (제시문 하나씩 /analyze). Claude는 급소 사이 관계 유형만 판정한다.
// 방향 있는 관계(흡수·근거·주장·수렴)는 from → to: 포함되는 쪽 → 포함하는 쪽 · 근거 → 주장 · 모이는 제시문들 → 결론
const 관계유형={
  병렬:'같은 방향, 서로 보완',
  대비:'방향 반대, 긴장 관계',
  대조:'완전히 상충',
  흡수:'한쪽이 다른 쪽을 포함',
  '근거·주장':'한쪽이 다른 쪽의 근거',
  수렴:'여럿이 하나의 결론으로 모임',
};
const 관계시스템=`너는 논술 제시문 급소 사이의 관계를 판정한다.
각 제시문의 급소는 HMOS 엔진이 제시문마다 따로 잡은 것이다. 다시 고르거나 바꾸지 말고 그대로 받는다.

관계 유형 (이 여섯 가지만):
${Object.entries(관계유형).map(([k,v])=>`- ${k}: ${v}`).join('\n')}

지킬 것:
- 제시문 id는 블록의 id 그대로. 블록에 없는 제시문을 만들지 않는다.
- 병렬·대비·대조는 from 하나, to 하나 (방향 없음).
- 흡수는 from = 포함되는 쪽, to = 포함하는 쪽 (각 하나).
- 근거·주장은 from = 근거가 되는 쪽, to = 주장 쪽 (각 하나).
- 수렴은 from = 모이는 제시문 둘 이상, to = 빈 배열, conclusion = 모이는 결론 한 문장.
- 수렴이 아니면 conclusion은 빈 문자열.
- 관계가 분명한 짝만 낸다. 모든 짝을 억지로 채우지 않는다. 같은 짝에 관계를 둘 내지 않는다.
- reason은 두 급소가 왜 그 관계인지 원문에 기대어 한두 문장으로.
- 모든 출력은 한국어.`;
const 관계형식=ids=>({type:'json_schema',schema:{type:'object',additionalProperties:false,required:['relations'],properties:{
  relations:{type:'array',items:{type:'object',additionalProperties:false,required:['type','from','to','conclusion','reason'],properties:{
    type:{type:'string',enum:Object.keys(관계유형)},
    from:{type:'array',items:{type:'string',enum:ids}},
    to:{type:'array',items:{type:'string',enum:ids}},
    conclusion:{type:'string',description:'수렴일 때만 — 모이는 결론 한 문장'},
    reason:{type:'string'},
  }}},
}}});
app.post('/api/passage-relation',async(req,res)=>{
  const {논제,급소}=req.body||{};
  const 목록=Array.isArray(급소)?급소.filter(u=>u&&typeof u.id==='string'&&String(u.급소||'').trim()):[];
  if(목록.length<2){res.status(400).json({error:'급소가 선 제시문이 둘 이상이어야 관계를 판정합니다'});return;}
  const ids=[...new Set(목록.map(u=>u.id))];
  if(ids.length!==목록.length){res.status(400).json({error:'제시문 id가 겹칩니다'});return;}
  const user=[
    String(논제||'').trim()?`논제 (참고 — 관계 판정은 급소 사이로만):\n${String(논제).trim()}`:'',
    `제시문 급소 (HMOS 엔진 — 그대로 받을 것):\n\n${목록.map(u=>[
      `[제시문 ${u.id}]`,
      `급소: 「${String(u.급소).trim()}」`,
      `원문: ${String(u.원문||'').trim().slice(0,1500)}`,
    ].join('\n')).join('\n\n')}`,
  ].filter(Boolean).join('\n\n');
  const r=await askClaude(res,관계시스템,user,관계형식(ids),o=>Array.isArray(o.relations));
  if(!r)return;
  // 형식이 어긋난 관계는 버리지 않고 점검으로 표시만
  const 짝=new Set();
  const 관계=r.out.relations.map(x=>{
    const from=[...new Set(x.from||[])],to=[...new Set(x.to||[])];
    const 점검=[];
    if(from.some(i=>to.includes(i)))점검.push('같은 제시문이 양쪽에 있음');
    if(x.type==='수렴'){if(from.length<2||to.length)점검.push('수렴은 둘 이상이 결론 하나로 모여야 함');if(!String(x.conclusion||'').trim())점검.push('수렴 결론이 비어 있음');}
    else if(from.length!==1||to.length!==1)점검.push(`${x.type}는 제시문 하나 ↔ 하나`);
    const 열쇠=[...from,...to].sort().join('|');
    if(x.type!=='수렴'&&짝.has(열쇠))점검.push('같은 짝에 관계가 둘');
    짝.add(열쇠);
    return {유형:x.type,from,to,결론:x.type==='수렴'?String(x.conclusion||'').trim():'',이유:String(x.reason||'').trim(),점검};
  });
  res.json({model:r.msg.model,usage:r.msg.usage,관계});
});

// ── POST /api/ocr — 0단계 문항 등록: 이미지(1~2장)·PDF → 원문 텍스트 + 그림 영역 (오종래 2026-10-14) ──
// 글자를 옮겨 적기만 한다. 인식·분석은 엔진이 하므로 Claude는 고치거나 요약하지 않는다.
// 이미지는 대시보드가 Claude가 보는 크기(긴 변 1568px 이하)로 줄여 크기와 함께 보낸다 — 그림 영역은 그 사진의 픽셀 좌표로 받아
// 대시보드가 원본에서 잘라 [그림 n] 자리에 넣는다.
const OCR_이미지=['image/jpeg','image/png','image/webp','image/gif'];
app.post('/api/ocr',async(req,res)=>{
  const 파일=(req.body&&req.body.파일)||[];
  if(!Array.isArray(파일)||!파일.length){res.status(400).json({error:'파일이 없습니다'});return;}
  const pdf=파일.filter(f=>f.종류==='application/pdf');
  if(pdf.length?파일.length!==1:파일.length>2){res.status(400).json({error:'이미지는 1~2장, PDF는 한 개만 보낼 수 있습니다'});return;}
  const 틀린=파일.find(f=>f.종류!=='application/pdf'&&!OCR_이미지.includes(f.종류));
  if(틀린){res.status(400).json({error:`읽을 수 없는 형식: ${틀린.종류||'알 수 없음'}`});return;}
  const 크기=f=>Array.isArray(f.크기)&&f.크기.length===2&&f.크기.every(v=>Number.isFinite(v)&&v>0)?f.크기:null;
  // 유형 '답안' — /grader 학생 답안 사진 (2026-10-15). 옮겨 적기만 한다 — 채점은 엔진(/api/grade)이 한다
  const 답안=req.body.유형==='답안';
  // 유형 '자료' — 출제도구 면접 0단계 자기소개서·학생부 PDF (2026-10-19). 옮겨 적기만 한다 — 급소는 엔진이 잡는다
  const 자료=req.body.유형==='자료';
  const content=[
    ...파일.flatMap((f,i)=>f.종류==='application/pdf'
      ?[{type:'document',source:{type:'base64',media_type:'application/pdf',data:f.데이터}}]
      :[{type:'text',text:`사진 ${i+1}${크기(f)?` (가로 ${f.크기[0]} × 세로 ${f.크기[1]} px)`:''}`},
        {type:'image',source:{type:'base64',media_type:f.종류,data:f.데이터}}]),
    {type:'text',text:답안
      ?'위 자료에 있는 학생 답안의 글자를 그대로 옮겨 적어라. 문제 글(발문·제시문)이 함께 찍혀 있으면 빼고 학생이 쓴 답만 적는다.'
      :자료
      ?'위 자료(자기소개서 또는 학생부)의 글자를 그대로 옮겨 적어라. 문항 번호·과목 이름 머리는 원문 모양 그대로 둔다.'
      :['A','B'].includes(req.body.유형)
      ?'위 자료에 있는 시험 문항(문항 번호·발문·조건·보기·배점)의 글자를 그대로 옮겨 적어라.'
      :'위 자료에 있는 논술 문항(논제와 제시문)의 글자를 그대로 옮겨 적어라.'},
  ];
  const system=답안?`너는 학생 답안을 옮겨 적는 전사기다. 채점하지 않는다.
- 학생이 쓴 글자를 그대로 옮긴다. 맞춤법·띄어쓰기·계산 실수도 고치지 않는다. 고치거나 요약하거나 설명을 붙이지 않는다.
- 줄을 그어 지운 글은 옮기지 않는다.
- 단락 사이는 빈 줄 하나로 나눈다. 여러 장이면 순서대로 이어 적는다.
- 읽을 수 없는 글자는 □로 적는다.
- 수식은 LaTeX를 쓰지 않고 평문으로 적는다: 거듭제곱 x², 분수 a/b, 근호 √(…), 미분 f'(x), 부등호 ≤ ≥, 적분 ∫.
- figures는 빈 배열로 둔다.`:`너는 시험 문항 원문을 옮겨 적는 전사기다.
- 보이는 글자를 그대로 옮긴다. 고치거나 요약하거나 설명을 붙이지 않는다. 맞춤법·띄어쓰기도 원문대로.
- 제시문 라벨([가]·<가>·(가) 등), 문항 번호([문항 1]·(1-1) 등), 배점 표기는 원문 모양 그대로 둔다.
- 단락 사이는 빈 줄 하나로 나눈다. 쪽 머리말·쪽 번호·워터마크는 뺀다.
- 여러 장이면 순서대로 이어 적는다.
- 표는 글자로 옮긴다. 그림·그래프·도형은 나오는 차례대로 [그림 1], [그림 2]…로 번호를 붙여 본문의 그 자리에 따로 한 줄로 적는다. 그림 안의 글자는 본문에 옮기지 않는다.
- figures에는 [그림 n]마다 하나씩: n(번호), photo(몇 번째 사진인지, 1부터), box([x1, y1, x2, y2] — 그 사진의 왼쪽 위가 0,0인 픽셀 좌표, 사진 크기는 사진 앞에 적혀 있다). 영역은 그림 전체와 그림에 딸린 축 이름·점 이름·눈금·범례를 다 넣고 본문 문장은 넣지 않는다. PDF는 figures를 빈 배열로 둔다.
- 읽을 수 없는 글자는 □로 적는다.
- 수식은 LaTeX를 쓰지 않고 평문으로 적는다 (엔진이 읽는 꼴): 거듭제곱 x², 분수 a/b, 근호 √(…), 그리스 문자 π·θ 그대로, 미분 f'(x), 부등호 ≤ ≥, 적분 ∫, 구간별 함수 { 5x+a (x < -2) / x²-a (x ≥ -2) }.
- 객관식 보기 번호 ①~⑤와 배점 [3점]은 원문 모양 그대로 둔다.`;
  const r=await askClaude(res,system,content,
    {type:'json_schema',schema:{type:'object',additionalProperties:false,required:['text','figures'],properties:{
      text:{type:'string',description:'옮겨 적은 원문 전체 — 그림 자리는 [그림 n]'},
      figures:{type:'array',items:{type:'object',additionalProperties:false,required:['n','photo','box'],properties:{
        n:{type:'integer'},photo:{type:'integer'},box:{type:'array',items:{type:'number'}},
      }}},
    }}},
    o=>typeof o.text==='string'&&Array.isArray(o.figures));
  if(!r)return;
  // 영역은 사진 안으로 맞추고, 사진이 없거나 넓이가 없는 것은 버린다 — 대시보드는 받은 것만 자른다
  const 그림=r.out.figures.flatMap(g=>{
    const f=파일[g.photo-1],k=f&&f.종류!=='application/pdf'&&크기(f);
    if(!k||!Array.isArray(g.box)||g.box.length!==4||!g.box.every(Number.isFinite))return [];
    const [x1,y1,x2,y2]=[Math.min(g.box[0],g.box[2]),Math.min(g.box[1],g.box[3]),Math.max(g.box[0],g.box[2]),Math.max(g.box[1],g.box[3])]
      .map((v,i)=>Math.max(0,Math.min(v,k[i%2])));
    return x2-x1>=4&&y2-y1>=4?[{번호:g.n,사진:g.photo,영역:[x1,y1,x2,y2]}]:[];
  });
  res.json({model:r.msg.model,usage:r.msg.usage,텍스트:r.out.text,그림});
});

// nginx(https://hmos.hunminos.com)만 닿게 — 3000번을 밖에 열지 않는다 (2026-10-13)
app.listen(PORT,'127.0.0.1',()=>console.log('HMOS 127.0.0.1:'+PORT));

