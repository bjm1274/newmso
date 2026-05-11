# 수락 기준 — work_team_share (Phase 3 · Group ⑦)

## 화면 ID
`work_team_share` — 회사·팀 업무공유 협업센터

---

## 레이아웃

| 항목 | 기준 | 확인 |
|---|---|---|
| PC split view | 좌 360px 목록 + 우 가변 상세, 동시 표시 | ✅ |
| Mobile 목록 | 카드 리스트 전체 너비 (390px 기준) | ✅ |
| Mobile 상세 | translateX 슬라이드 전환, 페이지 이동 없음 (JM2) | ✅ |
| Tablet 정책 | Mobile.html 768px 확장 — 마스터-디테일 자연 확장 | ✅ |
| 다크모드 | `:root.dark` 토큰 전환, prototype 토글 확인 | ✅ |

---

## 탭 & 필터

| 항목 | 기준 | 확인 |
|---|---|---|
| 탭 3개 | 자료 / 인수인계 / 팀할일 | ✅ |
| 카운트 뱃지 | `.badge.badge-blue/green/red` 각 탭 우측 | ✅ |
| 탭 role | `role="tablist"`, `role="tab"`, `aria-selected` | ✅ |
| 회사·팀 필터 | PC: 상단 드롭다운, Mobile: 수평 스크롤 칩 | ✅ |
| 빵부스러기 | `aria-label="현재 위치"` nav, depth 3 (MSO > 업무공유 > 전체 자료함) | ✅ |

---

## 등록 폼

| 항목 | 기준 | 확인 |
|---|---|---|
| PC | 모달 (`role="dialog"`, `aria-modal="true"`) | ✅ |
| Mobile | 바텀시트, `border-radius: 16px 16px 0 0` | ✅ |
| 필드 | 회사·팀·분류·제목(필수)·내용·첨부 | ✅ |
| 닫기 | ESC 키, 백드롭 클릭, 닫기 버튼 3가지 | ✅ |

---

## 접근성 (WCAG AA)

| 항목 | 기준 | 확인 |
|---|---|---|
| 키보드 내비게이션 | Tab, Enter/Space, Escape 전부 지원 | ✅ |
| 터치 타깃 | 모든 인터랙티브 요소 최소 44×44px | ✅ |
| 색상 대비 | 본문 #09090B / 배경 #FFFFFF — AA 초과 | ✅ |
| `aria-label` | 아이콘 버튼 전부 레이블 부여 | ✅ |
| `focus-visible` | `outline: 2px solid var(--accent)` | ✅ |
| 빈상태 `.empty-state` | 텍스트 대체, 아이콘 `aria-hidden` | ✅ |

---

## 권한

| 역할 | 동작 |
|---|---|
| 일반 사용자 | 본인 소속 팀 자료만 조회·등록 |
| 관리자 | 전사 전체 회사·팀 필터 접근 가능 |

> 구현 시 API 레벨에서 `team_id` / `company_id` 필터링 필수 (JM5).

---

## JM 제약 준수

| 규칙 | 내용 | 상태 |
|---|---|---|
| JM | HTML 파일 1500줄 이내 | ✅ PC≈430줄 / Mobile≈490줄 |
| JM2 | 모바일 목록↔상세 inline transition (페이지 이동 없음) | ✅ |
| JM6 | `role="tablist"`, 빵부스러기 `aria-label`, 터치 44px | ✅ |
| JM8 | 본인 그룹 데이터만 기본 노출 | ✅ |
