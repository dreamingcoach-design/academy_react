# Academy React — SNP영어학원 운영 시스템 (React 버전)

`../academy-os/app`(바닐라 JS 대시보드)을 React(Vite)로 옮긴 프로젝트입니다. 메뉴·화면·문구·데모 데이터·저장 형식은 원본과 같습니다.
규칙·기능 정의 문서(`core/`, `subjects/`)는 계속 `academy-os` 쪽이 원본입니다.

## 실행

```bash
npm install        # 처음 한 번
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 배포용 빌드 → dist/
npm test           # 화면 스모크 테스트 (전 메뉴·주요 버튼)
```

발송 서버(알림톡)는 `server/`에 있습니다. `npm run build` 후 `cd server && npm start`로 띄우면 `http://localhost:8787`에서 앱과 API를 함께 엽니다. 자세한 내용은 [server/README.md](server/README.md)를 보세요.

## 구조

```
academy-react/
├─ index.html, vite.config.js
├─ src/
│  ├─ main.jsx, App.jsx       ← 레이아웃·좌측 메뉴·해시 라우터(#/students/stu-1 등 원본과 같은 주소)
│  ├─ ui.jsx                  ← 모달·토스트·표·입력 등 공통 컴포넌트 (원본 ui.js와 같은 클래스명)
│  ├─ styles.css              ← 원본 style.css 그대로
│  ├─ lib/
│  │  ├─ store.js             ← 데이터 계층 (localStorage, 키 academy-os:v1 — 원본과 같음)
│  │  ├─ domain.js, visits.js ← 코칭 상태·시험 D-n·방문 일정 계산
│  │  ├─ analysis.js          ← 레벨테스트 근본 원인 분석 (원본 그대로)
│  │  ├─ sender.js            ← 발송 서버 연결
│  │  └─ hooks.js             ← useStore(저장소 구독), useViewState(화면별 상태), 라우터
│  ├─ data/                   ← 내장 레벨테스트 키·50점대 데모 캡처 텍스트
│  └─ views/                  ← 화면 15개 (Home, Consult, LeadMsg, LtReport, Students, Coaching, …)
├─ leveltest-keys/            ← 테스트지 키 원본 JSON (src/data/leveltestForms.js 의 원본)
├─ server/                    ← 알림톡 발송 서버 (원본에서 복사, 정적 파일 경로만 dist/로 변경)
└─ tests/smoke.test.jsx
```

## 원본과 달라진 점

- 화면 갱신: 원본은 저장 후 `OS.render()`로 화면 전체를 다시 그렸고, 여기서는 저장소 구독(`useStore`)으로 자동으로 다시 그립니다.
- 원본의 모듈 단위 `state`(탭·선택값)는 `useViewState`로 옮겼고, 메뉴를 옮겨 다녀도 값이 남는 동작은 같습니다.
- 작은 개선: 문의 카드에서 [삭제]를 확인하면 열려 있던 문의 창도 함께 닫힙니다. 발송 워크플로우의 코멘트는 입력하는 즉시 미리보기에 반영됩니다.

## 데이터 주고받기

저장 키와 JSON 형식이 원본과 같아서, 원본의 **설정 › 데이터 관리 › 내보내기** 파일을 이 앱의 **불러오기**로 그대로 옮길 수 있습니다(반대도 됨).
브라우저 저장소는 주소(origin)마다 따로라서, 원본을 쓰던 브라우저 데이터가 자동으로 넘어오지는 않습니다.
