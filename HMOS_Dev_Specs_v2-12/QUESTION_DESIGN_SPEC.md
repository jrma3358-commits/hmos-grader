# HMOS 문제 설계 검증 스펙
# QUESTION_DESIGN_SPEC.md
# CLAUDE.md의 전단계 모듈 — 2026 오종래

---

## 이 문서의 위치

채점기(CLAUDE.md)가 시작되기 전,
문제 자체가 공정한가를 검증하는 단계다.

```
[출제자: 제시문·자료 설계]
          │
          ▼
┌─────────────────────────┐
│  QUESTION DESIGN        │  ← 이 문서의 범위
│  문제 설계 검증          │
│  무게중심 → 주문제       │
│  대안문제 → 비교 확정    │
└─────────────────────────┘
          │ 검증된 문제
          ▼
┌─────────────────────────┐
│  PHASE A : f(Q)         │  ← CLAUDE.md
│  루브릭 추출             │
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│  PHASE B : 채점 실행    │
└─────────────────────────┘
```

---

## 1. 왜 문제 설계 검증이 채점보다 먼저인가

```
채점의 공정성은 채점 기준이 아니라
문제의 객관성과 실체에서 먼저 결정된다.

제시문이 편향됐으면 → 루브릭이 흔들린다
논제가 모호하면    → 급소(K)가 여러 개가 된다
자료가 복수 해석을 허용하면 → 모범답안이 불안정하다

아무리 정교한 루브릭도
문제의 무게중심이 흔들리면
그 위에서 공정한 채점이 나오지 않는다.

그래서 채점기 앞에 문제 검증기가 있어야 한다.
```

---

## 2. 전체 흐름

```
출제자: 제시문·자료 설계
          │
          ▼
[D-1] 무게중심 추출
  이 제시문·자료가 말하는 핵심이 무엇인가
          │
          ▼
[D-2] 논제·문제 추출
  무게중심에서 출제자가 확인하려는 것 도출
          │
          ▼
[D-3] 주문제 설계 초안
          │
          ▼
[D-4] 대안문제 설계
  같은 무게중심에서 다르게 물을 수 있는가
          │
          ▼
◆ [D-5] 비교 검토
  주문제와 대안문제를 나란히 놓고 검토
  공통 K(급소)가 무엇인가
  어느 문제가 더 명확한가
          │
      YES — 문제 확정    NO — D-2 복귀
          │
          ▼
[D-6] 문제 객관성 최종 검증
          │
          ▼
f(Q) → 루브릭 추출 → 채점
```

---

## 3. 데이터 스키마

```typescript
interface QuestionDesignPackage {
  // 제시문·자료
  source_material: {
    content: string;          // 제시문 또는 자료 원문
    type: "text" | "graph" | "table" | "mixed";
    weight_center: string;    // 이 자료의 무게중심 (D-1 출력)
  };

  // 주문제
  primary_question: {
    text: string;
    extracted_from: string;   // 무게중심의 어느 부분에서 나왔는가
    question_type: QuestionType;  // TYPE 1/2/3
  };

  // 대안문제들
  alternative_questions: {
    text: string;
    difference_from_primary: string;  // 주문제와 어떻게 다른가
    shared_K: string;                 // 주문제와 공유하는 급소
  }[];

  // 비교 검토 결과
  comparison_result: {
    final_question: string;           // 확정된 문제
    confirmed_K: string;              // 비교로 확인된 진짜 급소
    rejected_alternatives: string[];  // 탈락 이유
    objectivity_score: "clear" | "acceptable" | "ambiguous";
  };
}
```

---

## 4. D-1 — 무게중심 추출 시스템 프롬프트

```
SYSTEM:
당신은 서논술형 문제의 제시문·자료에서
무게중심을 추출하는 분석기입니다.

무게중심이란:
이 제시문·자료가 전달하는 핵심 논리 또는 사실의 중심.
학생이 반드시 파악해야 하는 하나의 핵심 지점.

추출 방법:
1. 제시문 전체를 읽는다
2. 핵심 논리·사실이 집중된 지점을 찾는다
3. "이것을 모르면 이 제시문을 이해했다고 할 수 없다"
   는 지점이 무게중심이다

TYPE별 무게중심:
- TYPE 2 (제시문 논술): 글의 핵심 주장 또는 사건의 핵심 의미
- TYPE 3 (자료 해석): 자료에서 읽히는 핵심 패턴 또는 인과관계

검증 질문:
- 이 무게중심에서 논제를 만들 수 있는가?
- 무게중심이 제시문의 중반부 이후에 있는가?
  (너무 초반이면 제시문이 낭비적으로 길다)
- 무게중심이 하나인가?
  (둘 이상이면 제시문 설계 재검토)

출력 (JSON):
{
  "weight_center": "무게중심 설명",
  "evidence": "제시문 어느 부분에서 읽히는가",
  "is_single": true/false,
  "design_feedback": "제시문 설계에 대한 피드백"
}
```

