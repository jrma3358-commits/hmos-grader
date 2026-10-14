# deploy — 서버 판 (3.35.141.46 `~/hmos`)

> 2026-10-14 새 서버 3.35.141.46 (Lightsail Node.js 이미지, Debian 12, admin)으로 옮김. 옛 서버 43.201.35.52는 10-14 먹통 — 스냅샷 없이 새로 깔았다.
> 엔진 900a123, 봉인 표지사전.json은 로컬 사본 (sha256 2292ec5c…), `.env`는 오종래가 넣는다.
> 옛 서버에만 있던 수정 3개(run.ts `--json`·lexicon.ts·옛 명세서-2)는 새 서버에 없다 — `/api/analyze`(대시보드는 안 씀)는 run.ts `--json`이 없어 실패한다.

서버에 올라가 있는 파일을 그대로 옮겨 둔 것이다. 저장소 최상위 `server.js`·`hmos_dashboard.html`과 다른 판이다.
서버의 `~/hmos`는 git 저장소가 아니다 — 파일을 직접 올린다 (scp).

## 서버 배치

```
~/hmos/                     ← pm2 앱 hmos (cwd), 정적 서빙 폴더
  server.js                 POST /analyze · /api/analyze · /api/generate · /api/refine · /api/propose
  analyze-runner.mts        /analyze 러너 — 엔진(hmos-grader/)을 부르기만 한다
  home.html                 / (홈) — 「문항 분석 시작하기」 → 접속 비밀번호 팝업
  hmos_dashboard.html       /dashboard — 접속 쿠키가 있어야 열린다 (없으면 /?login=1)
  hmos-grader/              엔진 사본 — git clone (origin = ~/hmos-bundles/main.bundle). 봉인/표지사전.json은 git 밖이라 따로 scp
~/hmos-bundles/main.bundle  엔진 번들 (정적 서빙 폴더 밖)
  .env                      ANTHROPIC_API_KEY (이 폴더에는 없음)
~/hmos-spec/
  HMOS_루브릭_구현명세-7.md  /api/generate 시스템 프롬프트 (F2~F6 원문) — 정적 서빙 밖에 둔다
  HMOS_논제생성_명세서-2.md  /api/refine 시스템 프롬프트 (§3 정교화 원문) — 부를 때 읽는다
  조립설명서.md              C·논술 9단계 조립설명서 (2026-10-13)
```

- pm2: `hmos` (admin), node args `--env-file=.env`, Node 24. `pm2 startup systemd`(pm2-admin) + `pm2 save`로 부팅 때 뜬다
- 재인식(러너)은 하나씩 돈다 — 병렬로 띄우면 서버가 멈춘다 (2026-10-14)
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
| 8·9 루브릭·모범답안 | `POST /api/rubric` `{논제(확정), 계열, 총배점, 제시문?}` → 러너 작업 `루브릭` | 엔진 F1~F5·문항평가 (`src/rubric`, 소문항마다) · Claude는 조각마다 문장만. 검산 = 조각 문장에 실체 글자가 있는가(GJ 아님), 못 채운 조각만 2회까지 다시 (2026-10-14). 인문논술 ② 세우기 = 엔진이 소문항 급소와 연결한 제시문 단락의 문장 수(문장 하나 = 조각 하나), ③ 풀기 없음 — 봉인② (2026-10-14) |

- 사족 (오종래 2026-10-13) = 논제 급소가 제시문 어느 단락 급소와도 연결되지 않은 것 (단락 단위).
- 연관성 강약 판정은 엔진 몫이다 — 아직 규칙이 없다.
- C는 1차 필터를 타지 않는다.
- ④사족은 정교화안을 만들지 않는다 (`/api/refine` 응답의 `사족`으로 그대로).
- 명세 md는 부를 때 읽는다 — 없으면 그 라우트만 500.

## 도메인 · HTTPS (2026-10-13)

- `https://hmos.hunminos.com` → nginx(80/443) → `127.0.0.1:3000`. 설정: `/etc/nginx/sites-available/hmos` = [`nginx/hmos.conf`](nginx/hmos.conf)
- `/` 는 홈(`home.html`, server.js가 내준다). 대시보드는 `/dashboard`. http는 https로 301

## 접속 비밀번호 (2026-10-14)

- `.env`의 `ACCESS_PASSWORD` — 바꾼 뒤 `pm2 restart hmos`. 없으면 `POST /api/access`가 503이라 아무도 대시보드에 못 들어간다
- 맞으면 `hmos_access` 쿠키(HttpOnly · SameSite=Lax · https면 Secure, 12시간). 값은 비밀번호로 만든 HMAC — 비밀번호를 바꾸면 이전 쿠키는 모두 무효
- `/hmos_dashboard.html`을 바로 열면 `/dashboard`로 돌린다. IP마다 10분에 10번 틀리면 잠시 막는다
- API(`/analyze`·`/api/*`)도 같은 쿠키가 있어야 한다 — GET·HEAD 말고는 `/api/access`만 열려 있다. 쿠키가 없거나 만료되면 401 (`/analyze`는 `error.사유`, `/api/*`는 `error` 글 — 대시보드가 그대로 띄운다)
- 인증서 Let's Encrypt (certbot --nginx, 새 서버 발급 2026-10-13 23:15 UTC · 만료 2027-01-11, certbot.timer 자동 갱신 — dry-run 통과)
- 예전 자리표시 앱(root pm2 `nodeapp`, `/var/www/nodeapp/server.js`)은 pm2에서 지웠다. 파일은 남아 있다 (새 서버도 같게, 백업 /root/.pm2/dump.pm2.bak-20261014)
- 새 서버 nginx는 아래 hmos.conf에 `.bundle`·점 파일 차단을 더하고 proxy_read_timeout 600s (재인식 순차). certbot 등록은 이메일 없이
- 조립설명서(C·논술 9단계 원전): 서버 `~/hmos-spec/조립설명서.md` = [`hmos-spec/조립설명서.md`](hmos-spec/조립설명서.md)

## 배포

```
scp -i <키> deploy/server.js deploy/hmos_dashboard.html admin@3.35.141.46:hmos/
ssh -i <키> admin@3.35.141.46 'pm2 restart hmos'
```

바꾸기 전 서버에서 `파일.bak-YYYYMMDD`로 백업을 남긴다.
