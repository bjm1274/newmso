# 수락 기준 체크리스트 — 근태 통합 뷰 (Phase 3 그룹④)

**화면 ID**: `hr_attendance_dashboard` / `hr_attendance_calendar` / `hr_attendance_roster`
**산출물**: PC.html · Mobile.html · prototype.html · acceptance.md · before_after.md
**작성일**: 2026-05-11

---

## 1. 레이아웃 커버리지

| 항목 | 기준 | PC.html | Mobile.html | prototype.html |
|------|------|---------|-------------|----------------|
| 대시보드 (hr_attendance_dashboard) | 3개 파일 각각 구현 | ✅ | ✅ | ✅ |
| 달력 (hr_attendance_calendar) | 3개 파일 각각 구현 | ✅ | ✅ | ✅ |
| 근무표 (hr_attendance_roster) | 3개 파일 각각 구현 | ✅ | ✅ | ✅ |

---

## 2. Tablet 정책 (그룹별 결정 — 사유 명시)

| 화면 | Tablet 정책 | 사유 |
|------|------------|------|
| **대시보드** | PC 레이아웃 축소 적용 | 통계 4열 → 2열 grid 축소, 내부 탭 구조 그대로 유지. 팀장이 태블릿을 데스크 겸용으로 사용하는 패턴을 고려하여 PC 축소를 선택. |
| **달력** | Mobile 레이아웃 확장 적용 | 달력 셀이 좁으면 도트가 보이지 않음. 768px에서도 Mobile 달력 패턴(전체 너비 단일 달력)을 쓰고 상세 정보를 하단에 배치하는 방식이 가독성 유리. |
| **근무표** | PC 레이아웃 축소 적용 | 근무표는 가로 축이 긴 표 구조이므로 PC overflow-x 패턴이 적합. 세로 공간 여유가 있는 태블릿에서 전체 팀 근무표를 한눈에 볼 수 있어야 함. |

---

## 3. 다크모드

| 항목 | 기준 | 확인 |
|------|------|------|
| CSS 변수 `[data-theme="dark"]` 블록 정의 | --card, --muted, --border, --foreground 반전 | ✅ |
| 상태 색상 배경 (normal-bg, late-bg 등) 반전 | 진한 배경으로 교체 | ✅ |
| `bg-white` 하드코딩 없음 | var(--card) 사용 | ✅ |
| 토글 버튼 제공 | 우하단 고정 버튼 | ✅ PC, ✅ prototype |

---

## 4. WCAG AA 접근성

| 항목 | 기준 | 확인 |
|------|------|------|
| 색상에만 의존 금지 | 상태 배지에 텍스트 라벨 병기 (정상/지각/결근/휴가) | ✅ |
| 색상 도트 + 텍스트 라벨 병기 | badge-dot + 텍스트 조합 | ✅ |
| 대비 비율 WCAG AA (4.5:1 이상) | Pretendard + 시스템 색상 기준 충족 | ✅ |
| 시맨틱 HTML | `<nav>`, `<main>`, `<header>`, `<table scope>`, `<dialog>` 사용 | ✅ |
| ARIA 역할 | role="tablist/tab/tabpanel/grid/gridcell/listitem" | ✅ |
| aria-selected, aria-controls, aria-labelledby | 탭 전환 시 동기화 | ✅ |
| hidden 속성 | 비활성 패널에 hidden 설정 (display:none 병행) | ✅ |
| aria-live="polite" | 달력 월 이동 시 라벨 변경 알림 | ✅ |
| progressbar role | 연차 프로그레스바 aria-valuenow/min/max | ✅ |

---

## 5. 키보드 접근성 (JM6)

| 항목 | 기준 | 확인 |
|------|------|------|
| 모든 인터랙티브 요소 Tab 접근 | button, a, input, select, dialog | ✅ |
| focus-visible 스타일 | outline: 2px solid var(--accent) | ✅ |
| 달력 Arrow key 네비게이션 | ArrowRight/Left/Up/Down + Enter/Space | ✅ (3개 파일 모두) |
| 모달 dialog 요소 사용 | `<dialog>` 네이티브 접근성 | ✅ PC, ✅ prototype |
| 테이블 행 tabindex="0" | 키보드 포커스 가능 | ✅ |

---

## 6. 터치 44px+ (모바일)

| 항목 | 기준 | 확인 |
|------|------|------|
| 체크인 버튼 | height: 56px | ✅ |
| 바텀 탭 버튼 | min-height: 44px | ✅ |
| 달력 셀 | min-height: 44px | ✅ |
| 리스트 아이템 | min-height: 44px | ✅ |
| 폼 인풋 | padding: 12px → 실효 높이 44px+ | ✅ |
| 아이콘 버튼 (헤더) | width/height: 44px | ✅ |

---

## 7. 권한별 뷰

| 권한 | 범위 | 구현 위치 |
|------|------|----------|
| 일반 직원 | 본인 근태만 조회, 연차 신청 가능 | prototype.html 권한 시뮬레이터 |
| 팀장 | 팀 전체 조회, 연차 승인 | prototype.html 팀장 모드 |
| 관리자 | 전사 조회, 일괄 승인, 이상감지 전체 | prototype.html 관리자 모드 |

---

## 8. 성능 제약 (JM2)

| 항목 | 기준 | 확인 |
|------|------|------|
| 달력 한 달만 렌더 | 월 이동 시 DOM 교체, 12개월 전체 렌더 없음 | ✅ |
| 가상 데이터 사용 | API 호출 없음, 정적 JS 객체 | ✅ |
| 화면 탭 전환 | CSS display 토글 (DOM 재생성 없음) | ✅ |

---

## 9. 보안 (JM5)

| 항목 | 기준 | 확인 |
|------|------|------|
| 더미 직원명 | 실존 이름 사용 안 함 (김민준, 이서연 등 가상) | ✅ |
| innerHTML 최소화 | prototype.html 동적 렌더에서만 사용, 정적 문자열 삽입 | ✅ |
| 외부 스크립트 없음 | Google Fonts CDN 제외 전부 인라인 | ✅ |

---

## 10. 미결 항목 (구현 제외)

| 항목 | 사유 |
|------|------|
| 실시간 체크인 GPS 위치 확인 UI | 백엔드 연동 필요, mockup 범위 외 |
| 근무표 셀 인라인 편집 | 복잡도 과다, 별도 스프린트 |
| 이상감지 Push 알림 설정 | 알림 시스템 연동 필요 |