---

## 5. D-2·3 — 논제·주문제 추출 시스템 프롬프트

```
SYSTEM:
당신은 무게중심에서 서논술형 논제·문제를 추출합니다.

입력:
- 제시문·자료
- 무게중심 (D-1 출력)
- 문제 유형 (TYPE 1/2/3)

추출 원칙:
1. 논제·문제는 무게중심에서 직접 나와야 한다
   주변부를 묻는 문제는 탈락
2. 하나의 급소(K)가 명확히 보여야 한다
   K가 여럿이면 문제를 분리하거나 논제를 좁힌다
3. 조건(C)은 구체적이어야 한다
   "설명하시오"만 있으면 부족
   "인명·저서명을 포함하여", "수치를 근거로" 등 명시
4. 요구(R)가 학생에게 명확히 전달되는가
   "논하시오"인지 "설명하시오"인지가 논증 구조를 결정

출력:
{
  "question_text": "완성된 문제 문장",
  "identified_K": "이 문제의 급소",
  "conditions": ["조건1", "조건2"],
  "requirement_verb": "요구 동사",
  "clarity_check": "명확한가 / 어느 부분이 모호한가"
}
```

---

## 6. D-4 — 대안문제 설계 시스템 프롬프트

```
SYSTEM:
당신은 같은 제시문·자료에서
주문제와 다른 대안문제를 설계합니다.

목적:
대안문제를 설계해봄으로써
① 주문제의 무게중심이 실제로 명확한지 확인
② 공통 급소(K)를 검증
③ 어느 문제가 더 객관적인지 비교

대안문제 설계 방향:
- 같은 무게중심, 다른 각도로 묻기
- 조건(C)을 다르게 설정
- 요구 동사(R)를 바꾸기
  (예: "논하시오" → "비교하시오" → "설명하시오")

검증 기준:
- 대안문제가 잘 나오면 → 무게중심이 명확
- 대안문제가 잘 안 나오면 → 제시문 또는 논제 재검토

출력:
[
  {
    "question_text": "대안문제 1",
    "difference": "주문제와 어떻게 다른가",
    "shared_K": "주문제와 공유하는 급소",
    "advantage": "이 문제의 장점",
    "disadvantage": "이 문제의 단점"
  }
]
```

---

## 7. D-5·6 — 비교 검토 및 최종 검증

### 7.1 비교 검토 기준

```
주문제와 대안문제를 나란히 놓고 묻는 것:

① 공통 K가 하나인가?
   → 두 문제에서 같은 급소가 나오면 무게중심 확정

② 어느 문제가 학생에게 더 명확한가?
   → 조건(C)이 구체적인 쪽

③ 어느 문제가 다경로를 더 자연스럽게 허용하는가?
   → 창의적 사고를 더 끌어내는 쪽

④ 어느 문제가 채점 기준을 더 명확하게 만드는가?
   → 루브릭이 더 단단하게 나오는 쪽
```

### 7.2 문제 객관성 최종 검증

```
CLEAR (출제 가능):
  - 무게중심이 하나
  - K가 하나
  - 조건이 구체적
  - 루브릭이 명확하게 나옴
  - 대안문제가 2개 이상 쉽게 나옴

ACCEPTABLE (조건부 출제 가능):
  - 무게중심은 있는데 K가 약간 모호
  - 조건을 추가하면 해결 가능
  - → 조건 보완 후 재검토

AMBIGUOUS (출제 보류):
  - 무게중심이 둘 이상
  - K가 여럿
  - 대안문제가 안 나옴
  - → 제시문 재설계 또는 문제 분리
```

---

## 8. 실례 — 역사 서술형 3 검증

### 제시문 무게중심 추출 (D-1)

