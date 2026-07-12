# 수정 완료 — Sprint 2 (2026-07-12)

## 키보드 · IME

| 항목 | 파일 |
|------|------|
| `useKeyboardLift` / `isImeComposing` | `모바일/공통/useKeyboardLift.ts` |
| 게시판 댓글 키보드 리프트 + IME | `게시판/댓글입력.tsx` |
| 채팅 컴포저 리프트 + 이모지 bottomOffset | `채팅/채팅방.tsx` |
| 스레드 Enter IME 가드 | `채팅/스레드시트.tsx` |
| 업무공유 댓글 리프트 + IME | `추가기능/업무공유상세.tsx` |
| 나의할일 Enter IME | `내정보/나의할일.tsx` |
| 이모지 피커 z=1200 | `채팅/이모지피커.tsx` |

## 보안 · 가짜 UI

| 항목 | 내용 |
|------|------|
| 생체인증 | 가짜 성공·자동 실행 제거 → 비밀번호 경로만 |
| 계약 PDF | 가짜 완료 toast → 미지원 안내 |
| 계약 업로드 | demo URL 제거 → `/api/approvals/upload` 실업로드 |
| 발주 폼 | 데모 품목/거래처/주소 제거, 품목 추가·거래처 입력 연결 |

## 권한

| 항목 | 내용 |
|------|------|
| 바텀탭 | `canAccessMainMenu` 로 탭 필터 + `user` prop |
| switchTab | 권한 없으면 toast 후 차단 |

## 잔여 (추후)

- 생체 WebAuthn 서버 등록 플로우
- 발주 카탈로그 피커 (현재 prompt)
- sticky-foot 전 화면 일괄 lift (구성원등록 등 긴 폼)
