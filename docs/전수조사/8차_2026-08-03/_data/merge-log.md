# 8차 전수조사 — 병합·심각도 조정·판정 누락 처리 내역 (V13)

## 1. 판정 커버리지

- findings-all.jsonl 308건, v01~v12 verdict 404건을 id 로 조인.
- **판정 누락 0건** — 308건 전부 최소 1개 verdict 보유. 고아 verdict 0건. 따라서 V13 의 임의 간이판정은 발생하지 않았다.
- 96건이 2개 verdict 보유(도메인 검증 V01~V10 × 교차검증 V11/V12). 그중 **37건이 불일치**(판정 17 + 심각도 20).

## 2. 판정 불일치 재판정 (17건)

채택 규칙 — (a) falsifier 가 실제로 성립함을 양측이 인정하면 REFUTED, (b) delta_verdict=CLOSED 레코드에서 "CLOSED 주장이 맞다"는 CONFIRMED 는 *열린 결함이 아니므로* 원장에서는 REFUTED 로 정규화, (c) 두 검증자가 코드 사실 자체를 다투면 V13 이 직접 코드를 열어 판정.

| id | V01~V10 | V11/V12 | V13 최종 | 근거 |
|---|---|---|---|---|
| D01-013 | V01=REFUTED/P2 | V12=CONFIRMED/P2 | **REFUTED/P2** | falsifier(hr_근무형태 부여 경로 부재)를 양측이 확인. 부여 불가 키를 보는 죽은 조건만 잔존 → 오탐. |
| D01-D04 | V01=CONFIRMED/P0 | V11=PLAUSIBLE/P2 | **CONFIRMED/P1** | V13 직접 확인: mutate/route.ts:290-293 catch 가 whereProxy 합성행으로 fail-open 하는 것은 사실(V11 미확인). 판정 SELECT 는 LIMIT 바인드가 1개 더 붙어(:273) 실행문보다 파라미터가 1 많고 WhereSchema 의 in 배열은 상한이 없다(:184) → where 바인드가 정확히 100 인 DELETE 는 판정만 D1 100-바인드 한도에 걸려 폴백한다. 다만 합성행이 살리는 패턴은 rowCompanyIsNull() 이 true 가 되는 MANAGE_COMPANY_OR_NULL·FINANCE_SCOPE 뿐이라 이미 manage-company 권한을 쥔 계정의 교차회사 삭제로 한정 → V01 의 P0 도 V11 의 P2 도 아닌 P1. |
| D08-020 | V02=REFUTED/P2 | V12=CONFIRMED/P2 | **REFUTED/P2** | falsifier 명시조건(테스트가 참조하면 오탐)이 성립 — system-master-route-compat.desktop.spec.ts:2 가 import. |
| D08-027 | V02=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED. data-reset 서버측 bcrypt+확인문구 재검증 실재. 열린 결함 아님. |
| D08-028 | V02=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED. 잔존 회귀는 별건 D08-012 로 계상되어 중복. |
| D02-013 | V03=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED. mutate insert 팬아웃 실재, 우회 클라 경로 0건. |
| D06-004 | V03=PLAUSIBLE/P2 | V12=CONFIRMED/P1 | **PLAUSIBLE/P2** | 규칙 불일치(하드코딩 제로 UUID vs isNoticeRoomType 문자열 비교)는 코드 사실이나, 제2 notice 방 존재 여부가 운영 D1 상태에 의존 → 정적 확정 불가. |
| D06-018 | V03=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED. buildQueueFailurePatch 백오프·데드레터 실재. |
| D03-013 | V04=REFUTED/P2 | V12=CONFIRMED/P2 | **REFUTED/P2** | resolveShiftForDate 호출자 0건을 양측이 확인 — 영향 주장 붕괴, 죽은 코드만 잔존. |
| D03-D02 | V04=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED (document_repository SELF_OR_SAME_COMPANY 명시 등록). |
| D03-D03 | V04=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED (todos SELF_ONLY 명시 등록, 소비처 6곳 네임스페이스 일치). |
| D03-D04 | V04=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED (certificate_issuances STAFF_IN_SCOPE/SELF insert). |
| D03-D05 | V04=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED (summary 세션+canAccessStaffRecord 게이트). |
| D03-D06 | V04=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED (export-csv 관리자 게이트). |
| D04-102 | V05=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED (contract_templates 명시 정책이 루프보다 우선). |
| D04-103 | V05=CONFIRMED/P0 | V11=PLAUSIBLE/P1 | **PLAUSIBLE/P1** | V11 이 backups/d1_chunks/chunk_0054.sql:53 에서 운영 D1 에는 해당 컬럼이 존재함을 발견 — 잔존 여부가 운영 DB 상태 의존. |
| D11-901 | V08=CONFIRMED/P2 | V11=REFUTED/P2 | **REFUTED/P2** | delta CLOSED. 복원 6종 전부 실패수집/exit 1 확인, 빈 catch 0건. |

