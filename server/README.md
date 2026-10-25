# 발송 서버 (server/)

문의보드 연락 창의 **[알림톡 발송]**을 실제 카카오 알림톡으로 내보내는 서버입니다. SOLAPI API 키를 브라우저에 두지 않기 위해 따로 둡니다.
앱(React 빌드 결과 `../dist`, 먼저 상위 폴더에서 `npm run build`)도 같은 주소에서 함께 열어 줍니다.

- 알림톡이 실패하면 SOLAPI가 같은 내용을 문자(LMS)로 대체 발송합니다.
- 모든 발송은 `data/messages.db`(SQLite)에 기록합니다. 이 파일은 git에 올리지 않습니다(학부모 번호 포함).
- 기본값은 **테스트 모드**(`DRY_RUN=1`)입니다. 실제로 보내지 않고 기록만 남깁니다.

## 실행

```bash
cd server
npm install          # 처음 한 번 (SOLAPI SDK)
cp .env.example .env # 값 채우기 (아래 표)
npm start            # http://localhost:8787 → 앱이 열림
npm test             # 서버 테스트
```

필요한 것: Node 22.13 이상(내장 SQLite 사용).

앱 설정: **설정 › 규칙·훅·채널 › 알림톡 발송**에서 다음을 입력합니다.
1. 서버 주소와 접속 토큰(.env의 `API_TOKEN`과 같은 값)을 넣고 [연결 확인]을 누릅니다.
2. 템플릿별로 승인된 SOLAPI 템플릿 ID를 넣고 상태를 "승인"으로 바꿉니다.

## 실제 발송으로 바꾸기 전 준비

| 순서 | 할 일 | .env |
|---|---|---|
| 1 | 카카오톡 채널 개설 + 비즈니스 인증 | |
| 2 | SOLAPI 가입 → API Key 발급 | `SOLAPI_API_KEY`, `SOLAPI_API_SECRET` |
| 3 | SOLAPI에 카카오 채널 연동 → 채널 ID | `SOLAPI_PFID` |
| 4 | 발신번호 등록 (대체 문자용) | `SENDER_PHONE` |
| 5 | 템플릿 심사 신청. 문안은 앱 설정의 [신청 문안]에서 복사. 승인되면 템플릿 ID를 앱 설정에 입력 | |
| 6 | 접속 토큰과 웹훅 키를 정함 (임의의 긴 문자열) | `API_TOKEN`, `WEBHOOK_KEY` |
| 7 | SOLAPI 콘솔 웹훅 주소 등록: `https://서버주소/api/solapi/webhook?key=WEBHOOK_KEY` | |
| 8 | `DRY_RUN=0`으로 바꾸고 재시작 → 원장 본인 번호로 1건 시험 발송 | `DRY_RUN` |

실제 발송 모드에서 위 값 중 하나라도 비어 있으면 서버가 시작되지 않습니다.

## API

| 경로 | 설명 |
|---|---|
| `GET /api/health` | `{ ok, dryRun }` |
| `POST /api/messages/send` | `{ leadId, template, templateId, to, variables: {'#{변수}': 값}, text }` → `{ logId, status: test\|accepted\|failed, reason }` |
| `GET /api/messages?leadId=` | 리드별 발송 기록 |
| `POST /api/solapi/webhook?key=` | SOLAPI 발송 결과 반영 (delivered / fallback / failed) |

- 토큰: `/api/*`는 `Authorization: Bearer API_TOKEN`이 필요합니다. 예외는 health와 webhook입니다.
- 중복 방지(G4): 같은 리드에 같은 템플릿을 5분 안에 다시 보내면 409를 돌려줍니다. 앞의 발송이 실패였다면 막지 않습니다.
- 대행사를 바꿀 때는 `adapters/solapi.js`만 바꿉니다.

## 클라우드 배포: Vercel (2026-10-25 결정, 세부 결정 대기)

호스팅은 **Vercel**로 정했습니다. 아래 두 가지는 사용자가 다른 사람에게 조언을 받은 뒤 결정합니다.

**결정 1. DB: Vercel에서는 SQLite 파일이 유지되지 않음**
- Vercel은 요청이 올 때만 잠깐 실행되는 서버리스 방식이라, 디스크에 쓴 파일(`data/messages.db`)이 남지 않습니다. 그래서 외부 DB가 필요합니다.

| 후보 | 특징 | 비용 |
|---|---|---|
| **Turso** (추천) | SQLite와 같은 문법이라 `db.js`만 조금 고치면 됩니다. 2026-10-17에 정한 "SQLite" 방향과도 맞습니다 | 무료 구간으로 충분할 규모 |
| Neon Postgres (Vercel 마켓플레이스) | Vercel 화면에서 바로 연결됩니다. SQL을 Postgres 문법으로 바꿔야 합니다 | 무료 구간 있음 |

**결정 2. 요금제: Hobby(무료)는 비상업용**
- Vercel 약관상 Hobby는 개인·비상업 용도이고, 학원 운영은 상업 용도에 해당합니다.
- 정식 운영에는 **Pro(사용자 1명당 월 약 20달러)**가 필요합니다. 계약 전에 공식 약관과 가격을 다시 확인해 주세요.
- 선택지는 두 가지입니다: ① 처음부터 Pro로 시작 ② 시험 운영만 Hobby로 하고, 실제 학부모 발송 전에 Pro로 전환.

**결정한 뒤 할 작업**
1. `index.js`의 경로 처리를 Vercel 함수(`api/` 폴더)로 옮깁니다. 발송·웹훅·이력·health 로직은 그대로 재사용합니다.
2. `db.js`를 고른 DB용으로 바꿉니다. 함수 형태(insert / updateByProvider / byLead / recentSame)는 그대로 둡니다.
3. `vercel.json`을 만듭니다. 앱(`dist/`)은 정적 사이트로 제공하고, 함수 실행 지역은 **서울(icn1)**로 지정합니다(기본은 미국).
4. Vercel 환경변수에 `.env.example` 항목을 넣고, SOLAPI 웹훅 주소를 배포 주소로 등록합니다.
5. 로그인 방식(원장·조교 계정)을 정합니다. 지금의 `API_TOKEN` 하나는 그때까지 쓰는 임시 방식입니다.

## 남은 것
- 웹훅 결과를 앱 카드에 다시 반영하기: `GET /api/messages`로 동기화합니다. 앱 저장소가 서버로 옮겨 갈 때 함께 처리합니다.
