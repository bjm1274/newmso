# MSO ERP 통합 리디자인 — Claude Code 작업 지시서

> 이 문서 하나로 Claude Code가 작업을 시작할 수 있도록 모든 컨텍스트를 정리했습니다.
> Last updated: 2026.05.11

---

## 1. 프로젝트 한 줄 요약

MSO ERP(의료기관용 통합 ERP) 96장 화면을 **PC + Mobile 동시 반응형으로 통합 리디자인**.
현행 96장 → 목표 38장 (60% 감축). 백오피스 비중 66% (인사 37 + 관리자 26).

---

## 2. 현재 프로젝트 파일 인벤토리

### 📄 디자인 문서 (읽기 자료)
| 파일 | 역할 |
|---|---|
| `MSO_Master_Plan.html` | **최우선** 마스터 플랜 (4 Phase · 8주 로드맵 · PC+Mobile 반영) |
| `MSO_Screenshot_Labels.md` | 96장 라벨링 완료된 매핑 표 |
| `MSO_Design_Audit.html` | 초기 디자인 감사 |
| `MSO_Menu_Unification_Brief.html` | 메뉴 통일 작업 지시서 |
| `MSO_Detailed_Design_Spec.md` | 세부 디자인 스펙 |
| `MSO_Design_Improvement.md` | 개선 메모 |
| `MSO_Screenshot_ContactSheet.html` | 96장 컨택트시트 (라벨링 UI) |

### 🖼 스크린샷 원본
- `shots/스크린샷(1).png` ~ `shots/스크린샷(47).png` (1차 47장)
- `shots2/스크린샷(48).png` ~ `shots2/스크린샷(96).png` (2차 49장)
- ⚠ 모든 스크린샷은 듀얼 모니터 캡처라 **좌측 50%만 유효**

### 💻 기존 React 컴포넌트 (재활용 가능)
- `nb-icons.jsx` — 아이콘 세트
- `nb-screens.jsx` — 화면 컴포넌트
- `nb-sidebar.jsx` — 사이드바 컴포넌트
- `tweaks-panel.jsx` — Tweaks 패널
- `newmso-redesign.html` — 기존 리디자인 시도

---

## 3. 핵심 발견 사항

### 분포
- **인사관리 37장 + 관리자 26장 = 전체의 66%** — 백오피스 비중 압도적
- **급여 13개 화면** — 단일 서브메뉴 최다
- **OP체크 5장** = 상태전이만 다른 동일 화면
- **퇴원심사 6장** = 워크플로우 한 흐름
- **연차휴가 4장, 근태이상감지 2장, 경영분석 2장, 감사센터 2장** = 탭 통합 후보
- **템플릿 시스템 중복**: 운영설정 템플릿 3장 + 회사관리 계약템플릿 1장

### 추가 발견 (라벨 외)
- **업무공유 화면** — 회사/팀별 할일·자료·인수인계. 3분할 레이아웃·모바일 사용 불가·정보 분산 문제

### 모바일 사용성 문제 (추정)
- 96장 대부분이 데스크톱 전제 — 좁은 화면에서 좌우 스크롤·축소 필수
- OP체크·근태 체크인은 현장 모바일 사용이 핵심인데 모바일 UX 부재
- 테이블·다중 패널·복잡 폼은 모바일에서 사용 불가
- 터치 타깃 44px 미만, 햄버거 메뉴 5뎁스 이상

---

## 4. 작업 마스터 플랜 (4 Phase / 8주)

### Phase 1 · 화면 통합 매트릭스 (Week 1–2)

**선행작업: 없음 — 바로 착수 가능**

작업 목록:
- [ ] 96장 × `{유지/탭통합/모달통합/스텝통합/삭제}` 5분류 매트릭스
- [ ] 96장 × `{PC전용/Mobile전용/양쪽필수}` 디바이스 분류
- [ ] 통합 패턴 카탈로그 5종 정의
  - ① 상태전이 통합 (OP체크 5장 → 1장)
  - ② 워크플로우 스텝 (퇴원심사 6장 → 2장)
  - ③ 탭 통합 (연차·근태·경영분석·감사센터)
  - ④ 마스터-디테일 (경조사·마감보고 CRUD 짝)
  - ⑤ 설정 통합 (템플릿 시스템)
- [ ] 각 통합 그룹별 Before/After 다이어그램 (1:1 매핑)
- [ ] 우선순위 점수표 (통합 임팩트 × 리스크 × 사용빈도 × 모바일 비중)