## 3. 심각도 재조정 (20건)

적용 기준 — P0 = 실제 도달 가능 + (권한 경계를 넘는 데이터 유출 | 무결성 파괴 | 모듈 단위 전면 불능 | 인증/권한 우회). 단일 화면·버튼 단위 불능은 P1. 테스트/설정/죽은 코드는 P2.

| id | 도메인 | 교차 | V13 최종 | 조정 사유 |
|---|---|---|---|---|
| D01-001 | V01=CONFIRMED/P1 | V12=CONFIRMED/P0 | **P1** | 소비처 6곳 전부 leave_balances 폴백을 갖고 있어 "전면 불능"이 아니라 "조용한 오답(잔여 0일)". V01 의 코드 근거 채택. |
| D01-024 | V01=CONFIRMED/P2 | V12=CONFIRMED/P1 | **P2** | V10 이 D13-019 에서 미실행 스펙 내용의 2/3 가 이미 e2e 로 커버됨을 확인 — 실제 공백 2건. 테스트 배선은 P2. |
| D01-D01 | V01=CONFIRMED/P2 | V11=CONFIRMED/P1 | **P1** | 권한 보유자에게 무에러 빈 목록 = 조용한 실패 → P1. |
| D01-D05 | V01=CONFIRMED/P1 | V11=CONFIRMED/P0 | **P0** | 임의 로그인 직원이 mutate 200/403 차이로 password 해시·resident_no 접두를 1비트씩 복원. 권한 경계 넘는 유출이며 무권한자 도달 가능 → P0 유지. |
| D01-D06 | V01=CONFIRMED/P2 | V11=CONFIRMED/P1 | **P1** | 비관리자 게시판 별표가 항상 403 + 에러 토스트 — 재현율 100% 기능 파손 → P1. |
| D08-004 | V02=CONFIRMED/P1 | V12=CONFIRMED/P0 | **P0** | 복원은 100행 초과 테이블에서 100% 실패. D08-003(백업 52/162)과 합쳐 재해복구 경로 자체가 없음 → 기능 전면 불능. |
| D02-012 | V03=CONFIRMED/P0 | V12=CONFIRMED/P1 | **P0** | wrangler [triggers] 미등록으로 영구 미실행(도달률 0). 결근 자동생성·퇴근 미체크 기능 전면 불능 → P0. |
| D03-005 | V04=CONFIRMED/P0 | V12=CONFIRMED/P1 | **P1** | 모바일 증명서 발급 단일 기능 불능, PC 경로 정상 → P1. |
| D03-006 | V04=CONFIRMED/P0 | V12=CONFIRMED/P1 | **P1** | 팀 생성·수정 저장 단일 기능 실패, 읽기는 select(*) 라 무영향 → P1. |
| D03-D07 | V04=CONFIRMED/P2 | V11=CONFIRMED/P1 | **P1** | 잔존분은 hr/admin 권한 보유자의 교차회사 스코프 누락 — 사전 권한 필요 → P1. |
| D05-020 | V06=CONFIRMED/P2 | V11=CONFIRMED/P0 | **P1** | 단독 익스플로잇 불가, D05-019/D05-001 체인의 두 번째 고리 → 대표(D05-001)로 병합하고 P1. |
| D07-010 | V06=CONFIRMED/P0 | V12=CONFIRMED/P1 | **P0** | 로그인만으로 타인·공지 게시글 update/delete. 소유권 경계를 넘는 무결성 파괴 → P0 상향(V06 채택). |
| D11-004 | V08=CONFIRMED/P2 | V12=CONFIRMED/P1 | **P2** | untracked 스크래치 스크립트 + CLOUDFLARE_API_TOKEN 별도 export 필요 = 이중 게이트 → P2. |
| D11-005 | V08=CONFIRMED/P2 | V12=CONFIRMED/P1 | **P2** | python 수동 실행 + 비파괴(SELECT/xlsx) + 구 DB 부재 시 예외 종료 → P2. |
| D11-009 | V08=CONFIRMED/P0 | V12=CONFIRMED/P1 | **P0** | V13 직접 확인: scripts/add-pchos-cname.mjs:1 등 untracked 파일에 평문 Cloudflare API 토큰(cfoat_ 접두)이 있고 scripts/deploy.mjs:125 `git add -A` → :130 `git push origin main` 이 이를 원격에 올린다. 자격증명 유출 + 다음 배포 1회로 발생 → P0. |
| D11-019 | V08=CONFIRMED/P1 | V12=CONFIRMED/P2 | **P1** | restore-d1-safe.mjs 가 게이트 없이 운영 v2 바인딩에 d1 migrations apply 를 건다는 V08 의 실측 접촉면 채택 → P1. |
| D11-020 | V08=CONFIRMED/P1 | V12=CONFIRMED/P2 | **P2** | 분류·인벤토리 레코드. 실피해는 D11-009 에서 P0 로 계상됨(중복 계상 방지). |
| D13-005 | V10=CONFIRMED/P2 | V12=CONFIRMED/P1 | **P2** | fork PR 노출 주장이 V10 에서 반증됨. 실제 노출 경로는 워크플로 스텝의 임의 코드 실행에 한정 → P2. |
| D13-013 | V10=CONFIRMED/P2 | V12=CONFIRMED/P1 | **P2** | npm run lint 는 CI 게이트가 아니라 "처음부터 없던 게이트" — 런타임 영향 0 → P2. |
| D13-019 | V10=CONFIRMED/P2 | V12=CONFIRMED/P1 | **P2** | 미실행 스펙 내용의 2/3 를 실행 중인 e2e 가 대체 커버, 실제 공백은 2건 → P2. |

