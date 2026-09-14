# HMOS 채점기 — 개발 시작 가이드
# SETUP_AND_ROADMAP.md
# Claude Code로 POC 개발하기 — 2026 오종래

---

## 0. 시작 전 확인

```
이 가이드가 안내하는 것:
  컴퓨터 준비 → Claude Code 설치 →
  프로젝트 생성 → 개발 로드맵

예상 소요:
  설치 완료까지: 30분~1시간
  f(Q) 엔진 첫 동작: 1~2일
  교사 시연 POC 완성: 1주일
```

---

## 1단계: 컴퓨터 준비

### 1.1 운영체제 확인

```
Windows 10/11  → 이 가이드 그대로 따라하세요
Mac (M1/M2/Intel) → 터미널 앱 사용
```

### 1.2 Node.js 설치 (필수)

```
1. 브라우저에서 https://nodejs.org 접속
2. "LTS" 버전 다운로드 클릭 (왼쪽 버튼)
3. 설치 파일 실행 → 계속 Next 클릭

설치 확인:
  Windows: 시작 → "명령 프롬프트" 검색 → 열기
  Mac: Launchpad → 터미널

아래 명령어 입력:
  node --version

결과 예시: v20.11.0
이 숫자가 나오면 성공
```

### 1.3 Anthropic API 키 준비

```
1. https://console.anthropic.com 접속
2. 회원가입 또는 로그인
3. 좌측 메뉴 → "API Keys"
4. "Create Key" 클릭
5. 키 복사해서 메모장에 보관

형태 예시: sk-ant-api03-xxxxxxxxxxxx
```

---

## 2단계: Claude Code 설치

### 2.1 Claude Code 설치

```
명령 프롬프트(또는 터미널)에 입력:

  npm install -g @anthropic-ai/claude-code

설치 확인:
  claude --version

버전 숫자가 나오면 성공
```

### 2.2 API 키 연결

```
claude login

→ 브라우저가 열리면서 로그인 화면 나옴
→ Anthropic 계정으로 로그인
→ 또는 아래 방법으로 직접 키 입력:

  Windows:
    set ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx

  Mac:
    export ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
```

---

## 3단계: 프로젝트 폴더 만들기

### 3.1 폴더 생성

```
Windows 명령 프롬프트:
  cd Desktop
  mkdir hmos-grader
  cd hmos-grader

Mac 터미널:
  cd ~/Desktop
  mkdir hmos-grader
  cd hmos-grader
```

### 3.2 zip 파일 풀기

```
1. HMOS_Dev_Specs_v2.zip을 받은 폴더에서 찾기
2. hmos-grader 폴더로 복사
3. 압축 풀기 → 우클릭 → "압축 풀기"

또는 명령어로:
  Windows: 탐색기에서 직접 풀기
  Mac: double-click

결과 확인:
  hmos-grader/
    README.md
    ENGINE_SPEC.md
    CLAUDE.md
    QUESTION_TYPE_SPEC.md
    QUESTION_DESIGN_SPEC.md
    IMAGE_RECOGNITION_SPEC.md
    REBUILD_CONTEXT.md
    START_HERE.md
    HMOS_논문5_오류복원_TSR-1.md
    서술형채점_12_채점가이드_비개발자용.docx
    서논술형_연재_12회_전편-2.md
    HMOS_System_Paper.docx
```

### 3.3 기술백서 추가 (중요)

```
HMOS 기술백서 파일을 hmos-grader 폴더에 복사
파일명: HMOS_백서.md (또는 갖고 계신 파일)

이것이 엔진 구현의 핵심 컨텍스트입니다
```

### 3.4 Node.js 프로젝트 초기화

```
hmos-grader 폴더 안에서:

  npm init -y
  npm install typescript ts-node @types/node
  npm install @anthropic-ai/sdk
  npm install express @types/express

package.json 확인 — 파일이 생겼으면 성공
```

---

## 4단계: Claude Code 시작

### 4.1 Claude Code 실행

```
hmos-grader 폴더 안에서:

  claude

→ 채팅창이 열립니다
→ 이제 Claude Code와 대화하면서 개발합니다
```

### 4.2 첫 번째 지시 — 복사해서 붙여넣기

```
다음 텍스트를 Claude Code에 입력하세요:

"START_HERE.md와 README.md를 먼저 읽어라.
그 다음 ENGINE_SPEC.md를 읽고
f(Q) 엔진 구현을 시작하라.

기술백서(HMOS_백서.md)도 함께 참고하라.

첫 번째 목표:
  ENGINE_SPEC.md §8의 검증 테스트 4개를 통과시키는
  f(Q) 엔진 함수를 TypeScript로 구현하라.

파일 구조:
  src/engine/fq_engine.ts  ← 엔진 구현
  src/engine/schemas.ts    ← 타입 정의
  tests/engine.test.ts     ← 검증 테스트

시작하라."
```

