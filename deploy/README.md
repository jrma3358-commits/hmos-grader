# deploy — 서버 판 (43.201.35.52 `~/hmos`)

서버에 올라가 있는 파일을 그대로 옮겨 둔 것이다. 저장소 최상위 `server.js`·`hmos_dashboard.html`과 다른 판이다.
서버의 `~/hmos`는 git 저장소가 아니다 — 파일을 직접 올린다 (scp).

## 서버 배치

```
~/hmos/                     ← pm2 앱 hmos (cwd), 정적 서빙 폴더
  server.js                 POST /analyze · /api/analyze · /api/generate
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

## /api/refine — C 5단계 논제 정교화

- 진단은 엔진이 한다: `/analyze`(파이프라인 C)의 `단계.정교화.진단` = [봉인⑬] 4갈래 (오종래 2026-10-13).
  요청에 `사족: [{단락, 실체}]`(4단계 ④)를 넣으면 ④사족 진단에 실린다.
- 입력: `{ 논제, 제시문?, 인식, 진단 }` — `인식`·`진단`은 `/analyze` 응답 그대로.
- ①일방흐름·②서술복잡·③급소불명확만 Claude가 정교화안을 쓴다. ④사족은 `사족`으로 그대로 돌려줄 뿐 생성하지 않는다.
- 정교화안은 러너에 다시 태워 `재인식`(급소·급소실패·진단)을 붙인다. 급소가 의도대로 잡혔는지는 교사가 본다.

## 배포

```
scp -i <키> deploy/server.js deploy/hmos_dashboard.html admin@43.201.35.52:hmos/
ssh -i <키> admin@43.201.35.52 'pm2 restart hmos'
```

바꾸기 전 서버에서 `파일.bak-YYYYMMDD`로 백업을 남긴다.
