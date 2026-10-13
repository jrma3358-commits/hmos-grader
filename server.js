
const express=require('express');

const {execFile}=require('child_process');

const path=require('path');

const fs=require('fs');

const os=require('os');

const app=express();

const PORT=3000;

const GRADER=path.join(__dirname,'hmos-grader');

app.use(express.json());

app.use(express.static(__dirname));

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

app.post('/analyze',async(req,res)=>{
  const out=await runAnalyze(req.body);
  res.status(out.러너실패?500:out.ok?200:400).json(out);
});

// ── POST /api/generate — HMOS 이론 기반 제안 (루브릭·모범답안·해설) ──────────
// 교사가 탭 4의 버튼을 눌렀을 때만 불린다. /analyze 인식 결과(급소·5색)를 받아 Claude API로 제안을 만든다.
const Anthropic=require('@anthropic-ai/sdk').default;
const client=new Anthropic(); // ANTHROPIC_API_KEY는 .env에서 (pm2 --env-file=.env)
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
    `HMOS 인식 결과 (그대로 받을 것):\n${JSON.stringify({조합:인식.조합,노드:인식.노드,급소_k:인식.급소},null,2)}`,
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

// ── POST /api/refine — C 5단계 논제 정교화 (조립설명서 C·논술 9단계) ──────────
// 진단은 엔진([봉인⑬], /analyze 응답의 단계.정교화.진단)이 한다. Claude는 진단된 ①②③ 갈래마다 정교화안만 쓴다.
// ④사족은 표시만 — 생성하지 않는다. 정교화안은 다시 엔진에 태워 급소·진단을 돌려준다 (명세서-2 §3 자가검증 순환).
const REFINE_SPEC=process.env.HMOS_REFINE_SPEC||path.join(__dirname,'..','hmos-spec','HMOS_논제생성_명세서-2.md');
const 생성갈래=['일방흐름','서술복잡','급소불명확'];

/** 명세서-2 §3 원문 그대로 — 이론을 여기서 새로 쓰지 않는다. 파일이 없어도 서버는 뜨게, 부를 때 읽는다 */
function loadRefineRules(){
  const md=fs.readFileSync(REFINE_SPEC,'utf8');
  const a=md.indexOf('## 3. 서술형 문제 정교화'),b=md.indexOf('## 3-5.');
  if(a<0||b<0)throw new Error('명세서-2에서 §3 정교화 절을 찾지 못함');
  return md.slice(a,b).trim();
}

const REFINE_FORMAT={
  type:'json_schema',
  schema:{
    type:'object',
    additionalProperties:false,
    required:['proposals'],
    properties:{
      proposals:{
        type:'array',
        description:'진단 하나당 정교화안 하나',
        items:{
          type:'object',
          additionalProperties:false,
          required:['branch','unit','refined','change','basis'],
          properties:{
            branch:{type:'string',enum:생성갈래},
            unit:{type:'string',description:'진단의 단위 그대로 (없으면 빈 문자열)'},
            refined:{type:'string',description:'정교화한 논제 전문'},
            change:{type:'string',description:'원 논제에서 무엇을 바꿨는가'},
            basis:{type:'string',description:'엔진 진단 근거와 급소 — 이 정교화가 어느 진단·급소에서 나왔는가'},
          },
        },
      },
    },
  },
};

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
  const system=`너는 HMOS 논제 정교화기다. 아래 「서술형 문제 정교화」 원문에 따라, HMOS 엔진이 진단한 갈래마다 정교화한 논제를 제안한다.

지킬 것:
- 진단(갈래·근거)은 HMOS 엔진의 [봉인⑬] 산출이다. 다시 진단하지 않는다.
- 진단 하나당 정교화안 하나. 진단에 없는 갈래를 만들지 않는다. 진단의 단위(소문항)를 정교화한다.
- ① 일방흐름 → 제약 C를 더해 조인다. ② 서술복잡 → 급소는 그대로 두고 (1)(2)(3) 소문항 계단으로 나눈다. ③ 급소불명확 → 급소가 담긴 정의·식을 바꿔 급소를 선명하게 다시 쓴다.
- 정교화는 새 문제를 만드는 것이 아니다. 원 논제가 겨눈 급소·의도를 더 정확하게 만든다.
- 제시문이 주어지면 제시문 실체에서 벗어나지 않는다.
- basis에는 어느 진단 근거·급소에서 나온 정교화인지 밝힌다.
${공통지킬것}

=== HMOS 논제생성 명세서-2 §3 (원문) ===
${rules}`;

  const user=[
    `논제:\n${t}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문글(제시문)}`:'',
    `소문항별 HMOS 인식 (그대로 받을 것):\n${소문항글(소문항)}`,
    `HMOS 정교화 진단 [봉인⑬] (그대로 받을 것):\n${JSON.stringify(대상,null,2)}`,
  ].filter(Boolean).join('\n\n');

  const r=await askClaude(res,system,user,REFINE_FORMAT,o=>Array.isArray(o.proposals));
  if(!r)return;

  // 자가검증 — 정교화안을 엔진에 다시 태운다. 급소가 의도대로 잡혔는지는 교사가 본다 (판정하지 않는다)
  const 정교화=await Promise.all(r.out.proposals.map(async p=>{
    const a=await runAnalyze({파이프라인:'C',논제:p.refined});
    const 재인식=a.ok&&a.단계&&a.단계.인식
      ?{소문항:a.단계.인식.소문항.map(s=>({번호:s.번호,급소:s.급소.map(k=>k.실체.trim()),급소실패:s.급소실패})),진단:(a.단계.정교화&&a.단계.정교화.진단)||[]}
      :{오류:(a.error&&a.error.사유)||'재인식 실패'};
    const 원=소문항.find(s=>s.번호===(p.unit||null))||(소문항.length===1?소문항[0]:null);
    return {갈래:p.branch,단위:p.unit||null,원급소:원?원.급소.map(k=>k.실체.trim()):[],논제:p.refined,바꾼점:p.change,근거:p.basis,재인식};
  }));

  res.json({model:r.msg.model,usage:r.msg.usage,정교화,사족});
});