## 4. 중복 병합 (41건 → 대표 아래로)

병합 기준: **같은 코드 지점의 같은 결함**을 서로 다른 도메인 에이전트가 따로 보고한 경우만. 같은 기능·같은 클래스이되 코드 지점이 다르면 병합하지 않고 같은 근본원인 축으로만 묶었다.

| 대표 | 병합된 id | 병합 축 |
|---|---|---|
| D01-001 (P1) | D03-D11 | leave_ledger POLICY_REGISTRY 미등록 403 — 본건+델타 |
| D01-004 (P1) | D01-005 | 세션 권한 압축 — 본건+파생 |
| D01-016 (P0) | D01-D04 | mutate 폴백 fail-open — 본건+델타 |
| D01-019 (P2) | D01-D02 | consultation/analyze 권한 게이트 부재 — 본건+델타 |
| D02-012 (P0) | D01-023, D08-022 | absent-auto-create 크론 트리거 미등록 — D01/D02/D08 3중 보고 |
| D03-003 (P0) | D03-D12 | 연차소멸 leave_ledger 미기록 — 본건+델타 |
| D03-027 (P0) | D03-D01 | ESS 저장 payload 계약 불일치 — 본건+델타 |
| D04-002 (P1) | D04-023 | 정규식 수량자 손상 {N,}→{N } — 본건+crossover |
| D04-005 (P0) | D04-103 | employment_contracts 서명 컬럼 부재 — 본건+델타 |
| D04-007 (P0) | D03-004, D04-101 | staff_members.agreed_* 미존재 컬럼 SELECT — D03/D04/델타가 각각 보고 |
| D04-017 (P2) | D09-013 | handleSignComplete 사본 2벌 — D04/D09 중복 보고 |
| D05-001 (P0) | D05-019, D05-020 | approvals 자기승인 — 본건+델타 2건(체인 포함) |
| D05-002 (P0) | D05-021 | [전결] 결재선 스킵 — 본건+델타 |
| D05-013 (P2) | D12-010 | 결재 첨부 MIME 검증 부재/불일치 — D05/D12 중복 |
| D05-015 (P2) | D12-016 | 결재 지연 알림 2벌 — D05/D12 중복 |
| D07-001 (P0) | D01-008 | stock-consume 스코프 가드 부재 — D01/D07 중복 보고 |
| D07-007 (P1) | D07-027 | 재고 이관 절대값 무가드 UPDATE — 본건+델타 |
| D07-010 (P0) | D07-018, D07-023, D07-024, D07-025 | board_posts/board_post_reads PUBLIC_ALL·서버 보드 권한 부재 — D07 본건+델타 3건 |
| D07-013 (P1) | D12-001 | 업로드 파일명 정규식 오염 — D07/D12 중복 |
| D07-014 (P1) | D07-028 | 월마감 company 무검증 — 본건+델타 |
| D07-022 (P2) | D12-009 | logo/seal upload 71L 복제 — D07/D12 중복 |
| D08-002 (P0) | D08-001 | 관리자의 시스템마스터 권한/비밀번호 탈취 — D08 내 2건 |
| D08-006 (P1) | D08-025 | 감사로그 actor 클라이언트 결정 — 본건+델타 |
| D08-008 (P1) | D08-026 | access_logs INSERT 0건 — 본건+델타 |
| D08-013 (P2) | D10-007 | 감사 요약 오늘 창 UTC 자정 — D08/D10 중복 |
| D09-D02 (P1) | D09-009, D09-010 | 오프라인 업로드 실패 무통지 — 델타+기전 2건 |
| D10-001 (P1) | D02-006, D06-002 | 공지봇 크론 ISO created_at 삽입 — D02/D06/D10 3중 보고 |
| D11-002 (P1) | D11-903 | full-recalc 게이트 누락 — 본건+델타 |
| D11-004 (P2) | D11-902 | backup-cloudflare 구 DB — 본건+델타 |
| D11-011 (P2) | D13-009 | upload-secrets 평문 tmp/죽은 Supabase 키 — D11/D13 중복 |
| D11-012 (P2) | D13-008 | deploy-worker FIREBASE cmd.exe echo — D11/D13 중복 |
| D11-015 (P2) | D13-006 | 루트 backfill-sync/check-sync 죽은 코드 — D11/D13 중복 |
| D13-019 (P2) | D01-024 | 보안 스펙 영구 미실행 — D01/D13 중복 |

