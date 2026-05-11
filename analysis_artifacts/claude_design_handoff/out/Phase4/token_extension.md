# Phase 4 — 토큰 확장 보고서

## 1. 결정
Master Plan의 "Phase 4 토큰 정의"는 **재정의가 아닌 확장**으로 결정. 이유: globals.css에 이미 통일된 토큰이 완비됨 (2026-03-18).

## 2. 추가된 토큰 (4영역)
- 터치 타깃: --touch-target(44px), --touch-target-sm(40px) — WCAG 2.5.5 / JM6
- 모바일 spacing: padding-x/y, section-gap, bottomtab-height, bottomsheet-radius
- 인쇄 전용: print-foreground/background/border/muted — @media print에서 자동 치환
- z-index 표준: dropdown(50) ~ tooltip(1300) 8단계
- 트랜지션: 기존 --transition-fast(100ms) / --transition-base(150ms) / --transition-slow(220ms) 유지 — 동일 이름 토큰 이미 존재하여 추가하지 않음

## 3. 변경 안 한 토큰
- --accent, --radius-*, --sidebar-width, --submenu-width, 다크모드 토큰 — 모두 보존
- --transition-fast/base/slow — 현행값(100/150/220ms) 그대로 유지 (이미 전체 컴포넌트에 사용 중)
- Toss 레거시 토큰 9개 — 점진 정리 예정 (Phase 후속)

## 4. 적용 방법
- 새 컴포넌트는 var(--touch-target) 등 변수 사용
- 인쇄 페이지는 .no-print/.print-only 클래스로 토글
- z-index 하드코딩 금지 — var(--z-modal) 등 변수 참조
- 모바일 padding은 var(--mobile-padding-x), var(--mobile-padding-y) 사용

## 5. 라디우스 충돌 (token_alignment.md 발견)
현행 8/10/12 vs Master Plan 10/14 → **현행 유지** 결정 (이미 196개 TSX에 적용됨, 변경 시 회귀 위험)

## 6. @media print 작동 보장
- globals.css 파일 끝에 `@media print { :root { ... } }` 블록을 배치
- 라이트/다크 모드 구분 없이 인쇄 시 항상 검정/백색 강제 적용
- `--print-*` 변수는 :root(라이트)와 :root.dark(다크) 양쪽에 동일 값으로 선언 — 모드에 무관하게 일관된 인쇄 결과 보장

## 7. 신규 변수 수 요약

| 그룹 | 변수 수 |
|---|---|
| 터치 타깃 | 2 |
| 모바일 spacing | 5 |
| 인쇄 전용 | 4 (라이트) + 4 (다크 중복 선언) |
| z-index | 8 |
| **합계 (고유 변수)** | **19** |