---

## 5단계: 개발 로드맵

### WEEK 1 — f(Q) 엔진 (심장)

```
Day 1 (목표: 스키마 + 엔진 뼈대)
  Claude Code 지시:
    "ENGINE_SPEC.md의 섹션 2 스키마를
     schemas.ts로 구현하라.
     그 다음 엔진 함수 뼈대를 만들어라."

  완료 확인:
    EngineInput / EngineOutput 타입이 있다
    runEngine() 함수가 있다

Day 2 (목표: STEP 1 언어 읽기)
  Claude Code 지시:
    "ENGINE_SPEC.md PHASE 1을 구현하라.
     수학 순열 문제를 입력하면
     M, C, R, R_verb가 추출되어야 한다."

  테스트 문제:
    "a,a,b,c,d,e 카드를 나열할 때
     양 끝에 모음이 오는 경우의 수를 구하고
     풀이 과정을 서술하시오"

  완료 확인:
    M = "a,a,b,c,d,e — 모음 a,a,e, a가 중복"
    C = "양 끝에 모음"
    R = "경우의 수 + 풀이 과정"
    R_verb = "서술하시오"

Day 3 (목표: STEP 2 급소 추출)
  Claude Code 지시:
    "ENGINE_SPEC.md PHASE 2를 구현하라.
     같은 문제에서 K와 T가 나와야 한다."

  완료 확인:
    K = "a가 2개다"
    T = ["누락형", "순열혼용형", "독립사건형"]
    K_is_single = true

Day 4 (목표: 루브릭 4축 도출)
  Claude Code 지시:
    "PHASE 3, 4를 구현하라.
     K→축1, C→축2, R→축3, M→축4
     루브릭 4축이 나와야 한다."

Day 5 (목표: §8 검증 테스트 통과)
  Claude Code 지시:
    "ENGINE_SPEC.md §8의 테스트 4개를
     모두 통과시켜라.
     실패한 것이 있으면 수정하라."

  완료 기준:
    □ 재현성 테스트 10회 동일 K
    □ 유형 판별 3문제 정확
    □ K 단일성 판정 정확
    □ 복귀 루프 입구 출력 정확
```

### WEEK 2 — PHASE B 채점 실행

```
Day 1 (목표: PHASE B 기본 구조)
  Claude Code 지시:
    "CLAUDE.md PHASE B를 구현하라.
     엔진 출력(루브릭)을 받아서
     학생 답안을 대조하는 함수를 만들어라."

  완료 확인:
    scoreAnswer(rubric, studentAnswer) 함수
    AxisResult[] 출력

Day 2 (목표: 5개 학생 답안 채점)
  Claude Code 지시:
    "REBUILD_CONTEXT.md의 5개 학생 답안으로
     테스트하라:
     풀이나 → 5점
     풀이8  → 3점
     풀이b  → 2점
     풀이9  → 1점
     풀이2  → 0점
     이 결과가 나와야 한다."

Day 3 (목표: 피드백 생성)
  Claude Code 지시:
    "채점가이드_12번 섹션 11을 참고해서
     오류 유형별 피드백을 생성하라.
     잘한 점 먼저 → 빠진 것 → 다음 고칠 것"

Day 4~5 (목표: TYPE 2 논술 추가)
  Claude Code 지시:
    "QUESTION_TYPE_SPEC.md TYPE 2를 적용하라.
     국어 논술 문제에서 루브릭이 달라져야 한다:
     축4 없음, 축1+축2 비중 높음"
```

### WEEK 3 — UI + 교사 시연 화면

```
Day 1~2 (목표: 기본 웹 화면)
  Claude Code 지시:
    "REBUILD_CONTEXT.md의 화면 스크린샷을 참고해서
     Express + HTML로 기본 UI를 만들어라.

     필요한 화면:
     1. 문제 입력 화면
     2. 루브릭 표시 화면
     3. 학생 답안 입력 화면
     4. 채점 결과 화면 (축별 판정 + 피드백)"

Day 3 (목표: 5단계 워크플로우)
  Claude Code 지시:
    "REBUILD_CONTEXT.md 화면4의
     5단계 워크플로우 UI를 구현하라:
     인식대기 → 인식확인 → 채점대기 →
     채점확인 → 확정"

Day 4 (목표: 교사 시연 시나리오)
  시연할 것:
    1. 문제 입력 → 루브릭 자동 추출
    2. 수학: 풀이나(5점) vs 풀이2(0점)
    3. 국어: 고갱이(4.5) vs 늪휘(1.5) vs 도투마리(6.5)
    4. "같은 루브릭, 다른 점수" 설명

Day 5 (목표: 리허설)
  교사 앞에서 시연 순서:
    1. START_HERE.md 화면 보여주기
    2. 수학 문제 실시간 채점
    3. 국어 세 학생 비교
    4. "찬성이든 반대든 루브릭이 기준"
```

