# MSO 모바일 리디자인 — Claude Code 작업 패키지

> 박철홍정형외과 MSO 시스템의 모바일 라이브 프리뷰 (`MSO_Mobile_Redesign_Live.html`) + 모든 소스코드 + 작업 지시서를 묶은 패키지입니다.

## 패키지 구성

```
handoff_mobile/
├── README.md                          ← 지금 이 파일 (먼저 읽으세요)
├── INSTRUCTIONS.md                    ← Claude Code 작업 지시서 (핵심)
├── SCREENS_INVENTORY.md               ← 화면 인벤토리 (60+ 화면 매트릭스)
├── ROUTES_MAP.md                      ← 라우팅 맵 (SUB_MAP 키 → 컴포넌트 → 경로)
├── DESIGN_TOKENS.md                   ← 디자인 토큰 명세
├── live-preview/
│   ├── MSO_Mobile_Redesign_Live.html  ← 라이브 프리뷰 진입점 (브라우저로 열면 됨)
│   └── mobile/
│       ├── m-tokens.css               ← 모바일 디자인 토큰 (zinc, accent, dark)
│       ├── m-components.jsx           ← 공통: MIcon, MChip, MBtn, MAvatar, MHeader, MBottomTab, MCard, MListRow, MSheet
│       ├── m-screens-1.jsx            ← MyPage 홈/체크인/알림, 채팅 목록/방, 게시판 목록/상세
│       ├── m-screens-2.jsx            ← 결재함/상세, 급여명세서, 재고현황, 경영대시보드, 추가기능허브, More
│       ├── m-screens-extras.jsx       ← 할일·서류제출·기안함·참조·작성하기
│       ├── m-screens-hr.jsx           ← HR 6개 화면 (구성원·근태·연차·이상·복지·문서)
│       ├── m-screens-stock.jsx        ← 재고 3개 화면 (입출고·물품자산·분석마감)
│       ├── m-screens-admin.jsx        ← 관리자 6개 화면 (시스템·회사·권한·운영·양식·감사)
│       ├── m-screens-addon-details.jsx ← OP체크·퇴원심사·MRI·업무공유·업무가이드 보조 화면
│       ├── m-screens-addon-modules.jsx ← PC ADDON_MODULES 12개 풀 커버
│       ├── m-screens-forms.jsx        ← 등록·작성 폼 7종 (구성원·물품·자산·발주·연차·게시글·새대화)
│       ├── m-canvas.jsx               ← 디자인 캔버스 + 인터랙티브 데모 + Tweaks
│       ├── design-canvas.jsx          ← 캔버스 스타터 컴포넌트 (수정 X)
│       └── ios-frame.jsx              ← iOS 프레임 스타터 (현재 미사용)
└── source-reference/                  ← 참고 자료 (수정 X)
    ├── MSO_PC_Redesign_Live.html      ← PC 리디자인 라이브 (모바일과 1:1 매칭의 기준)
    ├── redesign/                      ← PC 리디자인 소스 (탭 구조·데이터 기준)
    ├── MSO_Mobile_Improvement.html    ← 모바일 디자인 시스템 탐색본
    ├── MSO_Mobile_Phase3_Screens.md   ← 모바일 7개 화면군 설계 지시서
    ├── MSO_Mobile_Advanced.md         ← PWA·제스처·키보드·퍼포먼스·미디어 가이드
    └── MSO_Mobile_Implementation_Tasks.md ← P0–P3 토큰/컴포넌트 표
```

## 작업 시작 순서

1. **`live-preview/MSO_Mobile_Redesign_Live.html`** 을 브라우저로 열어 현재 상태 눈으로 확인. 캔버스에 모든 화면이 펼쳐져 있고, 첫 섹션 "인터랙티브 데모" 에서 실제 모바일처럼 탭 이동 가능합니다.
2. **`INSTRUCTIONS.md`** 정독 — 무엇을 어떻게 작업하는지, 무엇이 끝났고 무엇이 남았는지.
3. **`SCREENS_INVENTORY.md`** 로 작업 대상 화면을 찾고, **`ROUTES_MAP.md`** 로 진입 경로 파악.
4. **`DESIGN_TOKENS.md`** 의 토큰만 사용해서 새 화면 추가 / 기존 화면 수정.
5. 새 화면 추가 시 — 적절한 파일 (`m-screens-hr.jsx` 등)에 컴포넌트 정의 → `window` 에 export → `m-canvas.jsx` 의 `SUB_MAP` 에 등록 → `DCSection` 안에 `DCArtboard` 추가.

## 핵심 기술 스택

- React 18.3.1 + ReactDOM (inline Babel transform, no build step)
- 단일 HTML + 별도 JSX 파일들을 `<script type="text/babel" src="...">` 로 로드
- 컴포넌트는 모두 전역 (`window.XXX`) — 파일 간 import/export 없음
- CSS는 `mobile/m-tokens.css` 한 파일에 통합 + 인라인 style 보조
- Tweaks (다크모드 + 강조색) 동작 — `__edit_mode_*` postMessage 프로토콜

## PC와의 매핑

이 모바일 리디자인은 `MSO_PC_Redesign_Live.html` 의 모든 메뉴/탭과 1:1 풀 커버되어 있습니다. 자세한 매트릭스는 `SCREENS_INVENTORY.md` 참조.

## 주의

- **편집·정산 작업은 모바일에 절대 풀로 넣지 않습니다.** "데스크톱에서" 라는 안내 배너 (`<DesktopHint>`) 패턴이 정착되어 있어요.
- **모바일은 조회·승인·신청·확인 중심.** 무거운 편집은 PC로 유도.
- **데이터는 정적입니다.** 모든 숫자/이름은 시연용. 실제 API 연동 X.
- **44px 터치 타깃·24px 이상 폰트** 원칙 지킬 것.