### 병합하지 않은(의도적) 근접 쌍

- D02-012(크론 트리거 미등록) vs D03-001(서버에서 클라 전용 db-client 사용): 같은 기능의 **서로 다른 두 결함**. 하나만 고쳐도 기능은 살아나지 않으므로 별건 유지(같은 축 S6).
- D08-003(백업 테이블 52/162) vs D08-004(복원 배치 200 vs 상한 100): 백업/복원 양단의 독립 결함. 같은 묶음 FB9, 별건 유지.
- D03-010(촉진 판정이 미러 의존) vs D03-011(recalculate asOf 미래주기): 같은 SSOT 축이나 코드 지점·수정이 다름.
- D10-009 / D10-011 / D12-012: 공백형 타임스탬프 해석기 drift 3사이트. 같은 클래스이나 파일이 달라 별건 유지(S7).
- D03-016(공휴일 하드코딩 2026-12-25 종료) vs D03-021(export-csv year=2026 하드코딩): 같은 클래스, 다른 사이트.

## 5. 원장 필드 규약

- `verdict_final` / `severity_final`: V13 최종. `verifiers` 에 원 검증자별 판정을 보존.
- `conflict:true`: 검증자 간 불일치가 있었던 37건. `reconciliation` 이 "V13 재판정"이면 위 2·3장 근거로 결정됨.
- `merged_into`: 대표 id. **P0 집계·수정 계획은 merged_into 가 null 인 대표 267건만 세는 것이 맞다**(CONFIRMED P0 31건 중 9건이 병합 대상 → 대표 P0 22건).
- `root_cause` / `fix_bundle`: root-causes.md 의 S1~S14 및 FB1~FB13 과 1:1.
