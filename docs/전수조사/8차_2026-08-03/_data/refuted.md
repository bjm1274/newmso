# 8차 전수조사 — 반증된 주장(REFUTED) 24건

> 감사일: 2026-08-03 · 대상 리비전: `7a7b7c21`
> **이 24건은 수정 대상이 아니다.** 9차 감사에서 같은 주장을 재등록하지 않기 위한 기록이다.
> 판정 근거의 원문은 `_data/merge-log.md` §2, 검증자별 원 판정은 `_data/findings.jsonl` 의 `verifiers` 필드에 보존돼 있다.

REFUTED 는 두 종류다.

- **A. 델타 CLOSED 정규화 (11건)** — 7차 지적이 실제로 닫혔음을 R1 이 확인한 레코드. "닫혔다는 주장이 맞다"는 CONFIRMED 이지만 *열린 결함이 아니므로* 원장에서는 REFUTED 로 정규화했다. R2(V11)가 CLOSED 판정에 재공격을 걸어 뒤집지 못한 것들이다.
- **B. 실제 오탐 (13건)** — R1 이 제기한 결함 주장이 R2 의 falsifier 로 무너진 것. 잔존물이 있어도 원래 주장한 영향과는 다른(대개 위생 수준) 것이다.

---

## A. 델타 CLOSED 정규화 (11건) — 7차 지적이 실제로 닫힘