---

## 6단계: 자주 쓸 Claude Code 명령

### 막혔을 때

```
"방금 만든 코드에서 오류가 났다.
 오류 메시지: [오류 내용 붙여넣기]
 수정해라."
```

### 테스트할 때

```
"지금까지 만든 것을 실행해서
 수학 순열 문제를 채점해봐라.
 결과를 보여라."
```

### 저장할 때

```
"지금까지 만든 파일 목록을 보여라.
 실행 방법을 알려라."
```

### 다음 날 이어할 때

```
"어제 작업한 상태에서 계속한다.
 ENGINE_SPEC.md §8 테스트 중
 [몇 번째] 테스트까지 통과했고
 [다음 목표]를 해야 한다."
```

---

## 7단계: 문제 해결

### "command not found" 오류

```
Node.js가 설치되지 않았거나
경로가 설정되지 않은 것

→ Node.js 재설치
→ 컴퓨터 재시작 후 다시 시도
```

### "API key not found" 오류

```
Windows:
  set ANTHROPIC_API_KEY=sk-ant-...

Mac:
  export ANTHROPIC_API_KEY=sk-ant-...

→ Claude Code 재시작
```

### 코드가 실행되지 않을 때

```
Claude Code에 입력:
  "ts-node src/engine/fq_engine.ts 로
   실행하려는데 오류가 난다.
   [오류 내용]
   package.json과 tsconfig.json을
   확인하고 고쳐라."
```

### Claude Code가 느릴 때

```
한 번에 너무 많이 시키지 말 것
작은 단계로 나눠서 시킬 것

예: "Day 1 전체" → X
    "schemas.ts 만들기" → O
    "runEngine 뼈대" → O (다음 지시)
```

---

## 8단계: 폴더 최종 구조 (목표)

```
hmos-grader/
├── README.md             ← 항상 열어두기
├── START_HERE.md         ← 새 세션 시작할 때
├── ENGINE_SPEC.md        ← 엔진 개발 기준
├── CLAUDE.md             ← 채점기 전체 스펙
├── QUESTION_TYPE_SPEC.md
├── QUESTION_DESIGN_SPEC.md
├── IMAGE_RECOGNITION_SPEC.md
├── REBUILD_CONTEXT.md    ← 1차 구현 참고
├── 채점가이드_12번.docx  ← 판정 규칙
├── src/
│   ├── engine/
│   │   ├── schemas.ts    ← Day 1 완성
│   │   ├── fq_engine.ts  ← Day 2~4 완성
│   │   └── prompts.ts    ← 시스템 프롬프트
│   ├── grader/
│   │   ├── phase_b.ts    ← Week 2
│   │   └── phase_c.ts    ← Week 2
│   └── server.ts         ← Week 3
├── tests/
│   └── engine.test.ts    ← Day 5 통과
├── public/
│   └── index.html        ← Week 3 UI
└── package.json
```

---

## 9단계: 교사 시연 체크리스트

```
시연 전날 확인:
□ npm start 로 서버가 켜지는가
□ 수학 문제 입력 → 루브릭이 나오는가
□ 학생 답안 입력 → 점수가 나오는가
□ 국어 세 학생 시나리오가 작동하는가
□ "채점 확정" 버튼이 있는가

시연 순서:
1. "서논술형_연재_12회_전편-2.md" 1회 내용 한 줄 읽기
   "AI가 정답을 아는 것의 값을 지웠습니다"

2. 수학 문제 실시간 채점 (3분)
   → 루브릭 자동 추출 보여주기
   → 두 학생 점수 차이 보여주기

3. 국어 논술 세 학생 (5분)
   → 같은 문제, 같은 루브릭
   → 찬성 1.5점, 찬성 4.5점, 반대 6.5점
   → "논지가 아니라 논증 구조가 기준입니다"

4. 결과표 보여주기 (2분)
   → 학생 화면: 어디서 무엇을 놓쳤는가
   → 교사 화면: 왜 이 점수인가

시연 클로징:
"채점기만이 아닙니다.
 출제부터 채점까지
 공정성의 사슬 전체입니다."
```

---

*설치부터 시연까지. 시작하면 됩니다.*
*막히면 Claude Code에 오류 내용을 그대로 붙여넣으면 됩니다.*
