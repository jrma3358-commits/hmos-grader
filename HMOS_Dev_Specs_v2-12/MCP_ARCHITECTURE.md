# HMOS MCP 아키텍처 설계
# MCP_ARCHITECTURE.md
# Claude Code 개발용 — 2026 오종래

---

## 왜 MCP가 맞는가

```
HMOS 설계 원칙:
  네비게이션(HMOS) → 운전자(AI)

MCP 구조:
  MCP 서버(도구)  → MCP 클라이언트(Claude)

완벽히 같은 구조다.
HMOS 엔진 = MCP 서버
Claude     = MCP 클라이언트

그리고 이미 작동했다.
1차 구현 화면에서 확인:
  "HMOS MCP로 풀이 ID 13에 대해 #scan-..."
  "HMOS MCP로 풀이 ID 13에 대해 #grade-..."
  5단계 워크플로우 각 단계마다 MCP 호출 기록
```

---

## 현재 상태 — 반드시 먼저 확인

### 기존 HMOS MCP 서버

```
주소: https://hmos.hunminos.com/claude/hmos
이름: hmos-claude-mcp

기존 파이프라인 (1차 구현):
  analyze_input
  light_5color
  structure_7form
  matrix21
  verify

확인 방법:
  브라우저에서 https://hmos.hunminos.com/claude/hmos 접속
  또는 Claude Code에서:
    "hmos.hunminos.com MCP 서버에 연결을 시도하라.
     analyze_input 도구가 응답하는지 확인하라."

2026년 9월 현재 상태:
  □ 확인 전  → 개발 시작 전 반드시 확인
  □ 응답 있음 → 경로 A (기존 MCP 활용)
  □ 응답 없음 → 경로 B (새 MCP 구축)
```

---

## 경로 A — 기존 MCP가 살아있을 때 (빠름)

### 구조

```
Claude Code
      │
      ▼
기존 HMOS MCP (hunminos.com)
  analyze_input → light_5color → structure_7form
  → matrix21 → verify
      │
      ▼
새 Grader MCP 추가 (로컬)
  grade_one     PHASE B 채점
  get_feedback  피드백 생성
  save_result   교사 확정 + 저장
      │
      ▼
웹 UI
  5단계 워크플로우 + 채점 결과표
```

### 경로 A 개발 순서

```
1단계: 기존 MCP 연결 확인
  Claude Code: "analyze_input 도구로
  수학 순열 문제를 입력해서 응답을 확인하라"

2단계: 5색 추출 확인
  기존 light_5color가
  ENGINE_SPEC v3의 B,C,P,D,Q를 반환하는지 확인
  → 반환 형식이 다르면 변환 레이어 추가

3단계: 새 도구 추가
  grade_one / get_feedback / save_result
  로컬 MCP 서버로 추가

4단계: UI 연결
```

---

## 경로 B — 새 MCP 구축 (처음부터)

### 구조

```
Claude Code
      │
      ▼
새 HMOS MCP 서버 (로컬 구축)
  fq_five_colors   5색 추출 (ENGINE_SPEC v3)
  extract_rubric   루브릭 5축 도출
  grade_one        PHASE B 채점
  get_feedback     피드백 생성
  save_result      교사 확정 + 저장
      │
      ▼
웹 UI
  5단계 워크플로우 + 채점 결과표
```

### MCP 도구 명세

```typescript
// 도구 1: 5색 추출 (f(Q) 엔진 핵심)
tool: fq_five_colors
  description: "질문에서 출제자의 5색 시선을 추출한다"
  input: {
    question: string,           // 문제 원문
    source_material?: string,   // 제시문 (TYPE 2)
    question_type?: string      // 유형 힌트
  }
  output: {
    B: string,      // 초록: 대상·배경
    C: string,      // 파랑: 조건·제약
    P?: string,     // 보라: 상황·시각
    D?: string,     // 노랑: 정의·새규칙
    Q: string,      // 빨강: 질문·목적지
    Q_verb: string, // 요구 동사
    K: string,      // 급소
    K_color: string,// 어느 색에서
    detected_type: string
  }

// 도구 2: 루브릭 도출
tool: extract_rubric
  description: "5색에서 루브릭 5축과 모범답안을 추출한다"
  input: {
    five_colors: FiveColors,
    K: string,
    question_type: string
  }
  output: {
    rubric: RubricAxis[],
    model_paths: ModelAnswerPath[],
    weight_center: string
  }

// 도구 3: 채점 실행 (PHASE B)
tool: grade_one
  description: "루브릭으로 학생 답안을 대조한다"
  input: {
    rubric: RubricAxis[],
    student_answer: string,
    student_id: string,
    question_type: string
  }
  output: {
    axis_results: AxisResult[],
    total_score: number,
    max_score: number,
    error_type?: string,
    matched_path: string,
    feedback: string
  }

// 도구 4: 결과 저장 (교사 확정)
tool: save_result
  description: "교사 확정 후 결과를 저장한다"
  input: {
    student_id: string,
    question_id: string,
    scoring_result: ScoringResult,
    teacher_confirmed: boolean,
    teacher_final_score?: number,
    teacher_comment?: string
  }
  output: {
    saved: boolean,
    final_score: number,
    submission_state: "confirmed" | "needs_review",
    timestamp: string
  }
```

