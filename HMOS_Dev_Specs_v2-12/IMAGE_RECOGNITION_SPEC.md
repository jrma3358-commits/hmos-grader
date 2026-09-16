# HMOS 손글씨 이미지 인식 설계 스펙
# IMAGE_RECOGNITION_SPEC.md
# Claude Code 개발용 — 2026 오종래

---

## 이 문서의 위치

CLAUDE.md (채점기 전체 스펙)의 **전처리 단계**다.
학생 답안 이미지가 들어오면 이 파이프라인을 통과한 뒤
PHASE B (AI 채점 실행)로 넘어간다.

```
[학생 답안 이미지]
        │
        ▼
┌───────────────────────┐
│  IMAGE PIPELINE       │  ← 이 문서의 범위
│  이미지 → 텍스트      │
└───────────────────────┘
        │ recognized_text + confidence_map
        ▼
┌───────────────────────┐
│  PHASE A : HMOS       │  ← CLAUDE.md
│  루브릭 추출          │
└───────────────────────┘
        │
        ▼
┌───────────────────────┐
│  PHASE B : AI 채점    │
└───────────────────────┘
```

---

## 1. 핵심 원칙

```
원칙 1: 유물복원 기법
  깨진 부분을 전후 맥락으로 읽는다.
  형태(이미지)만으로 모르는 것을
  문법·도메인·루브릭이 채운다.

원칙 2: 층위 분리
  명확히 읽힌 것 ≠ 맥락으로 추정한 것
  두 가지를 절대 섞지 않는다.
  추정값은 반드시 플래그를 달아 교사에게 넘긴다.

원칙 3: 과잉 해독 금지
  시스템이 쓰지 않은 것을 채워 넣으면
  채점이 아니라 조작이 된다.
  모르면 모른다고 표시하고 교사에게 넘긴다.
```

---

## 2. 데이터 스키마

### 2.1 입력

```typescript
interface ImageInput {
  image: string;              // base64 인코딩 이미지
  image_type: "jpg" | "png" | "webp" | "heic";
  question_id: string;        // 어느 문제의 답안인가
  rubric_package: RubricPackage;  // PHASE A 출력 (맥락 필터용)
  student_id: string;
}
```

### 2.2 인식 결과

```typescript
interface RecognizedAnswer {
  student_id: string;
  question_id: string;

  // 핵심 출력
  full_text: string;          // 최종 인식 텍스트 (추정 포함)
  clean_text: string;         // 명확히 읽힌 것만

  // 토큰별 신뢰도 맵
  tokens: RecognizedToken[];

  // 교사 확인 요청 목록
  teacher_flags: TeacherFlag[];

  // 전체 인식 신뢰도
  overall_confidence: "high" | "medium" | "low";
  confidence_score: number;   // 0.0 ~ 1.0
}

interface RecognizedToken {
  text: string;               // 인식된 텍스트
  position: number;           // 전체 텍스트에서의 위치
  confidence: number;         // 0.0 ~ 1.0
  method: "clear" | "context" | "domain" | "rubric";
  // clear   = 이미지에서 명확히 읽힘
  // context = 앞뒤 문법 맥락으로 추정
  // domain  = 교과 도메인 지식으로 추정
  // rubric  = 루브릭의 실체(K·C·P)에서 예상 단어로 추정
  alternatives?: string[];    // 다른 후보들
}

interface TeacherFlag {
  position: number;           // 텍스트 위치
  original_image_region: string;  // 해당 이미지 영역 좌표
  recognized_as: string;      // 시스템이 읽은 것
  confidence: number;
  reason: string;             // 왜 플래그를 달았는가
  alternatives: string[];     // 다른 가능성들
}
```

---

## 3. 인식 파이프라인 — 3패스 구조

