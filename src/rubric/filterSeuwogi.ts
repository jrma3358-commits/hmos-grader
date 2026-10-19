// 인문논술 세우기 필터 (오종래 2026-10-19) — 엔진 ② 세우기(연결 단락의 문장)가 급소 수보다 많으면
// 루브릭 생성(8단계) 직전에 Claude가 급소와 직접 인과로 이어진 문장만 급소 수만큼 고른다.
// 필터가 실패해도 루브릭 생성은 막지 않는다 — 앞에서 급소 수만큼 남긴다 (slice 안전장치)
import Anthropic from '@anthropic-ai/sdk';

export type 세우기항목 = { entity: string; source: string; text: string };
type 메시지클라이언트 = Pick<Anthropic, 'messages'>;

// 서버의 다른 Claude 호출과 같은 모델 (deploy/server.js MODEL)
const MODEL = 'claude-sonnet-5-5';
let 기본클라이언트: Anthropic | null = null;

/** 고른 결과와 고른 방법 — 'Claude' · '그대로'(수리 또는 이미 급소 수 이하) · '앞에서 N개'(필터 실패) */
export async function filterSeuwogiDetailed(
  seuwogi: 세우기항목[],
  pivot: { keyword: string },
  pivotCount: number,
  questionType: 'humanities' | 'science',
  client: 메시지클라이언트 = (기본클라이언트 ??= new Anthropic()),
): Promise<{ 결과: 세우기항목[]; 방법: string; 사유?: string }> {
  if (questionType === 'science' || seuwogi.length <= pivotCount) return { 결과: seuwogi, 방법: '그대로' };
  const 안전 = (사유: string) => ({ 결과: seuwogi.slice(0, pivotCount), 방법: `앞에서 ${pivotCount}개`, 사유 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `논술 문항 세우기 필터링.
급소: "${pivot.keyword}"
급소 개수: ${pivotCount}개

세우기 목록:
${seuwogi.map((s, i) => `${i}. [${s.source}] ${s.text}`).join('\n')}

규칙:
1. 급소와 직접 인과 연결된 문장만 남긴다
2. 배경·부연·예시·포퓰리즘 활용 문장 제거
3. 반드시 ${pivotCount}개만 선택
4. JSON 배열만 반환 예시: [0,2,4]
5. 설명 없이 JSON만`,
      }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';
    const indices: unknown = JSON.parse(text);
    if (!Array.isArray(indices)) return 안전(`배열이 아님: ${text}`);
    const 고른 = [...new Set(indices.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < seuwogi.length))].slice(0, pivotCount);
    if (!고른.length) return 안전(`고른 번호 없음: ${text}`);
    return { 결과: 고른.map((i) => seuwogi[i]), 방법: 'Claude' };
  } catch (e) {
    return 안전((e as Error).message);
  }
}

export async function filterSeuwogi(
  seuwogi: 세우기항목[],
  pivot: { keyword: string },
  pivotCount: number,
  questionType: 'humanities' | 'science',
  client?: 메시지클라이언트,
): Promise<세우기항목[]> {
  return (await filterSeuwogiDetailed(seuwogi, pivot, pivotCount, questionType, client)).결과;
}
