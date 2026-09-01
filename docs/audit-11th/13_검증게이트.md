# 11차 · 13 검증 게이트

독립 검증자가 현재 파일을 다시 읽고 반증을 시도했다. **evidence 있는 CONFIRMED만 최종 P0/P1.**

## CONFIRMED (반증 실패)

| ID | 등급 | 한 줄 | 핵심 위치 |
|----|------|-------|-----------|
| AU-01 | P0 | Edge가 하드코딩 HMAC을 env 다음에도 검증. `/main` 쿠키 위조 | `session-edge.ts:63-69,294-303` `middleware.ts:14-24` |
| MY-01 | P0 | geo-verify 차단은 `out_of_range`만. attendance INSERT는 mutate | `geo-verify/route.ts:166` `policies.ts` attendance insert |
| AP-01 | P0 | 결재선/현재결재자 컬럼 mutate 가능 → 최종 결재 판정 | `policies.ts:313-330` `process-final/route.ts:184-200` |
| AP-02 | P0 | HR이 status=승인 위조 후 process-final로 기본급. (직접 salary UPDATE도 가능 — 감사 우회) | `policies.ts:373` `server-approval-processing.ts:710-787` |
| INV-01 | P0 | inventory quantity mutate, 이동 로그 없음 | `policies.ts` inventory update INVENTORY_SCOPE |
| CAL-01 | P0 | PC 캘린더가 `localStorage.user`를 읽어 스피너 고정 | `공유캘린더.tsx:56-94,533` |
| BD-01 | P0 | PC 게시판 회사 필터 없음 + 차트번호 content + PUBLIC select | `게시판.tsx` fetchPosts, `policies.ts` board_posts |
| EX-01 | P0 | 입금 웹훅: extra 세션이면 토큰 없이 companyId 쿼리로 upsert | `virtual-account-webhook/route.ts:43-101` |
| EX-02 | P0 | 퇴원심사 company_id 미기록 → OR_NULL 전사 PHI | `퇴원심사.tsx` createReview |
| EX-03 | P0 | 인계노트 회사 컬럼 없음 AUTHENTICATED | schema handover_notes, policies |
| HR-05 | P0 | PUBLIC staff_members + HR 언마스크가 행 회사 없음 | policies stripStaffSecrets, d1-api-helpers |
| AD-01 | P0 | unset admin_* 는 admin에게 fail-open | `access-control.ts:354-368` |
| FN-01 | P0 | 시산표 차=대=amount 합 → 항상 일치 | `재무회계.tsx:338-346` |
| CH-01 | P0 | 채팅 public URL + storage 0건 lookup fail-open | s3-storage, storage/object/route.ts |
| CH-02 | P0 | `server.mjs` signal ACL 없음 (DO 허브는 교차 검사 있음) | `server.mjs:377-380` |
| AUTH-01 | **CLOSED(신규로그인)** | 퇴사 status 재로그인은 막힘 | `master-login/route.ts:322-325` |

명시 `false`는 거절한다(AD-01 뉘앙스). PUBLIC은 익명이 아니라 **로그인 전원**.

## REFUTED / 축소

- 10차 AUTH-01 본문(퇴사자 사번+옛 비밀번호 **신규** 로그인) → **이번 코드에서 닫힘**. 잔여: 퇴사예정·기존 세션·미들웨어.
- 10차 모바일 채팅 5초 과거증발 → **merge로 닫힘**. 잔여: 빈 페이지/에러 시 전체 클리어.
- 비관리자 자기결재 transition → 막힘. 잔여: sender_id 공란, 관리자, 결재선 mutate.
- 급여 type 하이잭(물품신청+form_type) → 좁혀짐. 잔여: type 공란+meta.
- 결근 크론 LV-01(무기록 전원) → 로스터 게이트로 닫힘. **KPI는 옛 정의 유지.**

## PLAUSIBLE (데이터/배포 의존)

CH-01 publicBaseUrl은 env가 켜져 있을 때 세계 공개. Dockerfile SESSION_SECRET이 레거시와 같으면 AU-01이 API까지 관통.
