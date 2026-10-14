
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
// 탭 아이콘 — 대시보드처럼 <link rel=icon>이 없는 화면은 /favicon.ico를 찾는다. SVG를 그대로 내준다
app.get('/favicon.ico',(req,res)=>res.type('image/svg+xml').sendFile(path.join(__dirname,'favicon.svg')));
app.get('/dashboard',(req,res)=>{
  if(!접속됨(req)){res.redirect(302,'/?login=1');return;}
  res.setHeader('Cache-Control','no-store');
  res.sendFile(path.join(__dirname,'hmos_dashboard.html'));
});
app.get('/hmos_dashboard.html',(req,res)=>res.redirect(302,'/dashboard'));

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
    msg=await client.beta.messages.create({
      model:MODEL,
      max_tokens:8000,
      betas:['server-side-fallback-2026-07-01'],
      fallbacks:'default',
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

/** 소문항 하나 — 조각 문장 → 충족 확인 → 못 채운 조각만 다시 (2회까지) → 모범답안 */
async function 소문항모범답안(s,{논제,제시문,계열}){
  const 조각표=c=>({id:c.id,파트:c.파트,요소:c.요소,실체:조각실체(c,s.급소),...(c.제시문?{제시문단락:`[${c.제시문.단락}]`}:{}),...(c.근거?{근거문장:`[${c.근거.단락}] ${c.근거.문장}`}:{}),...(c.경로?{경로:c.경로.map(p=>`${p.색}「${p.실체}」${p.단락?`[${p.단락}]`:''}`).join(' → '),급소핵심어:K글자(c,s.급소)}:{}),확인물음:c.확인물음,충족조건:c.충족조건,엔진모범조각틀:c.모범조각틀});
  const 바탕=[
    `계열: ${계열}`,
    `이 소문항:\n${s.공통발문?s.공통발문+'\n':''}${s.번호?`(${s.번호}) `:''}${s.텍스트}`,
    `전체 논제:\n${논제}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문.map(p=>(/^[가-하]$/.test(p.id)?`[${p.id}] `:'')+p.텍스트).join('\n\n')}`:'제시문: (없음)',
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
    if(!(문장[c.id]||'').includes(K글자(c,s.급소)))return false;
    const 남은흔적=흔적(c);
    return 남은흔적===null||남은흔적.length>0;
  };
  let 시도=0;
  let 남은=s.조각;
  while(남은.length&&시도<=루브릭재시도){
    const 일=시도===0
      ?`엔진 조각 (이 순서로 문장을 쓴다):\n${JSON.stringify(s.조각.map(조각표),null,1)}`
      :`아래 조각은 앞서 쓴 문장이 충족하지 못했다 — 실체 글자가 빠졌거나, 경로가 붙은 답구하기 조각은 급소 글자 또는 경로 앞 표지 흔적(하나 이상)이 빠졌다. 그 글자를 그대로 넣어 이 조각들만 다시 쓴다.\n`+
       `이미 쓴 다른 조각 문장 (참고만, 다시 쓰지 말 것):\n${s.조각.filter(c=>!남은.includes(c)).map(c=>`- ${c.id}: ${문장[c.id]}`).join('\n')||'(없음)'}\n\n`+
       `다시 쓸 조각:\n${JSON.stringify(남은.map(조각표),null,1)}`;
    const r=await 조각문장([...바탕,일].join('\n\n'));
    사용.push(r.usage);
    for(const c of 남은)if(r.문장[c.id])문장[c.id]=r.문장[c.id];
    시도++;
    남은=s.조각.filter(c=>!채움(c));
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

app.post('/api/rubric',async(req,res)=>{
  // 논제: 7단계에서 교사가 확정한 논제 글 · 계열: 교사가 8단계에서 고른 값 · 총배점: 소문항 하나의 배점 (교사 입력)
  const {논제,계열,총배점,제시문}=req.body||{};
  const t=String(논제||'').trim();
  if(!t){res.status(400).json({error:'확정 논제가 필요합니다'});return;}
  if(!['수리','인문사회국어'].includes(계열)){res.status(400).json({error:'계열(수리·인문사회국어)을 골라야 합니다'});return;}
  const 배점=Number(총배점);
  if(!(배점>0)){res.status(400).json({error:'총배점은 0보다 큰 수여야 합니다'});return;}

  // 제시문 — 인문논술 세우기 조각(연결 단락의 문장)을 엔진이 세는 데 쓴다
  const r=await runAnalyze({파이프라인:'C',작업:'루브릭',논제:t,계열,총배점:배점,...(Array.isArray(제시문)&&제시문.length?{제시문}:{})});
  if(!r.ok||!r.단계||!r.단계.루브릭){res.status(r.러너실패?500:400).json({error:'엔진 루브릭 실패: '+((r.error&&r.error.사유)||'알 수 없음')});return;}
  const 소문항=[];
  try{
    // Claude 호출도 소문항마다 하나씩 차례로
    for(const s of r.단계.루브릭.소문항){
      소문항.push(s.조각&&s.조각.length?await 소문항모범답안(s,{논제:t,제시문,계열}):s);
    }
  }catch(e){
    res.status(502).json({error:e.message});
    return;
  }
  res.json({엔진:r.엔진,계열,총배점:배점,소문항});
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
  return s.조각.map(c=>{
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
  const {소문항:s,논제,계열}=req.body||{};
  if(!s||!Array.isArray(s.조각)||!s.조각.length){res.status(400).json({error:'루브릭 조각이 있는 소문항이 필요합니다 — 8단계에서 루브릭을 먼저 만드세요'});return;}
  if(s.조각.some(c=>!String(c.표현||'').trim())){res.status(400).json({error:'문장이 없는 조각이 있습니다 — 8단계에서 루브릭을 다시 만드세요'});return;}
  const 순서=['근거대기','세우기','풀기','답구하기'];
  const 조각=[...s.조각].sort((a,b)=>순서.indexOf(a.파트)-순서.indexOf(b.파트));
  const 바탕=[
    계열?`계열: ${계열}`:'',
    `이 소문항:\n${s.공통발문?s.공통발문+'\n':''}${s.번호?`(${s.번호}) `:''}${s.텍스트||''}`,
    논제?`전체 논제:\n${논제}`:'',
    `조각 문장 (이 순서로 잇는다):\n${조각.map((c,i)=>`${i+1}. [${c.파트}] ${c.표현}\n   반드시 남길 글자: 「${K글자(c,s.급소)}」${c.경로&&c.경로.length>1?` · 경로 흔적 하나 이상: ${c.경로.slice(0,-1).map(p=>`「${p.실체}」`).join(' ')}`:''}`).join('\n')}`,
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

// ── POST /api/grade — C 8단계 학생 답안 채점 (오종래 2026-10-14) ──────────
// 엔진 G1이 조각마다 O/X를 판정한다 (봉인⑥ 조각 대조 · 봉인④-b 게이트, 계열별). Claude는 쓰지 않는다.
// 인문 세우기는 판정불가로 오고 교사가 매긴다. 교사 수정·확정·여러 학생 목록은 대시보드가 한다.
app.post('/api/grade',async(req,res)=>{
  // 소문항: /api/rubric 응답의 소문항 하나 그대로 (조각·급소) · 학생답: 학생 답안 글 · 계열: 8단계에서 고른 값
  const {소문항:s,학생답,계열}=req.body||{};
  if(!s||!Array.isArray(s.조각)||!s.조각.length){res.status(400).json({error:'루브릭 조각이 있는 소문항이 필요합니다'});return;}
  if(!String(학생답||'').trim()){res.status(400).json({error:'학생 답안을 넣으세요'});return;}
  if(!['수리','인문사회국어'].includes(계열)){res.status(400).json({error:'계열(수리·인문사회국어)이 필요합니다'});return;}
  const r=await runAnalyze({파이프라인:'C',작업:'채점',논제:String(s.텍스트||'채점'),계열,학생답:String(학생답),조각:s.조각,급소:s.급소});
  if(!r.ok||!r.단계||!r.단계.채점){res.status(r.러너실패?500:400).json({error:'엔진 채점 실패: '+((r.error&&r.error.사유)||'알 수 없음')});return;}
  res.json({엔진:r.엔진,...r.단계.채점});
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
${공통지킬것}

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

  res.json({model:r.msg.model,usage:r.msg.usage,정교화,사족});
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
  if(!(논제||'').trim()||!Array.isArray(소문항)||!소문항.length){res.status(400).json({error:'논제·소문항(2단계 인식)이 필요합니다'});return;}
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
${공통지킬것}

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
  res.json({model:r.msg.model,usage:r.msg.usage,비교불가:!!관계.비교불가,추가논제});
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
  const content=[
    ...파일.flatMap((f,i)=>f.종류==='application/pdf'
      ?[{type:'document',source:{type:'base64',media_type:'application/pdf',data:f.데이터}}]
      :[{type:'text',text:`사진 ${i+1}${크기(f)?` (가로 ${f.크기[0]} × 세로 ${f.크기[1]} px)`:''}`},
        {type:'image',source:{type:'base64',media_type:f.종류,data:f.데이터}}]),
    {type:'text',text:['A','B'].includes(req.body.유형)
      ?'위 자료에 있는 시험 문항(문항 번호·발문·조건·보기·배점)의 글자를 그대로 옮겨 적어라.'
      :'위 자료에 있는 논술 문항(논제와 제시문)의 글자를 그대로 옮겨 적어라.'},
  ];
  const system=`너는 시험 문항 원문을 옮겨 적는 전사기다.
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