// ── C·논술 9단계 Claude 몫 — 3단계 /api/passage · 4단계② /api/leap · 6단계 /api/propose ──────────
// 프롬프트는 원전 md의 해당 절을 그대로 잘라 싣는다. 엔진 산출(급소·노드·4축 ①③④)은 바꾸지 말고 받게 한다.
const ASSEMBLY_SPEC=process.env.HMOS_ASSEMBLY_SPEC||path.join(__dirname,'..','hmos-spec','조립설명서.md');

/** md에서 「from」 머리부터 「to」 머리 앞까지 — 머리를 못 찾으면 던진다 */
function sliceSpec(file,from,to){
  const md=fs.readFileSync(file,'utf8');
  const a=md.indexOf(from),b=to?md.indexOf(to,a+1):md.length;
  if(a<0||b<0)throw new Error(`${path.basename(file)}에서 「${from}」 절을 찾지 못함`);
  return md.slice(a,b).trim();
}

const 공통지킬것=`- HMOS 엔진 산출(소문항별 급소·5색 노드, 4축 ①③④)은 다시 계산하거나 바꾸지 말고 그대로 받는다.
- 출력마다 근거(단락 기호·근거 문장·엔진 노드)를 밝힌다.
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

/** 소문항 인식(/analyze 단계.인식.소문항)을 프롬프트용으로 — 엔진 값 그대로 */
const 소문항글=소문항=>JSON.stringify(소문항.map(s=>({소문항:s.번호,논제:s.텍스트,참조제시문:s.참조,조합:s.조합,노드:s.노드,급소_k:s.급소})),null,2);
const 제시문글=제시문=>제시문.map(p=>`[${p.id}] ${p.텍스트}`).join('\n');
const strArr={type:'array',items:{type:'string'}};

// 3단계 — 제시문 분석. 논제 급소를 기준으로 단락별 P·B·D·C·급소 + 논제 급소 관련 실체 (2026-10-13 확정 2: 둘 다)
const PASSAGE_FORMAT={type:'json_schema',schema:{type:'object',additionalProperties:false,required:['paragraphs'],properties:{
  paragraphs:{type:'array',items:{type:'object',additionalProperties:false,required:['label','P','B','D','C','pivot','related'],properties:{
    label:{type:'string',description:'제시문 기호 그대로 (가·나…)'},
    P:strArr,B:strArr,D:strArr,C:strArr,
    pivot:{type:'string',description:'이 단락 자체의 무게중심 B — 언제나 하나, B 목록 안의 것'},
    related:{type:'array',items:{type:'object',additionalProperties:false,required:['item','entity','sentence'],properties:{
      item:{type:'string',description:'이어지는 소문항 번호 (번호 없는 논제면 빈 문자열)'},
      entity:{type:'string',description:'이 단락에서 그 소문항 급소와 관련된 실체'},
      sentence:{type:'string',description:'근거 문장 — 제시문 원문 그대로'},
    }}},
  }}},
}}};

app.post('/api/passage',async(req,res)=>{
  const {소문항,제시문}=req.body||{};
  if(!Array.isArray(소문항)||!소문항.length||!Array.isArray(제시문)||!제시문.length){res.status(400).json({error:'소문항(2단계 인식)·제시문이 필요합니다'});return;}
  let rules;
  try{rules=sliceSpec(ASSEMBLY_SPEC,'## 3단계','## 4단계');}catch(e){res.status(500).json({error:'조립설명서를 읽지 못함 — '+e.message});return;}
  const system=`너는 HMOS 제시문 분석기다. 아래 조립설명서 3단계 원문에 따라, 논제 급소를 기준으로 제시문을 단락별로 읽는다.