```
[이미지 입력]
      │
      ▼
┌──────────────┐
│  PASS 1      │  형태 독해
│  이미지 직독  │  Claude Vision으로 명확한 글자만 읽음
└──────────────┘
      │ clear_tokens (confidence > 0.85)
      ▼
┌──────────────┐
│  PASS 2      │  맥락 복원
│  문법 필터   │  한국어 조사·어미 구조로 모호한 부분 추정
└──────────────┘
      │ context_tokens
      ▼
┌──────────────┐
│  PASS 3      │  도메인·루브릭 필터
│  HMOS 필터   │  루브릭의 M,C,R,K로 최종 후보 좁힘
└──────────────┘
      │ final_tokens
      ▼
┌──────────────┐
│  신뢰도 판정 │  토큰별 method + confidence 확정
│  플래그 생성 │  교사 확인 목록 생성
└──────────────┘
      │ RecognizedAnswer
      ▼
[PHASE B로 전달]
```

---

## 4. PASS 1 — 이미지 직독 시스템 프롬프트

```
SYSTEM:
당신은 학생 손글씨 답안을 읽는 이미지 인식기입니다.

이 단계에서 할 일:
1. 이미지에서 글자를 읽습니다
2. 명확히 읽히는 것만 high confidence로 표시합니다
3. 흐리거나 모호한 부분은 읽은 것을 표시하되 low confidence로 표시합니다
4. 절대로 추측해서 채우지 않습니다 — 모르면 [UNCLEAR]로 표시합니다

수식 처리:
- 분수는 [FRAC: 분자/분모] 형식
- 지수는 [POW: 밑^지수] 형식
- 팩토리얼은 [FACT: n] 형식
- 루트는 [SQRT: 내용] 형식

출력 형식 (JSON):
{
  "raw_tokens": [
    {
      "text": "읽은 텍스트",
      "confidence": 0.0~1.0,
      "is_math": true/false,
      "unclear_region": true/false
    }
  ],
  "image_quality": "good" | "acceptable" | "poor",
  "handwriting_style": "print" | "cursive" | "mixed"
}
```

---

## 5. PASS 2 — 문법 맥락 복원 시스템 프롬프트

```
SYSTEM:
당신은 한국어 문법 맥락으로 손글씨 인식의 모호한 부분을 복원합니다.

입력: PASS 1의 토큰 목록 ([UNCLEAR] 포함)
목표: 한국어 조사·어미 구조로 [UNCLEAR] 부분의 후보를 좁힘

적용 규칙:
1. [UNCLEAR] 앞뒤 토큰의 문법적 역할을 분석합니다
2. 가능한 후보 목록을 생성합니다
3. 확률이 가장 높은 것을 추정값으로 설정합니다
4. method는 반드시 "context"로 표시합니다

한국어 맥락 필터 예시:
- "경우의 [UNCLEAR]" → "수" (확률 0.97)
- "서술하[UNCLEAR]오" → "시" (확률 0.95)
- "위정[UNCLEAR]사" → "척" (확률 0.90)
- "∴ [UNCLEAR] = 72" → 계산 결과값

수식 맥락 필터:
- "[FACT: 4] = [UNCLEAR]" → "24" (4!=24)
- "[UNCLEAR] + 24 = 72" → "48" (72-24=48)

확신할 수 없는 경우:
- confidence < 0.85이면 [UNCLEAR] 유지
- alternatives에 후보 목록 남김
- teacher_flag 생성

출력: PASS 1 토큰에 context 추정값 병합
```

---

## 6. PASS 3 — HMOS 루브릭 필터 시스템 프롬프트

```
SYSTEM:
당신은 HMOS 루브릭을 이용해 손글씨 인식의 마지막 모호한 부분을 
확정합니다.

입력:
- PASS 2 토큰 목록 (여전히 [UNCLEAR] 있을 수 있음)
- RubricPackage (M, C, R, K 포함)

작동 원리:
루브릭의 실체(K=급소 B·조건 C·무대 P)가 학생 풀이에 나올 수 있는 표현의 범위를 정의합니다.
이 범위 안에서 [UNCLEAR]의 후보를 좁힙니다.

예시:
K = "a가 2개다, (a,a)가 존재한다 (B₂)"
C = "양 끝에 모음"
B = "모음 a,a,e"

[UNCLEAR] 자리에 올 수 있는 후보:
- "(a, [UNCLEAR])" → "e" 또는 "a" (루브릭에서 양 끝 조합으로)
- "[UNCLEAR]! = 24" → "4" (4!=24)
- "3 x [UNCLEAR]! = 72" → "4" (4!=24이고 3×24=72)

주의:
- 루브릭에 없는 내용을 채워 넣지 않습니다
- method는 반드시 "rubric"으로 표시합니다
- 루브릭으로도 확정 불가면 [UNCLEAR] 유지

출력: 최종 RecognizedAnswer 생성
```

