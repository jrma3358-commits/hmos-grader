
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
  보완:{글:'원 소문항의 핵심은 그대로 두고, 진단이 가리킨 제시문 단락과 그 단락의 실체를 조건으로 끌어들인다. 그 단락 기호([가] 꼴)를 논제에 쓴다. 참조 범위 밖 단락은 끌어들이지 않는다.',핵심유지:true},
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

/** 정교화 작업 블록 — 진단 하나를 엔진 값(소문항·핵심·갈래·근거)과 처방으로 못 박는다 */
function 정교화작업(대상,소문항){
  return 대상.map((d,i)=>{
    const s=소문항.find(x=>x.번호===d.단위)||(소문항.length===1?소문항[0]:null);
    const 핵심=핵심실체(s);
    return {id:'d'+(i+1),진단:d,소문항:s,핵심,
      글:[
        `[작업 d${i+1}]`,
        `소문항: ${d.단위?`(${d.단위})`:'논제 전체'}`,
        `원 논제: ${s?s.텍스트:'(소문항을 찾지 못함 — 논제 전체를 본다)'}`,
        `엔진 핵심: ${핵심.length?핵심.map(k=>`「${k}」`).join(' · '):'서지 않음'}${s&&s.급소덩어리&&s.급소덩어리.length?` (핵심 덩어리 ${s.급소덩어리.map(x=>`「${x.실체}」`).join(' · ')})`:''}`,
        `진단 갈래: ${d.갈래}`,
        `엔진 근거: ${d.근거}`,
        ...(d.갈래==='보완'?[`끌어들일 단락: [${d.단락}] 「${d.급소}」 (이미 연결된 단락 [${d.연결단락}] 「${d.연결급소}」, 두 단락은 ${d.관계} 관계)`]:[]),
        `처방: ${처방[d.갈래].글}`,
        ...(처방[d.갈래].핵심유지&&핵심.length?[`반드시 남길 말: ${핵심.map(k=>`「${k}」`).join(' · ')}${d.갈래==='보완'?` · 「[${d.단락}]」`:''}`]:[]),
      ].join('\n')};
  });
}

/** 정교화안 점검 — 처방이 핵심을 남기라 했는데 빠졌으면 교사 확인 (판정하지 않는다, 표시만) */
function 정교화점검(w,refined){
  const 점검=[];
  if(처방[w.진단.갈래].핵심유지)for(const k of w.핵심)if(!refined.includes(k))점검.push(`핵심 「${k}」가 정교화안에 그대로 남지 않음`);
  if(w.진단.갈래==='보완'&&!refined.includes(`[${w.진단.단락}]`))점검.push(`끌어들일 단락 [${w.진단.단락}] 기호가 정교화안에 없음`);
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
- 작업 블록의 소문항·엔진 핵심·진단 갈래·엔진 근거는 HMOS 엔진 산출이다. 다시 진단하거나 핵심을 바꾸지 않는다. 판단의 근거는 언제나 그 블록의 엔진 근거 하나다.
- 블록 하나당 정교화안 하나. id는 블록의 id 그대로. 블록에 없는 갈래·소문항을 만들지 않는다.
- 블록의 「처방」을 그대로 따른다. 「반드시 남길 말」이 있으면 그 말을 글자 그대로 정교화안에 남긴다.
- 정교화는 새 문제를 만드는 것이 아니다. 원 논제가 겨눈 핵심·의도를 더 정확하게 만든다. 원 논제의 공통 발문·소문항 번호는 쓰지 않는다 — 소문항 본문만 쓴다.
- 제시문이 주어지면 제시문 실체에서 벗어나지 않는다.
- change는 교사가 읽는 문장이다 (오종래 2026-10-13). 5색 기호(B·C·P·D·Q), 노드 id(n2 등), 봉인 번호, 갈래 이름(일방흐름·서술복잡·급소불명확·보완), C-F 같은 내부 표기를 쓰지 않는다. 「제약 C를 더했다」 → 「조건을 더했다」처럼 실체 말로 쓴다.
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
  const 정교화=await Promise.all(작업.map(async w=>{
    const p=r.out.proposals.find(x=>x.id===w.id);
    const 원급소=w.핵심;
    if(!p)return {id:w.id,갈래:w.진단.갈래,단위:w.진단.단위,진단:w.진단,원급소,논제:'',바꾼점:'',점검:['Claude가 이 진단의 정교화안을 내지 않음'],재인식:{오류:'정교화안 없음'}};
    const 보완=w.진단.갈래==='보완'&&Array.isArray(제시문)&&제시문.length;
    const a=await runAnalyze({파이프라인:'C',논제:p.refined,...(보완?{제시문}:{})});
    const 재인식=a.ok&&a.단계&&a.단계.인식
      ?{소문항:a.단계.인식.소문항.map(s=>({번호:s.번호,급소:s.급소.map(k=>k.실체.trim()),급소실패:s.급소실패})),진단:(a.단계.정교화&&a.단계.정교화.진단)||[],
        ...(보완?{연결단락:((a.단계.정합&&a.단계.정합.소문항)||[]).flatMap(x=>x.연결단락||[])}:{})}
      :{오류:(a.error&&a.error.사유)||'재인식 실패'};
    const 점검=정교화점검(w,p.refined);
    if(보완&&재인식.연결단락&&!재인식.연결단락.includes(w.진단.단락))점검.push(`엔진에 다시 넣으니 [${w.진단.단락}]에 연결되지 않음`);
    return {id:w.id,갈래:w.진단.갈래,단위:w.진단.단위,진단:w.진단,원급소,논제:p.refined,바꾼점:p.change,점검,재인식};
  }));

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
- difference는 기존 소문항과 무엇이 다른지, measures는 이 논제가 새로 재는 능력을 엔진 근거(관계·실체)에 기대어 쓴다.
- difference·measures는 교사가 읽는 문장이다 (오종래 2026-10-13). 5색 기호(B·C·P·D·Q), 노드 id(n2 등), 봉인 번호, 「급소」·「사족」 같은 내부 표기를 쓰지 않는다. 「급소」는 「핵심」으로 쓴다.
${공통지킬것}

=== 명세서-2 §4·§5 (원문) ===
${rules}`;
  const 블록=후보.map(c=>[
    `[후보 ${c.id}]`,
    `유형: ${c.유형} (단락 관계: ${c.관계})`,
    `두 단락: [${c.단락[0]}] · [${c.단락[1]}]`,
    `엔진 근거: ${c.근거}`,
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

  const 추가논제=await Promise.all(후보.map(async c=>{
    const p=r.out.proposals.find(x=>x.id===c.id);
    const 기본={id:c.id,유형:c.유형,관계:c.관계,뼈대:c.뼈대,제시문:c.단락,근거:c.근거};
    if(!p)return {...기본,논제:'',기존과다른점:'',새로측정하는것:'',점검:['Claude가 이 후보의 논제를 내지 않음'],자가검증:{통과:false,사유:'논제 없음'}};
    const 점검=[...c.실체들.filter(x=>!p.thesis.includes(x)).map(x=>`실체 「${x}」가 논제에 그대로 남지 않음`),
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
  }));
  res.json({model:r.msg.model,usage:r.msg.usage,비교불가:!!관계.비교불가,추가논제});
});

app.get('/dashboard',(req,res)=>res.sendFile(path.join(__dirname,'hmos_dashboard.html')));

// nginx(https://hmos.hunminos.com)만 닿게 — 3000번을 밖에 열지 않는다 (2026-10-13)
app.listen(PORT,'127.0.0.1',()=>console.log('HMOS 127.0.0.1:'+PORT));

