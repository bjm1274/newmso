# Fable5 재실행 — ⑦ SQL·DB (검토 28파일)

> [검증] = Fable5 독립 검증자 판정. 현역 DB = D1 단독.
> ※ resume에서 재실행되어 1차 패스와 다른(둘 다 유효한) 발견 집합. 본 표가 정본이고, 1차 전용 발견은 하단 흡수.

## MAJOR (전건 검증 confirmed)
- **sql-01 [성능]** `d1/query/route.ts:327-348` — 매 generic SELECT POST마다 런타임 DDL 2건(disciplinary_committees CREATE TABLE + employment_contracts UNIQUE INDEX). 일회성 마이그레이션이 read 핫패스에. mutate에도 중복. [검증 confirmed] (=api-3, lib-04)
- **sql-02 [성능]** `lib/db/auth/policies.ts:829-847` — filterByPolicy가 STAFF_IN_SCOPE 등에서 행마다 evalPattern→`staff_members` SELECT 1건. notifications/push_subscriptions/attendance/payroll_records 등 비관리자 조회 시 최대 MAX_LIMIT(1000)행 × 순차 쿼리. 메모이즈 없음. [검증 confirmed, 단 erpCanManageCompany false면 early-return — '회사관리 권한 보유 비admin' 경로에서 발생] (=lib-12)
- **sql-03 [코드오류]** `lib/db/functions/inventory.ts:205-256` — `atomicStockConsumeWithLog` db.transaction() — D1 미지원, stock-consume 라우트 프로덕션 불능. [검증 confirmed] (=lib-01, critical로 집계)
- **sql-05 [코드오류]** `d1/query/route.ts:288-292` — `buildSelectSql`이 limitSql+rangeSql 무조건 연결. PayloadSchema에 상호배제 refine 없음 → `.limit()`+`.range()` 동시 호출 시 `LIMIT n LIMIT m OFFSET k` 잘못된 SQLite → 500(잠복). [검증 confirmed major]
- **sql-06 [성능]** `d1/query/route.ts:353-367` — count 경로가 columns/limit/range 비우고 전 행 로드 후 filterByPolicy. messages는 PUBLIC이라 필터 무의미한데도 전량 적재, MAX_LIMIT cap도 제거 → 무제한 로드. [검증 confirmed major] (=lib-03)

## MINOR
| ID | 파일:라인 | 분류 | 내용 |
|---|---|---|---|
| sql-04 | lib/db/functions/inventory.ts:100-163 | 죽은코드 | `atomicStockTransfer` 호출처 0(주석뿐), db.transaction이라 D1 미동작 — 사장 코드 |
| sql-07 | d1/mutate/route.ts:137-138 | 중복 | LIKE ESCAPE 처리 query↔mutate 불일치 (=lib-09) |
| sql-08 | lib/db/migrations/meta/_journal.json:4-25 | SQL오류 | journal이 0000/0009/0010만, 디스크는 0001~0012 다른 이름. 0000 전체 주석처리(136 CREATE TABLE 무실행), 0010_married_stardust 파일 부재(실파일 0010_company_payroll_policies). drizzle-kit migrate 적용 불가 — 신규 환경 부트스트랩 위험 |
| sql-09 | lib/db/schema.ts:395-403 | 의미없는 | `chat_typing_status`가 라이브 D1의 복합 PK(room_id,user_id) 누락 → schema.ts가 진실원 아님(드리프트). 코드는 동작하나 generate 도구 충돌타깃 오해 |
| sql-10 | app/api/admin/audit/_shared.ts:224-227 | 코드오류 | 감사 '심야(00~05시)' 판정이 `d.getHours()`=서버 UTC 기준 → KST 09~14시(업무시간)를 심야로 오표시. '비정상 시간' 신호 무의미 |

## ⚠️ 의도된 MSO 설계로 재분류 (결함 아님)
- ~~**PUBLIC_ALL 테넌트 격리 부재**~~ `policies.ts:179` — `staff_members`·`employment_contracts`·`staff_evaluations` 등에 select/insert/update/delete=PUBLIC(회사 필터 없음, ✅확인). **MSO가 전 회사를 운영 대행하므로 회사 간 CRUD는 의도된 설계**(읽기·쓰기 모두, 2026-06-10 사용자 확인). 보안 결함 아님 → 메모리 `[[mso-cross-company-visibility]]`. (1차 sql 패스의 major 지목은 오판)

## 1차 Fable5 sql 패스에서만 나온 유효 발견(흡수 — 미검증, Opus 일부 확인)
- **미존재 테이블** `leave_policies`(CompanyLeaveTab.tsx:84 → 휴가규칙 항상 폴백), `work_type_change_history`(hr-history-ledger.ts:151 → 인사이력 항상 0건). schema/d1_schema_final.sql 부재 확인. nurse_schedules(hr-01)와 동일 패턴. **(이건 유효 — 무음 기능불능)**
- **POLICY_REGISTRY 죽은 whitelist**: profiles·patient_prescriptions·attendance_records·document_submissions·work_schedules·org_chart_nodes — 실테이블·호출처 0인 미사용 등록 항목(정리 권장, 위험도 낮음).