```
제시문: 위정척사 운동 상소문
        (이만손의 영남 만인소)

무게중심:
"황준헌의 조선책략이 주장하는
 원교(미국)·근린(일본) 정책을 비판하는 것"

근거: 제시문 후반부
"(가)남의 이간을 듣고 원교를 핑계로 근린을 배척"

is_single: true ✓
```

### 주문제와 대안문제 비교 (D-4·5)

```
주문제:
"(1) 사상을 쓰고 20자 이내로 설명하시오
 (2) (가)에 대해 인명·저서명·나라 이름 포함하여 설명하시오"

대안문제 A:
"이 상소가 비판하는 외교 정책의 이름과
 그 주창자 및 내용을 설명하시오"

대안문제 B:
"위정척사 운동의 관점에서
 당시 조선이 취해야 할 외교 방향을 논하시오"

비교 결과:
공통 K → "황준헌의 조선책략 = (가)의 실체"
주문제가 채택된 이유:
  → 조건이 가장 구체적 (인명·저서명·나라 이름)
  → 루브릭이 가장 명확하게 나옴
  → 대안A는 K가 약하고, 대안B는 범위가 너무 넓음

objectivity_score: CLEAR ✓
```

---

## 9. 서논술형 완성의 사슬

```
이것이 서논술형이 공정해지는 전체 경로다.

[제시문·자료 설계]          ← 출제자
          │
          ▼
[무게중심 추출]              ← HMOS 문제 분석
          │
          ▼
[주문제 + 대안문제 설계]     ← 출제자 + HMOS 보조
          │
          ▼
[비교 검토 → 문제 확정]      ← 출제자 최종 결정
          │
          ▼
[f(Q) → 루브릭 추출]         ← HMOS PHASE A
          │
          ▼
[모범답안 설정]               ← 출제자 확인
          │
          ▼
[채점 실행]                   ← HMOS PHASE B + AI
          │
          ▼
[가시화]                      ← PHASE C
          │
          ▼
[교사 최종 확정]              ← 교사

이 사슬의 어느 한 고리가 끊기면
공정성의 사슬 전체가 끊긴다.
```

---

## 10. HMOS가 채움AI와 근본적으로 다른 지점

```
채움AI:
  채점기다.
  문제를 받아서 채점한다.
  문제가 나쁘면 나쁜 채점이 나온다.

HMOS:
  출제부터 채점까지
  공정성의 사슬 전체를 설계한 시스템이다.

  문제 설계 검증 (이 문서)
  + 유형별 질문 인식 (QUESTION_TYPE_SPEC)
  + 채점 실행 (CLAUDE.md)
  + 손글씨 인식 (IMAGE_RECOGNITION_SPEC)

  = 빛이 모든 곳에 닿는 채점 시스템

채점기만 있으면 반쪽이다.
문제가 나쁘면 채점기가 아무리 좋아도 소용없다.
```

---

## 11. Claude Code 구현 지시

```typescript
// 출제자가 제시문을 입력하면
// 채점 전에 문제 설계 검증을 먼저 실행

async function validateQuestionDesign(
  sourceMaterial: string,
  questionType: QuestionType,
  primaryQuestion: string
): Promise<QuestionDesignPackage> {

  // D-1: 무게중심 추출
  const weightCenter = await extractWeightCenter(sourceMaterial, questionType);

  // D-2,3: 주문제 검증
  const questionAnalysis = await analyzeQuestion(
    primaryQuestion, weightCenter, questionType
  );

  // D-4: 대안문제 설계
  const alternatives = await designAlternatives(
    sourceMaterial, weightCenter, primaryQuestion
  );

  // D-5,6: 비교 검토 및 최종 검증
  const finalResult = await compareAndValidate(
    primaryQuestion, alternatives, weightCenter
  );

  // objectivity_score가 AMBIGUOUS이면
  // 채점 진행 전에 출제자에게 재설계 요청
  if (finalResult.objectivity_score === "ambiguous") {
    return {
      ...finalResult,
      proceed_to_grading: false,
      feedback: "문제 설계를 재검토해 주세요: " + finalResult.design_feedback
    };
  }

  return { ...finalResult, proceed_to_grading: true };
}
```

---

*출제에서 채점까지 — 공정성의 사슬 전체가 HMOS다.*
*채점기만 있으면 반쪽이다.*
*문제가 나쁘면 채점기가 아무리 좋아도 소용없다.*
*손전등의 빛은 출제 단계에서 이미 시작된다.*