지킬 것:
- 논제를 먼저 읽었다. 소문항별 급소는 엔진이 확정했다 — 그 급소를 방향으로 삼아 제시문을 읽는다.
- 단락마다 P·B·D·C를 낱말·구로 뽑는다. 제시문 원문의 표현을 그대로 쓴다.
- pivot은 그 단락 자체의 무게중심 B다 (논제와 이어지든 아니든). 언제나 하나, 언제나 B.
- related에는 그 단락에서 소문항 급소와 관련된 실체를 근거 문장과 함께 적는다. 관련이 없으면 빈 배열.
- 풀지 마라. 급소와 실체를 잡으면 멈춘다.
${공통지킬것}

=== 조립설명서 3단계 (원문) ===
${rules}`;
  const user=`소문항별 HMOS 인식 (그대로 받을 것):\n${소문항글(소문항)}\n\n제시문:\n${제시문글(제시문)}`;
  const r=await askClaude(res,system,user,PASSAGE_FORMAT,o=>Array.isArray(o.paragraphs));
  if(!r)return;
  res.json({model:r.msg.model,usage:r.msg.usage,제시문분석:r.out.paragraphs.map(p=>({
    단락:p.label,P:p.P,B:p.B,D:p.D,C:p.C,급소:p.pivot,
    관련:p.related.map(x=>({소문항:x.item||null,실체:x.entity,근거문장:x.sentence})),
  }))});
});

// 4단계 ② 비약 — 엔진이 이은 ①타당 연결마다 근거 강도·자연스러움을 Claude가 판단
const LEAP_FORMAT={type:'json_schema',schema:{type:'object',additionalProperties:false,required:['judgments'],properties:{
  judgments:{type:'array',items:{type:'object',additionalProperties:false,required:['index','leap','strength','reason'],properties:{
    index:{type:'integer',description:'엔진 ①타당 연결의 번호 (0부터)'},
    leap:{type:'boolean',description:'비약인가 — 연결은 되나 제시문 근거가 약하거나 억지'},
    strength:{type:'string',enum:['강','중','약']},
    reason:{type:'string',description:'근거 문장을 들어 판단 이유'},
  }}},
}}};

app.post('/api/leap',async(req,res)=>{
  const {소문항,제시문,정합}=req.body||{};
  if(!Array.isArray(소문항)||!Array.isArray(제시문)||!정합||!Array.isArray(정합.타당)){res.status(400).json({error:'소문항·제시문·정합(4단계 엔진 결과)이 필요합니다'});return;}
  if(!정합.타당.length){res.json({비약:[]});return;}
  let rules;
  try{rules=sliceSpec(REFINE_SPEC,'## 3-5.','## 4.');}catch(e){res.status(500).json({error:'명세서-2를 읽지 못함 — '+e.message});return;}
  const system=`너는 HMOS 논제·제시문 정합성 판정기다. 아래 명세서-2 §3-5 원문의 4축 중 ② 비약만 판단한다.

지킬 것:
- ① 타당·③ 불완전·④ 사족은 엔진이 냈다. 다시 판정하지 않는다.
- 엔진이 이은 연결(논제 B노드 ↔ 제시문 단락 급소)마다 하나씩, 제시문 원문을 읽어 근거 강도와 자연스러움을 판단한다.
- 학생 답안을 보는 것이 아니다. 논제와 제시문의 관계를 본다.
${공통지킬것}

