# 수정 완료 — Sprint 0 + Sprint 1 (2026-07-12)

## Sprint 0 — UI

| 항목 | 파일 | 내용 |
|------|------|------|
| m-scroll min-height | `tokens.css` | `min-height:0; min-width:0` + z 토큰 |
| paddingBottom 24 제거 | 홈·연차·출퇴근·정보수정·증명서·급여명세·허브·웹팩스·평가·게시판홈 | 글로벌 88px 탭 여백 복구 |
| 공유캘린더 스크롤 | `공유캘린더.tsx` | `m-scroll` 래핑 |
| 헤더 safe-area | `MobileHeader.tsx` | `paddingTop: calc(16px + safe-top)` |
| 탭 safe-area | `MobileBottomTab.tsx` | `bottom: max(16px, safe-area)` |
| z-index ≥1200 | 비번 모달, 퀵메뉴, 서명, 복지/징계 시트 | 탭(999) 위 |
| button min-height | `globals.css` | `.mso-mobile` 예외 |

## Sprint 1 — 데이터

| 항목 | 파일 | 내용 |
|------|------|------|
| 게시판 subView | `게시판/index.tsx`, `data-hooks.ts` | `resolveBoardSubView` — '전체'→home/all, free 강제 해제 |
| 게시판 error | `data-hooks.ts` | error toast + limit 200 |
| override 클리어 | `index.tsx` refetch | PTR/작성 후 목록 갱신 |
| 근무현황 | `추가기능/data-hooks.ts` useWorkNow | attendance+attendances merge, check_out, current_status, unknown≠working |
| 업무공유 type | data-hooks useTaskShares | 업무가이드+레거시 포함 |
| 결재선 1~3 | useApproverLine, useApprovalFormBase | slice(0,3) |
| 연차/기안 CC | 연차신청폼, 기안상신 | 전사 자동 CC 제거 |
| 채팅 loading | Shell→index→목록 | roomsLoading 전달, empty 구분 |
| 나가기 가드 | 채팅방 | membersReady / 빈 members 시 patch 금지 |
| 전송 롤백 | 채팅방 + removeOptimistic | 실패 시 temp 제거·입력 복구 |
| todos 카운트 | 내정보 data-hooks | `is_complete` 컬럼 |

## 미착수 (다음)

- useVisualViewportOffset (키보드)
- IME isComposing 가드
- 계약 demo/PDF, 발주 데모
- 바텀탭 권한 게이트
- 생체 WebAuthn 실검증