---

## 7. 신뢰도 판정 기준

```typescript
const CONFIDENCE_RULES = {
  // 교사 플래그 생성 기준
  FLAG_THRESHOLD: 0.85,

  // 채점에 사용 가능한 최소 신뢰도
  USABLE_THRESHOLD: 0.85,

  // 전체 답안 신뢰도 등급
  overall: (tokens: RecognizedToken[]): "high" | "medium" | "low" => {
    const unclear_ratio = tokens.filter(t => t.confidence < 0.85).length / tokens.length;
    if (unclear_ratio < 0.05) return "high";    // 5% 미만 불명확
    if (unclear_ratio < 0.15) return "medium";  // 15% 미만 불명확
    return "low";                                // 15% 이상 → 교사 직접 확인 권고
  }
};
```

### 신뢰도별 처리 방침

| 신뢰도 | 처리 | PHASE B 전달 |
|--------|------|-------------|
| ≥ 0.95 (clear) | 그대로 채점 | ✅ 바로 사용 |
| 0.85~0.95 (context) | 추정값으로 채점 | ✅ method 표시 |
| < 0.85 (domain/rubric/unclear) | 추정값 + 플래그 | ⚠️ 교사 확인 필수 후 채점 |

---

## 8. 교사 확인 요청 (TeacherFlag) 생성 규칙

```
플래그를 달아야 하는 경우:
1. confidence < 0.85인 토큰이 있을 때
2. 수식의 핵심 숫자가 불명확할 때 (배점에 직결)
3. 축1(개념) 판정에 영향을 줄 단어가 불명확할 때
4. alternatives가 2개 이상이고 채점 결과가 달라질 때

플래그 형식:
{
  "position": 15,
  "recognized_as": "a",
  "confidence": 0.65,
  "reason": "글자가 흐려 a와 e를 구분하기 어렵습니다",
  "alternatives": ["a", "e"],
  "impact": "axis_1",    ← 어느 축 채점에 영향을 주는가
  "teacher_action": "이 글자가 무엇인지 확인 후 채점을 확정해 주세요"
}
```

---

## 9. 전체 프롬프트 — PASS 1,2,3 통합 실행

Claude Code 구현 시 세 패스를 연속 API 호출로 실행한다.

```typescript
async function recognizeHandwriting(input: ImageInput): Promise<RecognizedAnswer> {

  // PASS 1: 이미지 직독
  const pass1 = await callClaude({
    system: PASS1_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", data: input.image } },
        { type: "text", text: "이 학생 답안을 읽어주세요." }
      ]
    }]
  });

  // PASS 2: 문법 맥락 복원
  const pass2 = await callClaude({
    system: PASS2_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `PASS 1 결과:\n${JSON.stringify(pass1)}\n\n한국어 문법 맥락으로 [UNCLEAR] 부분을 복원해주세요.`
    }]
  });

  // PASS 3: HMOS 루브릭 필터
  const pass3 = await callClaude({
    system: PASS3_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `PASS 2 결과:\n${JSON.stringify(pass2)}\n\n루브릭:\n${JSON.stringify(input.rubric_package)}\n\n최종 인식 결과를 확정해주세요.`
    }]
  });

  return buildRecognizedAnswer(pass1, pass2, pass3, input);
}
```

---

## 10. 결과 출력 — 교사 화면

```
【손글씨 인식 결과】

인식 신뢰도: HIGH (98.2%)

인식 텍스트:
"(a,e), (e,a) → 4! = 24
 ∴ 24 + 24 = 48 (가지)"

토큰별 상태:
✅ "(a,e), (e,a)"    clear    0.97
✅ "→ 4! = 24"       clear    0.99
✅ "∴ 24 + 24 = 48"  clear    0.95
✅ "(가지)"           context  0.88

⚠️ 교사 확인 사항: 없음

→ PHASE B 채점으로 전달
```

