# 수정 완료 — Sprint 4 (2026-07-12)

## 채팅 키보드 통일
- `tokens.css` `.m-chat-composer` — `--m-kb-offset` 사용
- `채팅방.tsx` — 개별 `useKeyboardLift` 제거, 클래스 적용
- `이모지피커` — `bottom: calc(78px + var(--m-kb-offset))`

## 결재
- **승인 optimistic** — 더 이상 status를 '대기'로 no-op 세팅하지 않음. 중간 승인은 `current_approver_id` 해제, 최종은 `승인` 즉시 반영 후 재조회
- **필터 type** — 실제 `approvals.type` 값과 정렬 (`연장근무 신청`, `물품구매 신청` 등)
- **상세 푸터** — safe-area 패딩 덮어쓰기 제거
- **연차 신청 딥링크** — `compose:leave` / 내정보 연차 버튼 → 결재 연차 폼

## 내정보
- **연차 신청 버튼** 연결 (`onSwitchTab('approval', 'compose:leave')`)
- **급여·증명 records** — `m-screen` + `m-scroll` 래핑

## 잔여 (제품 설계 필요)
- WebAuthn 서버 credential 등록/검증 엔드포인트
