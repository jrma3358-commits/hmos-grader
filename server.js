
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
  // 인식: /analyze 의 단계.인식.전체 · 진단: /analyze 의 단계.정교화.진단 — 둘 다 엔진 값 그대로
  const {논제,제시문,인식,진단}=req.body||{};
  const t=(논제||'').trim();
  if(!t||!인식||!Array.isArray(진단)){res.status(400).json({error:'논제·인식·진단이 필요합니다'});return;}
  const 사족=진단.filter(d=>d.갈래==='사족');
  const 대상=진단.filter(d=>생성갈래.includes(d.갈래));
  if(!대상.length){res.json({정교화:[],사족});return;}

  let rules;
  try{rules=loadRefineRules();}catch(e){res.status(500).json({error:'정교화 명세를 읽지 못함 — '+e.message});return;}
  const system=`너는 HMOS 논제 정교화기다. 아래 「서술형 문제 정교화」 원문에 따라, HMOS 엔진이 진단한 갈래마다 정교화한 논제를 제안한다.

지킬 것:
- 진단(갈래·근거)과 급소·5색 노드는 HMOS 엔진의 산출이다. 다시 진단하거나 바꾸지 말고 그대로 받는다.
- 진단 하나당 정교화안 하나. 진단에 없는 갈래를 만들지 않는다.
- ① 일방흐름 → 제약 C를 더해 조인다. ② 서술복잡 → 급소는 그대로 두고 (1)(2)(3) 소문항 계단으로 나눈다. ③ 급소불명확 → 급소가 담긴 정의·식을 바꿔 급소를 선명하게 다시 쓴다.
- 정교화는 새 문제를 만드는 것이 아니다. 원 논제가 겨눈 급소·의도를 더 정확하게 만든다.
- 제시문이 주어지면 제시문 실체에서 벗어나지 않는다.
- basis에는 어느 진단 근거·급소에서 나온 정교화인지 밝힌다.
- 모든 출력은 한국어.

=== HMOS 논제생성 명세서-2 §3 (원문) ===
${rules}`;

  const user=[
    `논제:\n${t}`,
    Array.isArray(제시문)&&제시문.length?`제시문:\n${제시문.map(p=>`[${p.id}] ${p.텍스트}`).join('\n')}`:'',
    `HMOS 인식 결과 (그대로 받을 것):\n${JSON.stringify({조합:인식.조합,노드:인식.노드,급소_k:인식.급소},null,2)}`,
    `HMOS 정교화 진단 [봉인⑬] (그대로 받을 것):\n${JSON.stringify(대상,null,2)}`,
  ].filter(Boolean).join('\n\n');

  let msg;
  try{
    msg=await client.beta.messages.create({
      model:MODEL,
      max_tokens:16000,
      betas:['server-side-fallback-2026-07-01'],
      fallbacks:'default',
      system,
      output_config:{format:REFINE_FORMAT},
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
  if(!out||!Array.isArray(out.proposals)){res.status(502).json({error:`정교화안을 받지 못함 (stop_reason: ${msg.stop_reason})`});return;}

  // 자가검증 — 정교화안을 엔진에 다시 태운다. 급소가 의도대로 잡혔는지는 교사가 본다 (판정하지 않는다)
  const 정교화=await Promise.all(out.proposals.map(async p=>{
    const r=await runAnalyze({파이프라인:'C',논제:p.refined});
    const 재인식=r.ok&&r.단계&&r.단계.인식
      ?{급소:r.단계.인식.전체.급소.map(k=>k.실체.trim()),급소실패:r.단계.인식.전체.급소실패,진단:(r.단계.정교화&&r.단계.정교화.진단)||[]}
      :{오류:(r.error&&r.error.사유)||'재인식 실패'};
    return {갈래:p.branch,단위:p.unit||null,논제:p.refined,바꾼점:p.change,근거:p.basis,재인식};
  }));

  res.json({model:msg.model,usage:msg.usage,원급소:(인식.급소||[]).map(k=>(k.실체||'').trim()),정교화,사족});
});

app.get('/dashboard',(req,res)=>res.sendFile(path.join(__dirname,'hmos_dashboard.html')));

app.listen(PORT,()=>console.log('HMOS '+PORT));

