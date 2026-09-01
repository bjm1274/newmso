# 11차 · 수정 계획 (승인 요청)

이번 라운드에서 **패치하지 않았다.** 아래는 CONFIRMED P0 우선 패치 제안이다.

1. **세션** — `session-edge` 레거시 HMAC 이중검증 제거. Dockerfile `SESSION_SECRET` 교체. 미들웨어에 재직/`force_logout_at` 또는 짧은 session GET. 쿠키 `Secure`.
2. **결재** — `current_approver_id`/`approver_line`/`status`를 transition 라우트 전용으로. process-final은 history fail-closed. HR update 숏서킷 삭제.
3. **재고** — mutate에서 `quantity`/`stock` 금지. 마감은 품목 회사만. transfer도 마감.
4. **게시판** — list/select COMPANY_SCOPE. 차트번호 별도 컬럼. insert에 `board_*_write`. poll을 리액션 컬럼에서 제거.
5. **PHI** — 퇴원 insert에 company_id 강제 + OR_NULL 제거. 인계노트 회사 컬럼. staff PII 언마스크를 행 회사로.
6. **입금 웹훅** — 세션 경로에서 query companyId 무시. 토큰/서명 필수.
7. **채팅** — public URL 중단, 0건 lookup fail-closed, `server.mjs` signal을 DO와 같이 구독 교차.
8. **출퇴근** — 쓰기를 geo-verify 토큰에 묶고 bypass 프로덕션 제거.
9. **캘린더** — `STORAGE_KEYS.USER` + loading 실패 해제.
10. **권한 UI** — unset을 끄기로 저장(`false`)하거나 런타임 fail-closed.

연계 후속: KPI 결근=크론 로스터 정의, `salary` vs `base_salary` 동시 갱신, 재무 payroll-link/매입 실제 조회 또는 메뉴에서 빼기.
