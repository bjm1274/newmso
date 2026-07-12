# 수정 완료 — Sprint 3 (2026-07-12)

## 전역 키보드 리프트

| 항목 | 내용 |
|------|------|
| `MobileShell` | `useVisualViewportOffset` → CSS `--m-kb-offset` |
| `tokens.css` `.m-sticky-foot` | `transform: translateY(-var(--m-kb-offset))` |
| 댓글/업무공유 | 이중 lift 제거 (전역만 사용) |
| 채팅 컴포저 | 기존 개별 lift 유지 (m-sticky-foot 아님) |
| `MSheet` | 스크롤 영역 `minHeight:0` + touch scrolling |

## 발주 카탈로그 피커

| 항목 | 내용 |
|------|------|
| 품목 | inventory 조회 MSheet + 검색, item_id 연결 |
| 거래처 | suppliers 조회 MSheet + 검색 + 직접 입력 |
| 데모/prompt | 제거 |

## 생체·보안 UI

| 항목 | 내용 |
|------|------|
| FaceID 버튼 | 제거 (WebAuthn 미등록 시 우회 방지) |
| 급여 게이트 | 비밀번호 전용 |

## 잔여

- WebAuthn 서버 credential 등록 플로우 (별도 설계)
- 채팅 컴포저도 전역 변수로 통일 가능 (현재 개별 lift OK)