### 경로 B 개발 순서

```
1단계: MCP 서버 뼈대
  npm install @modelcontextprotocol/sdk
  server.ts 기본 구조

2단계: fq_five_colors 구현
  ENGINE_SPEC v3 STEP 1,2 구현
  검증: 수학/국어/자료 세 유형 테스트

3단계: extract_rubric 구현
  5색 → 루브릭 5축 자동 도출
  모범답안 궤적 추출

4단계: grade_one 구현
  CLAUDE.md PHASE B
  채점가이드 12번 판정 조건 적용

5단계: save_result 구현
  교사 확정 구조
  이력 저장

6단계: UI 연결
  REBUILD_CONTEXT.md 화면 기준으로
```

---

## MCP 서버 파일 구조

```
hmos-grader/
├── mcp-server/
│   ├── index.ts          ← MCP 서버 진입점
│   ├── tools/
│   │   ├── fq_five_colors.ts   ← 5색 추출
│   │   ├── extract_rubric.ts   ← 루브릭 도출
│   │   ├── grade_one.ts        ← 채점 실행
│   │   └── save_result.ts      ← 결과 저장
│   ├── prompts/
│   │   ├── five_colors.ts      ← 5색 읽기 시스템 프롬프트
│   │   ├── rubric.ts           ← 루브릭 도출 프롬프트
│   │   └── grading.ts          ← 채점 실행 프롬프트
│   └── schemas/
│       └── types.ts            ← TypeScript 타입 정의
├── web-ui/
│   ├── index.html        ← 채점 화면
│   └── app.js            ← UI 로직
└── claude_mcp_config.json ← MCP 연결 설정
```

---

## Claude Code MCP 연결 설정

```json
// claude_mcp_config.json
{
  "mcpServers": {
    "hmos-grader": {
      "command": "node",
      "args": ["mcp-server/index.js"],
      "description": "HMOS 채점기 MCP 서버"
    },
    "hmos-original": {
      "url": "https://hmos.hunminos.com/claude/hmos",
      "description": "기존 HMOS MCP (살아있을 때만)"
    }
  }
}
```

---

## Claude Code 첫 지시 순서

```
Step 1: 기존 MCP 상태 확인
"claude_mcp_config.json에
 hmos.hunminos.com을 설정하고
 연결을 시도하라.
 analyze_input 도구가 응답하는지 보고하라."

Step 2A (응답 있음 — 경로 A):
"기존 MCP의 light_5color 도구를 호출해서
 수학 순열 문제의 5색을 추출하라.
 ENGINE_SPEC v3의 B,C,P,D,Q 형식과
 비교해서 차이를 보고하라."

Step 2B (응답 없음 — 경로 B):
"mcp-server/index.ts를 만들어라.
 @modelcontextprotocol/sdk를 사용한다.
 첫 번째 도구: fq_five_colors
 ENGINE_SPEC v3의 시스템 프롬프트를 사용한다."

Step 3 (공통):
"grade_one 도구를 구현하고
 채점가이드_12번 문서의 판정 조건을 적용하라.
 REBUILD_CONTEXT.md의 5개 학생 답안으로
 테스트하라:
   풀이나 → 5점
   풀이8  → 3점
   풀이b  → 2점
   풀이9  → 1점
   풀이2  → 0점"
```

---

## 1차 구현 MCP 패턴 — 재현 기준

```
1차 구현에서 확인된 MCP 호출 패턴:

인식 단계:
  HMOS MCP로 풀이 ID {id}에 대해 #scan-...

채점 단계:
  HMOS MCP로 풀이 ID {id}에 대해 #grade-...

확정 단계:
  HMOS MCP로 풀이 ID {id}에 대해 #consult-...

→ 재개발 시 이 패턴을 기준으로
  submission_id 기반 상태 관리 구현
```

---

## 핵심 원칙 — MCP 설계에서 반드시 지킬 것

```
✓ HMOS 도구는 방향만 제공 (네비게이션)
  → 채점 결과를 직접 결정하지 않음
  → 루브릭과 판정 근거를 제공할 뿐

✓ Claude가 실행 (운전자)
  → MCP 도구의 출력을 받아 대조 판정

✓ 교사가 최종 확정
  → save_result는 teacher_confirmed 없이 저장 불가
  → 이것이 save_result 도구의 핵심 제약

✗ MCP 도구가 최종 점수를 결정하면 안 됨
✗ 교사 확인 없이 채점이 확정되면 안 됨
```

---

*MCP = 네비게이션과 운전자의 분리를 코드로 구현한 것*
*HMOS MCP가 방향을 주고 Claude가 달린다*
*교사가 목적지를 확정한다*
