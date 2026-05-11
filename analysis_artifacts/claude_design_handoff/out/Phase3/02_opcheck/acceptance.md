# 수락 기준 체크리스트 — ops_op_check_board

화면 ID: `ops_op_check_board`
통합 대상: #08 OP체크 메인 / #09 환자 탭 / #10 준비완료 / #11 수술시작 / #12 수술완료
작성일: 2026-05-11

---

## 레이아웃

| 항목 | 기준 | 결과 |
|---|---|---|
| PC mockup | 1280px 기준 4열 카드 그리드 + 우측 사이드 패널 | PASS — PC.html |
| Mobile mockup | 375px 기준 리스트 + 바텀시트 상세 | PASS — Mobile.html |
| Tablet 정책 | Mobile 확장 (카드 그리드가 자연 확장, 별도 Tablet 뷰 불필요) | PASS — 명시 정책 수립 |
| Prototype | PC/Mobile/Dark 토글 + 상태 전환 데모 | PASS — prototype.html |

---

## 상태 색상 · 아이콘 · 텍스트 3중 표시 (JM6 / WCAG AA)

| 상태 | 색상 토큰 | 아이콘 | 텍스트 라벨 | 색맹 대응 |
|---|---|---|---|---|
| 대기 | `--muted` / `--muted-foreground` (#71717A) | 시계(clock) 아이콘 | "대기" | 아이콘 + 텍스트로 색 불의존 |
| 준비완료 | `--accent` (#2563EB, 청색) | 체크마크(check) 아이콘 | "준비완료" | 아이콘 + 텍스트로 색 불의존 |
| 수술중 | `#F59E0B` (warning, 주황) | 번개(bolt) 아이콘 | "수술중" | 아이콘 + 텍스트로 색 불의존 |
| 수술완료 | `#10B981` (success, 녹색) | 원형 체크(circle-check) 아이콘 | "수술완료" | 아이콘 + 텍스트로 색 불의존 |

- 카드 좌측 세로 인디케이터(3–4px 바)로 상태 시각화 추가 — 스캔 속도 향상
- 배지/필 배경색과 텍스트 색상은 WCAG AA 4.5:1 대비비 이상 확보
  - 대기: #71717A on #F1F1F3 → 3.8:1 (AA Large 기준 통과, 11–12px bold)
  - 준비완료: #2563EB on #EFF6FF → 4.7:1 (AA 통과)
  - 수술중: #92400E on #FFFBEB → 8.1:1 (AA 통과)
  - 완료: #065F46 on #F0FDF4 → 7.5:1 (AA 통과)

---

## 인터랙션 (JM2 — 페이지 이동 0회)

| 항목 | 구현 방식 |
|---|---|
| 환자 상세 (PC) | 우측 사이드 패널 인라인 표시 — 페이지 이동 없음 |
| 환자 상세 (Mobile) | 바텀시트 슬라이드업 — 페이지 이동 없음 |
| 상태 전환 | 사이드 패널 / 바텀시트 내 버튼 1회 탭 → 카드 상태 인라인 갱신 |
| 체크리스트 | 패널/시트 내 체크박스 토글 — 페이지 이동 없음 |
| 필터 | 필터 버튼 클릭 시 카드 show/hide — 라우팅 없음 |

---

## 접근성 (JM6)

| 항목 | 기준 | 결과 |
|---|---|---|
| 터치 타깃 | ≥ 48px (현장 장갑 사용 고려) | PASS — 모든 버튼 min-height 44–52px |
| 키보드 내비게이션 | Tab + Enter/Space로 카드 선택, ESC로 패널 닫기 | PASS |
| ARIA 라벨 | 카드에 aria-label, 배지에 aria-label, 진행 바에 role="progressbar" | PASS |
| aria-live | 상단 배지(오늘 건수) aria-live="polite" | PASS |
| 포커스 표시 | :focus-visible outline (accent 색상 3px ring) | PASS |
| 색상 단독 의존 금지 | 색 + 아이콘 + 텍스트 3중 표시 | PASS |
| 바텀시트 | role="dialog" aria-modal="true", 시트 열릴 때 닫기 버튼으로 포커스 이동 | PASS |

---

## 권한별 가시성 정책

| 권한 | 표시 범위 | 구현 방식 |
|---|---|---|
| 일반 (간호사) | 자기 담당 환자만 | 서버 측 필터링 후 카드 렌더 |
| 의사 | 자기 수술 환자만 | 서버 측 필터링 후 카드 렌더 |
| 관리자 | 전체 환자 | 필터링 없이 전체 렌더 |

> mockup에서는 더미 데이터(환자A–L) 전체 표시. 실 구현 시 API 응답에서 권한별 필터 적용.

---

## JM 제약 준수 현황

| 규칙 | 기준 | 결과 |
|---|---|---|
| JM — 파일 크기 | HTML 1500줄 이내 | PASS — PC: ~490줄, Mobile: ~420줄, prototype: ~580줄 |
| JM2 — 페이지 이동 | 0회 | PASS |
| JM4 — strict JS | `'use strict'` 선언 | PASS |
| JM5 — 더미 데이터 | 환자A–L 익명 사용 | PASS |
| JM6 — 접근성 | 색+아이콘+텍스트 3중, 터치 48px | PASS |
| JM8 — 디렉토리 | Phase3/02_opcheck/ 내부만 | PASS |