산출물:
- `out/Phase1_Consolidation_Matrix.html` (인터랙티브, 필터 가능)
- `out/Phase1_Pattern_Catalog.md`
- `out/Phase1_Priority_Score.csv`

---

### Phase 2 · IA(정보구조) 재설계 (Week 2–3)

**선행작업: Phase 1 완료**

작업 목록:
- [ ] 8개 대분류 → 5개 작업 중심 메뉴로 재편
  - 현재 IA → 제안 IA:
    - 업무 (내 일·결재·소통) — 7
    - 인사·근태·급여 — 12
    - 운영 (재고·OP체크·심사) — 9
    - 경영 (대시보드·분석) — 4
    - 설정 (회사·권한·시스템) — 6
- [ ] 역할 기반 진입점 분리 (직원/관리자/원장)
- [ ] 인사관리(37) → 인사/근태/급여/문서로 분할
- [ ] 관리자(26) → 운영/재무로 분할
- [ ] 3 depth 룰 적용 (5뎁스 이상 화면 제거)
- [ ] 📱 모바일 IA 별도 설계 — 바텀탭 5개 (홈·업무·내정보·알림·더보기) + 우선순위 화면만 노출
- [ ] 검색·즐겨찾기 우선 IA (깊은 화면은 메뉴 대신 검색으로)

산출물:
- `out/Phase2_New_IA_Sitemap.html` (PC + Mobile 2종)
- `out/Phase2_Sidebar_Component.jsx` (새 사이드바 React 컴포넌트)
- `out/Phase2_BottomTab_Component.jsx` (모바일 바텀탭 + 햄버거)
- `out/Phase2_Migration_Map.csv` (구→신 메뉴 매핑표)

---

### Phase 3 · 우선순위 화면 리디자인 (Week 3–6)

**선행작업: Phase 1·2 완료**

#### 리디자인 대상 — 7개 화면 그룹 (현 47장 → 신 12장)

