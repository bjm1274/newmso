# 수락 기준 체크리스트 — hr_payroll_workcenter

**화면 ID**: `hr_payroll_workcenter`
**Phase**: 3 / Group ①
**대상 화면**: #41~#53 (13개 → 1개 통합)
**검토일**: 2026-05-11

---

## 1. 레이아웃 / 반응형

- [x] PC 1280px mockup (`PC.html`) — 좌측 단계 네비 + 중앙 메인 + 우측 패널 3-컬럼
- [x] Mobile 375px mockup (`Mobile.html`) — 조회 전용 명시, 하단 3탭 구조
- [x] Tablet 정책: **PC 축소 적용** (별도 Tablet 레이아웃 없음)
  - 사유: 백오피스 급여 정산 화면은 넓은 테이블·다단계 폼 중심이므로 모바일은 명세서 조회만 허용하고 Tablet은 PC 레이아웃을 축소 표시

---

## 2. 다크모드

- [x] `<html data-theme="dark">` 토글 버튼 (PC·Mobile·Prototype 모두)
- [x] CSS 변수 자동 전환 (`--card`, `--muted`, `--border`, `--fg`, `--accent-light`)
- [x] 배지 색상 다크 대응 (`.badge-green/red/warn` 배경 재정의)
- [x] Stat 아이콘 배경 다크 대응 (`.stat-icon-*`)
- [x] 이슈 아이템 배경 다크 대응 (`.issue-item.*`)

---

## 3. 인쇄

- [x] **급여명세서** (`#view-payslip` / `#mob-payslip`) — `@media print` 변형
  - 헤더·사이드바·필터바·단계 네비 숨김
  - 흑백 테이블 출력 (`border: 1px solid #000`)
  - `payslip-print` 클래스: 최대 폭 640px, 인쇄용 메타 정보 포함
  - `data-print="true"` 속성으로 인쇄 시 해당 섹션만 표시
  - PC.html: 인쇄 버튼 → 명세서 뷰 자동 전환 후 `window.print()` 호출
  - Mobile.html: "명세서 인쇄" 버튼 → `window.print()` 직접 호출

---

## 4. 접근성 (WCAG AA)

- [x] **색 대비 4.5:1 이상**
  - 배경 `#ffffff` 위 텍스트 `#0f172a` → 대비 약 19:1
  - 배경 `#eff6ff` 위 `--accent #2563eb` → 대비 약 4.6:1 (AA 통과)
  - 오류 빨강 `#dc2626` on `#fff` → 약 5.1:1
- [x] **키보드 전체 지원**
  - Tab/Shift+Tab: 모든 인터랙티브 요소 순서대로 도달
  - Enter/Space: 버튼·탭 활성화
  - ArrowLeft/ArrowRight: `role="tablist"` 내 탭 이동 (PC 패널탭, 급여대장탭, 하단탭)
  - `:focus-visible` 아웃라인 명시 (2px solid var(--accent))
- [x] **터치 타깃 ≥ 44px** (모바일)
  - `--touch: 44px` 변수 사용, 모든 버튼 `min-height: var(--touch)`
  - 하단 탭 `min-height: var(--touch)`
- [x] **시맨틱 HTML**
  - `<header role="banner">`, `<nav aria-label>`, `<main role="main">`, `<aside aria-label>`, `<section aria-labelledby>`
  - 탭: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`
  - 이슈: `role="alert"` (오류 항목)
  - 통계: `role="progressbar"` + `aria-valuenow/min/max`
  - 라이브 리전: `aria-live="polite"` (시뮬레이터 결과)
- [x] **`aria-current="step"`** — 현재 활성 단계 네비 버튼에 적용
- [x] **`aria-label` 완비** — 모든 input, select, button, section에 레이블 존재
- [x] 장식 SVG에 `aria-hidden="true"` 적용

---

## 5. 권한별 접근

| 역할 | 접근 범위 | 비고 |
|---|---|---|
| **직원** | 내 명세서 조회 (Mobile 탭 1) | 타 직원 데이터 접근 불가 |
| **관리자** | 전사 정산 (#42) + 대장 (#43) + 검증 (#46/#48) + 출력 (#45) | 시뮬레이터 미접근 |
| **원장** | 전사 모든 기능 + 우측 시뮬레이터 패널 (#47) 접근 | 권한 최상위 |

> 현재 mockup에서는 역할 분기 UI 포함 (`role-banner` 안내 텍스트). 실제 구현 시 서버 사이드 권한 검증 필요.

---

## 6. 성능 / 코드 품질

- [x] JS `'use strict'` 모드
- [x] 외부 데이터 없음 (더미 데이터만 사용)
- [x] 실제 직원 이름·금액 미사용 ("직원1~21" 형식)
- [x] Pretendard CDN 단일 외부 의존성
- [x] PC.html: 1,497줄 (JM 1,500줄 이내 준수)
- [x] Mobile.html: 308줄 (JM 준수)
- [x] prototype.html: 286줄 (JM 준수)

---

## 7. 미결 / 차기 작업

- [ ] 권한별 뷰 실제 분기 로직 (API 연동 시)
- [ ] 원천징수 홈택스 파일 포맷 검증 (실 데이터 연동 시)
- [ ] 급여명세서 전자 서명란 추가 여부 확인 필요
