# deploy — 서버 판 (43.201.35.52 `~/hmos`)

서버에 올라가 있는 파일을 그대로 옮겨 둔 것이다. 저장소 최상위 `server.js`·`hmos_dashboard.html`과 다른 판이다.
서버의 `~/hmos`는 git 저장소가 아니다 — 파일을 직접 올린다 (scp).

## 서버 배치

```
~/hmos/                     ← pm2 앱 hmos (cwd), 정적 서빙 폴더
  server.js                 POST /analyze · /api/analyze · /api/generate · /api/refine · /api/propose
  analyze-runner.mts        /analyze 러너 — 엔진(hmos-grader/)을 부르기만 한다
  hmos_dashboard.html       /dashboard
  hmos-grader/              엔진 사본 (이 폴더에는 없음)
  .env                      ANTHROPIC_API_KEY (이 폴더에는 없음)
~/hmos-spec/
  HMOS_루브릭_구현명세-7.md  /api/generate 시스템 프롬프트 (F2~F6 원문) — 정적 서빙 밖에 둔다
  HMOS_논제생성_명세서-2.md  /api/refine 시스템 프롬프트 (§3 정교화 원문) — 부를 때 읽는다
  조립설명서.md              C·논술 9단계 조립설명서 (2026-10-13)
```

- pm2: `hmos`, interpreter args `--env-file=.env`, Node 24
- `package.json`이 `"type": "commonjs"`라서 `server.js`는 CommonJS다 (저장소 최상위는 ESM).

## /api/generate

- 탭 4의 「HMOS 이론 기반 제안 생성」 버튼을 교사가 눌렀을 때만 불린다.
- 입력: `{ 문항원문, 파이프라인, 계열, 논제?, 제시문?, 인식 }` — `인식`은 `/analyze` 응답의 `단계.인식.전체`.
- `계열`(`수리`·`인문사회국어`)은 교사가 탭 4에서 고른다. 미리 골라 두지 않고, 없으면 400.
- 모델 `claude-sonnet-5-5`, 구조화 출력, 거절 시 서버 측 fallback (`fallbacks: 'default'`).
- 배점은 모델이 아니라 서버가 명세 F5 파트 지수 2:3:2:2:1로 계산한다.

## C·논술 9단계 (조립설명서 `~/hmos-spec/조립설명서.md`)

HMOS 절대 원칙 (오종래 2026-10-13): 인식·제시문 급소 추출·연결 대조는 엔진이 한다. AI는 엔진이 잡은 결과를 문장으로 구성할 뿐, 엔진이 못 잡은 것을 채우지 않는다.

| 단계 | 호출 | 담당 |
|---|---|---|
| 2 논제 인식 | `POST /analyze` `{파이프라인:'C', 논제, 제시문?}` → `단계.인식.소문항` | 엔진 (`src/thesis/split.ts` 소문항마다, 공통 발문 분리) |
| 3·4 제시문 급소·연결·사족 | 같은 `/analyze` 응답 → `단계.정합` `{연결, 사족, 소문항}` | 엔진 (`connectPassage` 단락 급소 → `src/thesis/align.ts`) |
| 5 정교화 | 진단 = `단계.정교화.진단` [봉인⑬] · 정교화안 = `POST /api/refine` `{논제, 소문항, 진단, 제시문?}` | 엔진 진단 · Claude 문장 (명세서-2 §3 원문) → 러너로 재인식 |
| 6 추가 논제 | `POST /api/propose` `{논제, 소문항, 제시문?, 정합?}` | Claude 문장 (명세서-2 §1·§4·§5 원문), 엔진 연결 안에서만 |
| 7 교사 확정 | 확정 논제마다 `POST /analyze` 로 재인식 | 교사 · 엔진 |
| 8·9 루브릭·모범답안 | `POST /api/generate` | Claude (루브릭 구현명세 F2~F6) |

- 사족 (오종래 2026-10-13) = 논제 급소가 제시문 어느 단락 급소와도 연결되지 않은 것 (단락 단위).
- 연관성 강약 판정은 엔진 몫이다 — 아직 규칙이 없다.
- C는 1차 필터를 타지 않는다.
- ④사족은 정교화안을 만들지 않는다 (`/api/refine` 응답의 `사족`으로 그대로).
- 명세 md는 부를 때 읽는다 — 없으면 그 라우트만 500.

## 배포

```
scp -i <키> deploy/server.js deploy/hmos_dashboard.html admin@43.201.35.52:hmos/
ssh -i <키> admin@43.201.35.52 'pm2 restart hmos'
```

바꾸기 전 서버에서 `파일.bak-YYYYMMDD`로 백업을 남긴다.