| 그룹 | 현행 | → | 신규 | 변경 핵심 |
|---|---|---|---|---|
| ① 급여 워크센터 | 13장 (#41~53) | → | 1장 | 대시보드 + 좌측 단계 네비. 정산·대장·시뮬레이터 모두 한 화면 |
| ② OP체크 실시간 보드 | 5장 (#08~12) | → | 1장 | 상태전이를 카드 상태로. 페이지 이동 없이 인라인 액션 |
| ③ 퇴원심사 워크플로우 | 6장 (#17~22) | → | 2장 | 심사 목록 + 사이드 패널 스텝 |
| ④ 근태 통합 뷰 | 10장 (#30~40) | → | 3장 | 대시보드/달력/근무표 3장. 연차·이상감지는 탭 |
| ⑤ 관리자 운영·회사관리 | 11장 (#78~89) | → | 3장 | 회사정보 + 운영설정 + 템플릿 라이브러리 |
| ⑥ 경영 인사이트 | 2장 (#71~72) | → | 1장 | 경영+재무 통합 대시보드. 위젯 토글 |
| ⑦ **업무공유 협업센터** | 1장 | → | 1장 | 3분할 → 마스터-디테일. 자료/인수인계/팀할일 탭 분리 |

#### 각 화면 산출물
- [ ] 🖥 PC hi-fi mockup (1280px) — 데스크톱 풀 레이아웃
- [ ] 📱 Mobile hi-fi mockup (375px) — 카드/시트/바텀탭
- [ ] 📐 Tablet 확인 (768px) — PC 축소 or Mobile 확장
- [ ] 🎯 인터랙션 프로토타입 (클릭 가능, PC + Mobile 양쪽)
- [ ] Before/After 비교 슬라이드

#### 디바이스별 우선순위
- 📱 **Mobile First**: OP체크 · 출퇴근 · 할일 · 결재 · 게시판 · 내정보 · **업무공유** (현장 사용 핵심)
- 🖥 **Desktop First**: 급여 워크센터 · 관리자 설정 · 경영 대시보드 · 회사관리 (사무실 백오피스)

산출물 디렉토리:
- `out/Phase3/01_payroll/` (PC.html, Mobile.html, prototype.html)
- `out/Phase3/02_opcheck/`
- `out/Phase3/03_discharge_review/`
- `out/Phase3/04_attendance/`
- `out/Phase3/05_admin_company/`
- `out/Phase3/06_management_insight/`
- `out/Phase3/07_team_share/`

---

### Phase 4 · 디자인 시스템 통일안 (Week 6–8, Phase 3 병행)

작업 목록:
- [ ] **토큰 정의** — 색상·여백·타이포·radius
  - 현재 화면별 제각각인 값 → 단일 토큰 세트로 통일
  - light/dark 모드 분리 (선택)
- [ ] **컴포넌트 표준화 (12종)** — PC + Mobile 반응형 사양
  - 버튼, 인풋, 셀렉트(→모바일 풀스크린), 테이블(→모바일 카드), 모달(→모바일 시트), 탭, 카드, 뱃지, 토스트, 로더, 빈상태, 폼레이아웃
- [ ] **모바일 전용 컴포넌트** — 바텀탭, 바텀시트, 풀스크린모달, 스와이프액션, 당겨서새로고침
- [ ] **패턴 가이드** — 빈 상태/로딩/에러/확인 모달 (디바이스별 변형 명시)
- [ ] **접근성 체크리스트** — 대비비 WCAG AA, 키보드, 포커스 링, 라벨링, 터치 타깃 44px
- [ ] **Figma 또는 코드 라이브러리 핸드오프**

산출물:
- `out/Phase4/design_tokens.json`
- `out/Phase4/Component_Library.html` (실행 가능한 컴포넌트 전시)
- `out/Phase4/Pattern_Guide.html`
- `out/Phase4/A11y_Checklist.md`
- `out/Phase4/components/*.jsx` (React 컴포넌트 라이브러리)

---

## 5. Claude Code 작업 순서

### 즉시 시작 (질문 없이)
1. `MSO_Master_Plan.html`을 브라우저로 열어 전체 구조 파악
2. `MSO_Screenshot_Labels.md` 96장 라벨 표 확인
3. `shots/` + `shots2/` 폴더에서 실제 스크린샷 sampling (특히 통합 후보 그룹 — 급여 13장, OP체크 5장, 퇴원심사 6장)
4. **Phase 1부터 순차 진행**

### 의사결정 필요 (사용자에게 확인)
- [ ] 8주 전체 진행 vs Phase 1만 먼저
- [ ] Phase 3 우선순위 그룹 7개 중 가장 시급한 1~2개
- [ ] 모바일 사용 비중 데이터 (GA·로그) 가용 여부
- [ ] 최종 산출물 형태: HTML 프로토타입 / Figma / React 코드
- [ ] 모바일 앱 형태: 반응형 웹 / PWA / 네이티브
- [ ] 채팅 메뉴 처리 (라벨 0장, 범위 포함 여부)
- [ ] 현장 검증 인터뷰 가능 여부 (퇴원심사·OP체크 실사용자)

---

## 6. 기술 가이드

### HTML 스타일 가이드
- 한글 폰트: Pretendard (`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`)
- 기존 디자인 토큰 참고: `MSO_Master_Plan.html`의 `:root` CSS 변수 (`--accent: #2563eb` 등)
- 모든 결과물은 반응형 (Mobile 375 / Tablet 768 / Desktop 1280)

### React 컴포넌트 작성
- React 18.3.1 + Babel standalone (CDN)
- 스타일 객체는 컴포넌트별 고유명 (`payrollStyles`, `opCheckStyles` 등)
- 컴포넌트 공유 시 `Object.assign(window, {...})` 사용

### 파일명 규칙
- 한글 OK, 공백은 언더스코어
- 산출물은 모두 `out/Phase{N}/` 디렉토리 아래

---

## 7. 리스크 & 가정

| 리스크 | 대응 |
|---|---|
| 도메인 검증 부족 (의료/HR 워크플로우) | Phase 1 종료 시점에 현장 검증 1회 필수 |
| 마이그레이션 비용 (매뉴얼·교육자료·딥링크) | Phase 2 산출물에 구→신 매핑표 포함 |
| 병행 개발 충돌 | 8주간 신규 화면 추가 보류 협의 |
| 모바일 사용 패턴 데이터 부재 | Phase 1 디바이스 분류는 추정 — 실데이터로 검증 권장 |

---

## 8. 시작 명령 예시

Claude Code에게 다음과 같이 지시:

> "MSO_Claude_Code_Handoff.md를 읽고 Phase 1부터 시작해줘.
> 먼저 MSO_Screenshot_Labels.md의 96장을 5분류(유지/탭통합/모달통합/스텝통합/삭제) × 디바이스 우선순위(PC/Mobile/양쪽)로 매핑한 매트릭스를 out/Phase1_Consolidation_Matrix.html로 만들고, 통합 패턴 카탈로그 5종도 정리해줘."

---

**Last note**: 모든 작업은 `MSO_Master_Plan.html`의 4 Phase 구조를 따라야 합니다. 각 Phase 산출물이 다음 Phase의 입력입니다.