```
【손글씨 인식 결과】

인식 신뢰도: MEDIUM (82.1%)

인식 텍스트:
"(a,[UNCLEAR]), ([UNCLEAR],a) → 4! = 24
 ∴ 24 + 24 = [UNCLEAR] (가지)"

⚠️ 교사 확인 필요 (3곳)

① 위치 3 — "(a, ___)"
   인식값: "e" (추정, 0.68)
   대안: "e" / "a"
   영향: 축1 (급소 인식) 채점에 직결
   → 교사 확인 후 채점 진행

② 위치 12 — "(___,a)"
   인식값: "e" (추정, 0.71)
   대안: "e" / "a"

③ 위치 20 — "∴ 24+24=___"
   인식값: "48" (맥락 추정, 0.82)
   → 계산상 48이 맞으나 신뢰도 0.85 미만 — 교사 확인 필수
```

---

## 11. 특수 케이스 처리

### 11.1 수식이 이미지로 그려진 경우

```
그래프, 다이어그램, 도형이 포함된 경우:
→ 텍스트 외 이미지 요소를 [FIGURE: 설명] 태그로 처리
→ PHASE B에 "그래프를 그렸음" 정보를 전달
→ 교사가 그래프 적절성을 직접 판단
```

### 11.2 지운 흔적이 있는 경우

```
수정 흔적 감지 시:
→ [CORRECTED: 원래 → 수정] 태그로 표시
→ 최종 답안은 수정된 것으로 처리
→ 교사 확인 플래그 생성
```

### 11.3 이미지 품질이 낮은 경우

```
overall_confidence = "low" 이면:
→ PHASE B 채점 보류
→ 교사에게 전체 재판독 요청
→ "이미지 품질이 낮아 자동 인식이 어렵습니다" 메시지
```

---

## 12. 파일 구조

```
hmos-grader/
├── CLAUDE.md                    ← 채점기 전체 스펙
├── IMAGE_RECOGNITION_SPEC.md    ← 이 파일
├── src/
│   ├── image/
│   │   ├── pass1_vision.ts      ← 이미지 직독
│   │   ├── pass2_grammar.ts     ← 문법 맥락 복원
│   │   ├── pass3_rubric.ts      ← HMOS 루브릭 필터
│   │   ├── confidence.ts        ← 신뢰도 판정
│   │   ├── teacher_flag.ts      ← 교사 확인 요청 생성
│   │   └── image_pipeline.ts    ← 전체 파이프라인 조합
│   ├── phase_a.ts
│   ├── phase_b.ts
│   └── phase_c.ts
└── tests/
    └── image/
        ├── clear_handwriting.test.ts    ← 명확한 손글씨
        ├── unclear_handwriting.test.ts  ← 흐린 손글씨
        └── math_formula.test.ts         ← 수식 포함 답안
```

---

## 13. 개발 순서

```
Step 1: pass1_vision.ts
  - Claude Vision으로 이미지 직독
  - [UNCLEAR] 태그 생성
  - 테스트: 명확한 손글씨 이미지 5장

Step 2: pass2_grammar.ts
  - 한국어 문법 맥락 복원
  - confidence 계산
  - 테스트: [UNCLEAR] 포함 PASS 1 출력

Step 3: pass3_rubric.ts
  - 루브릭 패키지를 컨텍스트로 추가
  - 도메인·루브릭 필터 적용
  - 테스트: 동일 이미지에서 루브릭 유무 비교

Step 4: teacher_flag.ts
  - 신뢰도 < 0.70 토큰 자동 감지
  - 플래그 생성 및 교사 화면 출력
  - 테스트: 흐린 글씨 이미지

Step 5: image_pipeline.ts
  - 3패스 통합 실행
  - RecognizedAnswer 최종 생성
  - PHASE B 연결 테스트
```

---

*이 문서는 CLAUDE.md의 전처리 스펙이다.*
*손글씨 인식의 핵심: 형태만으로 모르는 것을 맥락이 채운다.*
*단, 채운 것은 추정임을 투명하게 남긴다.*
*신뢰도 기준: 0.85 미만은 전부 교사 확인 필수.*