=== 명세서-2 §3-5 (원문) ===
${rules}`;
  const user=[
    `소문항별 HMOS 인식 (그대로 받을 것):\n${소문항글(소문항)}`,
    `제시문:\n${제시문글(제시문)}`,
    `엔진 ① 타당 연결 (번호: 내용):\n${정합.타당.map((t,i)=>`${i}: (${t.소문항||'—'}) 논제 B「${t.실체}」(${t.노드}) ↔ 제시문 [${t.단락}] 급소「${t.단락급소}」`).join('\n')}`,
  ].join('\n\n');
  const r=await askClaude(res,system,user,LEAP_FORMAT,o=>Array.isArray(o.judgments));
  if(!r)return;
  res.json({model:r.msg.model,usage:r.msg.usage,비약:r.out.judgments.filter(j=>정합.타당[j.index]).map(j=>({...정합.타당[j.index],비약:j.leap,강도:j.strength,이유:j.reason}))});
});

// 6단계 — 추가 논제 생성 (F_인문사회 6유형). 출력: [문항분석]·[추가논제]·[근거]
const 유형6=['비교·대비','공통원리','근거·주장','대안제시','선택·응용','인연·비판'];
const PROPOSE_FORMAT={type:'json_schema',schema:{type:'object',additionalProperties:false,required:['analysis','proposals'],properties:{
  analysis:{type:'object',additionalProperties:false,required:['pivot','current','covered','gaps'],properties:{
    pivot:{type:'string',description:'급소(k) — 엔진 급소 그대로'},
    current:{type:'string',description:'현재 측정 역량'},
    covered:{type:'array',items:{type:'string',enum:유형6},description:'현재 논제가 덮는 유형 (유형 지도에 대조)'},
    gaps:{type:'array',items:{type:'string',enum:유형6},description:'빈 곳 — 미측정 유형'},
  }},
  proposals:{type:'array',items:{type:'object',additionalProperties:false,required:['type','thesis','difference','measures','passages'],properties:{
    type:{type:'string',enum:유형6},
    thesis:{type:'string',description:'추가 논제 텍스트'},
    difference:{type:'string',description:'기존과 다른 점'},
    measures:{type:'string',description:'새로 측정하는 것'},
    passages:{type:'array',items:{type:'string'},description:'쓰는 제시문 기호'},
  }}},
}}};

app.post('/api/propose',async(req,res)=>{
  const {논제,소문항,제시문,제시문분석,정합}=req.body||{};
  if(!(논제||'').trim()||!Array.isArray(소문항)||!소문항.length){res.status(400).json({error:'논제·소문항(2단계 인식)이 필요합니다'});return;}
  let rules;
  try{rules=[sliceSpec(REFINE_SPEC,'## 1. 공통 입출력','## 2.'),sliceSpec(REFINE_SPEC,'## 4. 추가 논제의 원칙','## 6.')].join('\n\n');}
  catch(e){res.status(500).json({error:'명세서-2를 읽지 못함 — '+e.message});return;}
  const system=`너는 HMOS 추가 논제 생성기다. 아래 명세서-2 원문(§1 공통 출력, §4 추가 논제의 원칙, §5 F_인문사회)에 따라 빈 곳을 채우는 추가 논제를 제안한다.

지킬 것:
- 추가 논제는 자유 생성이 아니다. 현재 논제가 덮는 유형을 6유형 지도에 대조해 빈 유형을 찾고, 그 빈 곳을 채운다.
- 유형 목록은 급소 판별기가 아니라 커버리지 지도다.
- 4단계 ③ 불완전(논제가 끌어오지 않은 제시문 급소)이 있으면 그 실체를 우선 쓴다.
- 제시문 실체에서 벗어나지 않는다. 쓰는 제시문 기호를 밝힌다.
- 「기존과 다른 점」과 「새로 측정하는 것」을 반드시 쓴다.
${공통지킬것}

=== 명세서-2 (원문) ===
${rules}`;
  const user=[
    `논제:\n${논제}`,
    `소문항별 HMOS 인식 (그대로 받을 것):\n${소문항글(소문항)}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문글(제시문)}`:'',
    Array.isArray(제시문분석)?`3단계 제시문 분석:\n${JSON.stringify(제시문분석,null,2)}`:'',
    정합?`4단계 엔진 결과 (①타당·③불완전·④사족):\n${JSON.stringify({타당:정합.타당,불완전:정합.불완전,사족:정합.사족},null,2)}`:'',
  ].filter(Boolean).join('\n\n');
  const r=await askClaude(res,system,user,PROPOSE_FORMAT,o=>o.analysis&&Array.isArray(o.proposals));
  if(!r)return;
  const a=r.out.analysis;
  res.json({model:r.msg.model,usage:r.msg.usage,
    문항분석:{급소:a.pivot,현재역량:a.current,덮는유형:a.covered,빈곳:a.gaps},
    추가논제:r.out.proposals.map(p=>({유형:p.type,논제:p.thesis,기존과다른점:p.difference,새로측정하는것:p.measures,제시문:p.passages})),
  });
});

app.get('/dashboard',(req,res)=>res.sendFile(path.join(__dirname,'hmos_dashboard.html')));

app.listen(PORT,()=>console.log('HMOS '+PORT));