| id | 제목 | 반증 근거 | 검증자 |
|---|---|---|---|
| `D02-013` | [7차 A1-01] mutate 라우트 notifications INSERT 푸시 팬아웃 구현 확인 — 수정 완료 | 정말 닫혔다. conflict(upsert) 경로도 같은 insert 블록 안이라 팬아웃을 공유한다. 잔여는 INSERT OR IGNORE 로 실제 행이 안 생겨도 푸시가 나갈 수 있는 위생 수준. | V03=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D03-D02` | [7차 A2-02] 서류제출/계약서명 불능(document_repository ADMIN_ONLY_ALL) — 정책 재분류로 해소 | 정말 닫혔다. update/delete 는 ADMIN_OR_MANAGER 지만 이 화면에는 수정·삭제 경로가 없어(grep 0건) 새 사멸을 만들지 않는다. | V04=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D03-D03` | [7차 A2-03] 할일(todos) 전면 불능 — SELF_ONLY 명시 정책으로 해소 | 정말 닫혔다. 잔여 리스크는 과거 데이터의 user_id 값이며 코드 결함이 아니다. | V04=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D03-D04` | [7차 A2-04] 본인 증명서 조회 불능(certificate_issuances) — STAFF_IN_SCOPE/SELF insert 로 해소 | 정책 결함은 정말 닫혔다. 사용자 체감 미복구는 별건(D03-005)이며 본 레코드 범위 밖. | V04=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D03-D05` | [7차 A2-05] 연차 summary IDOR — 세션 + canAccessStaffRecord 게이트로 해소 | 정말 닫혔다. 권한자(hr/admin)의 대상 해석 모호성은 D03-D07 로 분리 추적. | V04=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D03-D06` | [7차 A7-01] export-csv 무인증 PII 유출 — 관리자 게이트 추가로 해소 | 정말 닫혔다. | V04=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D04-102` | [7차 A8-02 델타] contract_templates PUBLIC_ALL(계약본문·직인 임의 변조) — 정책 계층에서 수정 확인 | 정말 닫혔다. 잔여는 회사 스코프 부재(A사 hr 이 B사 양식·직인을 수정 가능)인데 7차 지적 범위 밖의 별개 위생 사안. | V05=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D06-018` | [A4-41 델타] 푸시 큐 드레인 라이브락 — 수정 완료(CLOSED) | 정말 닫혔다. next_attempt_at DEFAULT CURRENT_TIMESTAMP(공백형)와 ISO 문자열 비교도 공백(0x20)<T(0x54) 라 신규 job 이 선택에서 배제되지 않음을 확인했다. | V03=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D08-027` | [7차 A11-01] data-reset 의 curl 우회는 닫혔다 — 서버가 보안암호(bcrypt)와 확인 문구를 재검증 | 정말 닫혔다. rate-limit 부재는 이미 관리자 세션을 쥔 공격자에 한정된 2차 방어 약화라 P2 위생. | V02=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D08-028` | [7차 A11-02] audit_logs 무조건 전량 삭제·무기록은 닫혔다 — system_logs 타입에 한정되고 삭제 후 감사 기록을 남긴다 | 정말 닫혔다. 시각 형식 회귀와 audit INSERT 실패 무시(catch)는 별건(D08-012)으로 분리 추적이 맞다. | V02=CONFIRMED/P2 / V11=REFUTED/P2 |
| `D11-901` | [Pass B] cc37f96f '복원 부분실패를 성공보고' 수정 — CLOSED (청크 루프에 실패수집+재시도+exit 1 확인) | 정말 닫혔다. 5종이 여전히 구 DB(pchos-d1)를 겨누는 문제는 본 커밋 범위 밖(D11-019). | V08=CONFIRMED/P2 / V11=REFUTED/P2 |

## B. 실제 오탐 (13건) — R1 주장이 R2 반증으로 무너짐

| id | 제목 | 반증 근거 | 검증자 |
|---|---|---|---|
| `D01-013` | work-shifts 두 라우트가 세션 토큰에서 제거되는 hr_근무형태 키로 권한을 판정 → 근무형태 담당자가 401 | 오탐. 잔존물은 (a) 부여 불가 키를 보는 죽은 조건 2곳, (b) 권한 부족을 401 로 반환해 클라이언트가 세션 만료로 오인할 수 있는 상태코드 오용 — 둘 다 위생(P2). | V01=REFUTED/P2 / V12=CONFIRMED/P2 |
| `D01-020` | /api/notifications/push-config 는 전 라우트 중 유일하게 게이트가 전혀 없음 (반환값은 VAPID 공개키) | 오탐. 남는 것은 '모든 API 는 게이트를 갖는다' 불변식의 예외를 코드 주석/테스트로 명시하지 않은 문서화 누락뿐. | V01=REFUTED/P2 / V12=REFUTED/P2 |
| `D01-022` | /api/notifications/chat-push-flush 가 임의 인증 사용자에게 전역 푸시 큐 드레인을 허용 (의도적이나 남용 여지) | 오탐. '순서·시점 조작' 은 CAS 와 stale 필터로 성립하지 않고, 자원 소모는 30회/분·25건 상한으로 제한된다. 의도된 설계. | V01=REFUTED/P2 |
| `D03-008` | getStaffLeaveContext 의 name/employee_no OR 매칭 — 회사 무관 limit 1 로 동명이인/사번 충돌 시 타인 원장 접근 | 보안(권한 우회) 주장은 반증. 남는 것은 인사담당자가 이름/사번을 넘겼을 때 임의 1건이 선택되는 대상 해석 모호성 — 위생 수준 P2. | V04=REFUTED/P2 |
| `D03-013` | staff-shift-resolver 1단계(근태 기반 shift_id 해석)가 부재 컬럼 참조로 상시 실패 | 영향 주장 반증. 남는 것은 부재 컬럼을 참조하는 죽은 코드라는 위생 문제 → P2. | V04=REFUTED/P2 / V12=CONFIRMED/P2 |
| `D03-023` | attendance-sync toModernStatus 가 미지정 상태('연차'·'외근' 등)를 일괄 'present' 로 매핑 | 오염 주장 반증. 방어적으로 'other' 매핑을 두는 것은 위생 개선 수준(P2). | V04=REFUTED/P2 |
| `D04-019` | 급여 리마인더 — payrollDay가 그 달에 없는 날짜(29~31)면 해당 월 알림 자체가 스킵 | 상위 가드(sanitizeSettings)가 문제를 원천 차단. 오탐. | V05=REFUTED/P2 |
| `D04-022` | 원천징수 신고 파일 빌드 — staffMap에 없는 직원 레코드를 조용히 제외(신고 누락 위험) | 주장된 "퇴사자 지급분 조용한 누락"은 이 드롭 분기가 아니라 staffs prop 자체의 구성 방식에서 올 수 있는 별개 문제로, 이 finding 이 특정한 결함은 오탐이다. | V05=REFUTED/P2 |
| `D05-012` | 결재선에 같은 사람이 두 번 포함되면 중복 제거로 단계가 사라져 그 사람의 2회차 결재가 건너뛰어진다 | 저장 경로(중복 미제거)와 판정 경로(중복 제거)의 비대칭은 위생 이슈로 남지만, 주장된 오동작 시나리오는 상위 UI 가드로 차단되어 성립하지 않는다. | V06=REFUTED/P2 |
| `D05-018` | [담당 밖] leave_requests 정책의 본인 insert 제한과 모바일 선삽입 흐름이 실제로 맞물리는지 미검증 — D06/인사 도메인에서 확인 필요 | crossover 확인 요청 자체가 해소됐다. 결함 아님. (별개로 반려·회수 시 그 '대기' 행이 정리되지 않는 문제는 D05-010 으로 따로 성립한다.) | V06=REFUTED/P2 |
| `D08-020` | lib/system-master-staff-query.ts 는 어디서도 쓰이지 않는 Postgres 시절 잔재 | '어디서도 쓰이지 않는다'는 주장은 무너진다. 'app 런타임 미사용 + PG 오류코드 잔재' 라는 축소된 형태의 위생 지적만 남으므로 제안된 '파일 삭제' 는 테스트를 깨뜨린다. | V02=REFUTED/P2 / V12=CONFIRMED/P2 |
| `D10-010` | updated_at 헬퍼 이중화: withUpdatedAt 은 ISO, nowSqlite 는 CURRENT_TIMESTAMP(공백형) — 같은 컬럼에 두 형식 주입 | claim 의 핵심 주장(두 형식 동시 주입)이 반증됨. 남는 것은 미사용 export 라는 dead-code 위생 항목이므로 별도 결함으로 유지할 실익이 낮다. | V07=REFUTED/P2 |
| `D10-012` | unified-leave-ledger 의 occurredOn 폴백이 created_at(UTC 공백형)의 날짜부를 그대로 사용 — KST 새벽 신청 건이 전날 발생일로 귀속 | 방어적 폴백의 시간대 처리가 미흡한 것은 맞으나 실행 경로가 없어 결함으로 성립하지 않는다. | V07=REFUTED/P2 |

---

## 9차를 위한 주의점

1. **B 그룹 13건 중 8건은 "결함은 없지만 잔존물은 있다"** — 죽은 조건(`D01-013`), 죽은 코드(`D03-013`·`D08-020`·`D10-010`), 미사용 export, 상태코드 오용 등. 9차에서 이것들을 다시 "기능 결함"으로 승격하지 말 것. 위생(P2) 이상은 근거가 새로 나와야 한다.
2. **`D08-020` 은 "삭제하라"는 제안이 위험했다** — `lib/system-master-staff-query.ts` 는 `system-master-route-compat.desktop.spec.ts:2` 가 import 한다. 삭제하면 테스트가 깨진다. "프로덕션 참조 0"이라는 축소된 형태(`D13-002`)만 CONFIRMED 로 살아 있다.
3. **A 그룹은 "CLOSED 이므로 안전"이 아니다** — `D01-D05`(A12-02) 처럼 query 경로는 닫혔으나 mutate 경로에 동일 오라클이 남은 사례가 있다. CLOSED 판정은 *인용된 경로*에 대한 것이며, 같은 결함 클래스의 다른 진입점은 별도 항목으로 등록돼 있다.
