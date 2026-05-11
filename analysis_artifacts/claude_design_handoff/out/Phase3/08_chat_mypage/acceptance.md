# 수락 기준 체크리스트 — Phase 3 ⑧ 채팅·내정보

**그룹**: 채팅 22 + 내정보 6 → 4개 화면 통합  
**화면 ID**: `work_chat` / `work_my_main` / `work_my_commute` / `work_my_todo`  
**검수일**: 2026-05-11

---

## 1. 레이아웃 & 반응형

| # | 항목 | 기준 | 상태 |
|---|------|------|------|
| 1-1 | PC 레이아웃 | 사이드바(72px) + 서브메뉴(192px) + 콘텐츠 영역, 채팅은 Split View (방 목록 280px + 대화창 flex) | ✅ |
| 1-2 | Mobile 레이아웃 | 풀스크린 전환 (방 목록 → 대화창), 바텀탭 4개 (채팅/내정보/출퇴근/할일) | ✅ |
| 1-3 | Tablet 정책 | Mobile 확장 (사유: 채팅·내정보 모두 모바일 핵심, 별도 Tablet 레이아웃 미적용) | ✅ |
| 1-4 | 채팅 Split — PC | 좌: 방 목록 280px 고정, 우: 대화창 flex 1 | ✅ |
| 1-5 | 채팅 풀스크린 — Mobile | 방 목록 전체화면 → 방 탭 시 대화창 전체화면 전환 | ✅ |

---

## 2. 다크모드

| # | 항목 | 기준 | 상태 |
|---|------|------|------|
| 2-1 | CSS 변수 기반 다크모드 | `.dark` 클래스 토글, `--foreground` / `--card` / `--muted` / `--border` 전환 | ✅ |
| 2-2 | 채팅 버블 다크 | 내 메시지 `var(--accent)` white 유지, 상대 메시지 `var(--card)` + `var(--border)` | ✅ |
| 2-3 | 출퇴근 상태 색상 다크 | success/danger/warning 라이트 변수 다크에서 rgba 변환 | ✅ |
| 2-4 | 입력창 다크 | `background: var(--muted)` focus 시 `var(--card)` | ✅ |

---

## 3. 접근성 (WCAG AA)

| # | 항목 | 기준 | 상태 |
|---|------|------|------|
| 3-1 | 채팅 메시지 영역 | `role="log"` + `aria-live="polite"` | ✅ |
| 3-2 | 메시지 입력창 | `aria-label="메시지 입력"` + `aria-multiline="true"` | ✅ |
| 3-3 | 전송 버튼 | `aria-label="메시지 전송"` | ✅ |
| 3-4 | 출퇴근 버튼 | `aria-pressed` (true=출근 중 / false=퇴근 상태) | ✅ |
| 3-5 | 출퇴근 상태 영역 | `role="status"` + `aria-live="polite"` | ✅ |
| 3-6 | 채팅 방 목록 | `role="list"` + 각 항목 `role="listitem"` + `tabindex="0"` | ✅ |
| 3-7 | 할일 체크박스 | `role="checkbox"` + `aria-checked` + `tabindex="0"` + 24px 이상 (모바일) | ✅ |
| 3-8 | 바텀탭 | `aria-label` 각 탭, 현재 탭 `aria-current="page"` | ✅ |
| 3-9 | 날짜 구분선 | `role="separator"` + `aria-label` | ✅ |
| 3-10 | 미읽 배지 | `aria-label="읽지 않은 메시지 N개"` | ✅ |
| 3-11 | 키보드 내비게이션 | Enter 전송, Tab 이동, 방 목록 tabindex="0" | ✅ |
| 3-12 | 터치 타깃 44px+ | 바텀탭, 헤더 버튼, 빠른 메뉴 버튼 모두 min-height: 44px | ✅ |
| 3-13 | 출퇴근 체크인 버튼 | height: 64px (요구사항 초과 충족) | ✅ |
| 3-14 | 색상 대비 | --accent(#2563EB) on white: 4.5:1 이상, 다크모드 --accent(#3B82F6) on dark: AA 충족 | ✅ |

---

## 4. 채팅 가상 스크롤

| # | 항목 | 기준 | 상태 |
|---|------|------|------|
| 4-1 | 상단 Sentinel | `IntersectionObserver` + `vs-top-sentinel` 요소, 스크롤 상단 도달 시 이전 청크 로드 트리거 | ✅ |
| 4-2 | 청크 크기 | 50개 단위 (100개 가정 시 최초 50개 렌더, 상단 스크롤 시 추가 50개) | ✅ |
| 4-3 | 힌트 텍스트 | `aria-hidden="true"` — 스크린 리더 미노출 | ✅ |
| 4-4 | 자동 스크롤 | 새 메시지 전송 시 `scrollTop = scrollHeight` | ✅ |

---

## 5. 권한

| # | 항목 | 기준 | 상태 |
|---|------|------|------|
| 5-1 | 접근 권한 | 모든 직원 (자기 데이터만) | ✅ |
| 5-2 | 더미 데이터 | 실명 대신 가상 이름 사용 (백지민, 김수연, 이준호 등) | ✅ |

---

## 6. 미결 / 주석

| 항목 | 내용 |
|------|------|
| 서류제출 | 마이페이지 빠른 메뉴 버튼에서 모달 진입 — 별도 라우트 없음 (요구사항 충족) |
| Tablet Split | 현재 요구사항: Tablet = Mobile 확장. 추후 화면 폭 768px+ 에서 Split 전환 가능성 존재 — 별도 검토 필요 시 티켓 생성 |
| Push 알림 연동 | 채팅 미읽 배지 실시간 업데이트는 백엔드 WebSocket / Supabase Realtime 연동 필요 |
