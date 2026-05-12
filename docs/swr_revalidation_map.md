# MSO ERP — Fetcher 캐시 키 / 무효화 맵

> 최종 갱신: 2026-05-12  
> 대상 파일: `lib/fetcher.ts`, `lib/data/*.ts`

---

## 1. 개요

### 캐시 시스템 요약

MSO ERP는 SWR / React Query를 직접 사용하지 않는다.  
대신 `lib/fetcher.ts`의 `fetcher()` 함수가 **TTL 기반 in-memory 캐시 + inflight dedup** 를 제공한다.

| 기능 | 설명 |
|---|---|
| TTL 캐시 | `cacheMap`에 `{ value, expiresAt }` 저장. 기본 TTL = **5분(300,000 ms)** |
| Inflight dedup | 동일 key 진행 중 호출은 기존 `Promise` 에 합류. 네트워크 요청 1회로 수렴 |
| `invalidateCache(key)` | 문자열 exact-match 또는 RegExp 패턴으로 캐시 항목 즉시 제거 |
| `clearCache()` | 전체 캐시 초기화 — 로그아웃 / 테스트 전용 |

### `invalidateCache` 패턴

```ts
// 단일 키 무효화 (exact)
invalidateCache('org:teams:SY INC.');

// 네임스페이스 전체 무효화 (RegExp)
invalidateCache(/^org:teams:/);
invalidateCache(/^official-docs:/);
```

### mutation 후 무효화 시점

mutation 함수가 성공(`!error`)을 확인한 즉시 `invalidateCache`를 호출한다.  
그 결과 다음 `fetcher()` 호출 시 캐시 미스가 발생하여 최신 데이터를 다시 가져온다.

---

## 2. 캐시 키 네임스페이스 전체 표

### 2-1. `dashboard:*` — 대시보드 위젯

정의 파일: `lib/data/dashboard-widgets.ts` | TTL: **1분**

| 캐시 키 | 헬퍼 함수 | 대응 Supabase 테이블 | mutation 후 무효화 |
|---|---|---|---|
| `dashboard:staff_members:count:active` | `fetchActiveStaffCount()` | `staff_members` | 직원 입사·퇴사 시 수동 필요 |
| `dashboard:approvals:count:pending` | `fetchPendingApprovalCount()` | `approvals` | 결재 승인·반려 시 수동 필요 |
| `dashboard:inventory:list` | `fetchInventoryItems()` | `inventory` | 재고 mutation 시 수동 필요 |
| `dashboard:attendances:count:checked-in:{date}` | `fetchTodayCheckedInCount()` | `attendances` | 당일 출퇴근 mutation 시 수동 필요 |
| `dashboard:staff_members:leaves:active` | `fetchActiveStaffLeaves()` | `staff_members` | 연차 mutation 시 수동 필요 |
| `dashboard:notifications:recent:{limit}` | `fetchRecentNotifications(limit)` | `notifications` | 알림 생성 시 수동 필요 |

> 대시보드 위젯은 자동 무효화 함수 없음. 위젯 데이터 mutation은 화면 외부에서 발생하며
> TTL(1분) 만료로 자연 갱신되거나, 필요 시 `invalidateCache(/^dashboard:/)` 를 직접 호출한다.

---

### 2-2. `org:*` — 조직(회사·팀)

정의 파일: `lib/data/org.ts` | TTL: **5분**

| 캐시 키 | 헬퍼 함수 | 대응 Supabase 테이블 | mutation 후 무효화 |
|---|---|---|---|
| `org:companies:options` | `fetchCompanyOptions()` | `companies` / `staff_members` | 자동 무효화 없음 (회사 추가는 드묾) |
| `org:teams:{company}` | `fetchOrgTeams(company)` | `org_teams` | `createOrgTeam` / `deleteOrgTeam` → **`invalidateOrgTeams(company?)`** |

**`invalidateOrgTeams(company?)` 동작:**

| 호출 형태 | 무효화 범위 |
|---|---|
| `invalidateOrgTeams('SY INC.')` | `org:teams:SY INC.` 단일 키 |
| `invalidateOrgTeams()` (인자 없음) | `/^org:teams:/` — 모든 회사 팀 캐시 |

---

### 2-3. `staff:*` — 직원

정의 파일: `lib/data/staff.ts` | TTL: **5분**

| 캐시 키 | 헬퍼 함수 | 대응 Supabase 테이블 | mutation 후 무효화 |
|---|---|---|---|
| `staff:basic:all` | `fetchStaffsBasic()` | `staff_members` | 자동 무효화 없음 — 입사·퇴사 시 `invalidateCache('staff:basic:all')` 수동 필요 |
| `staff:historical-names:{sorted-ids}` | `fetchHistoricalStaffNames(ids)` | `audit_logs` | 이력 데이터 불변 — 무효화 불필요 |

> `staff:historical-names:{sorted-ids}` 의 key는 `unresolvedIds`를 정렬·join한 값.  
> 같은 id 집합이라도 순서가 다르면 별도 요청이 되지 않도록 정렬 처리 내장.

---

### 2-4. `chat:*` — 채팅 모니터링

정의 파일: `lib/data/chat-monitoring.ts` | TTL: 방 목록 **1분**, 메시지 **30초**

| 캐시 키 | 헬퍼 함수 | 대응 Supabase 테이블 | mutation 후 무효화 |
|---|---|---|---|
| `chat:rooms:by-staff:{staffId}` | `fetchChatRoomsForStaff(staffId)` | `chat_rooms` | 자동 무효화 없음 (단기 TTL로 자연 갱신) |
| `chat:messages:by-room:{roomId}` | `fetchMessagesForRoom(roomId)` | `messages` | `deleteChatMessage(id, roomId?)` → **`invalidateCache`** |

**`deleteChatMessage(id, roomId?)` 무효화 동작:**

| 호출 형태 | 무효화 범위 |
|---|---|
| `deleteChatMessage(id, 'room-123')` | `chat:messages:by-room:room-123` 단일 키 |
| `deleteChatMessage(id)` (roomId 없음) | `/^chat:messages:by-room:/` — 전체 방 메시지 |

---

### 2-5. `payroll:*` — 급여

정의 파일: `lib/data/payroll.ts` | TTL: **5분**

| 캐시 키 | 헬퍼 함수 | 대응 Supabase 테이블 | mutation 후 무효화 |
|---|---|---|---|
| `payroll:records:by-month:{yearMonth}` | `fetchPayrollRecordsByMonth(yearMonth)` | `payroll_records` | 자동 무효화 없음 — 월말 정산 후 `invalidateCache(/^payroll:records:by-month:/)` 수동 필요 |

> `yearMonth` 형식 예: `"2026-05"`. 형식이 달라지면 별도 캐시 항목으로 분리됨.

---

### 2-6. `official-docs:*` — 공문서 발송대장

정의 파일: `lib/data/official-docs.ts` | TTL: **1분**

| 캐시 키 | 헬퍼 함수 | 대응 Supabase 테이블 | mutation 후 무효화 |
|---|---|---|---|
| `official-docs:list` | `fetchOfficialDocs()` | `official_doc_log` | `updateOfficialDoc` / `deleteOfficialDoc` → **`invalidateOfficialDocs()`** |
| `official-docs:approvals:recent:{limit}` | `fetchRecentApprovalsForOfficial(limit)` | `approvals` | `invalidateOfficialDocs()` |

**`invalidateOfficialDocs()` 동작:** `/^official-docs:/` RegExp으로 네임스페이스 전체 무효화.

---

### 2-7. `v2-attendance:*` — v2 근태 (현재 더미)

정의 파일: `lib/data/v2-attendance.ts` | TTL: **1분**

| 캐시 키 | 헬퍼 함수 | 비고 |
|---|---|---|
| `v2-attendance:employees` | `fetchV2Employees()` | 더미 데이터 — 실 쿼리 전환 예정(T-014) |
| `v2-attendance:today` | `fetchV2TodayRecords()` | 더미 |
| `v2-attendance:monthly` | `fetchV2MonthlyRecords()` | 더미 |
| `v2-attendance:leave-requests` | `fetchV2LeaveRequests()` | 더미 |
| `v2-attendance:leave-balances` | `fetchV2LeaveBalances()` | 더미 |
| `v2-attendance:anomalies` | `fetchV2AnomalyAlerts()` | 더미 |
| `v2-attendance:roster` | `fetchV2RosterCells()` | 더미 |
| `v2-attendance:dept-summaries` | `fetchV2DeptSummaries()` | 더미 |

> 실 데이터 전환(T-014) 후에는 근태 mutation에 대응하는 `invalidateCache(/^v2-attendance:/)` 함수 추가 필요.

---

## 3. Cross-cutting mutation 후 무효화 권장 키

특정 도메인 mutation이 여러 네임스페이스에 영향을 줄 수 있다.  
아래는 권장 무효화 체크리스트다.

### 직원 입사 / 퇴사

```ts
invalidateCache('staff:basic:all');
invalidateCache('dashboard:staff_members:count:active');
invalidateCache('dashboard:staff_members:leaves:active');
```

### 결재 승인 / 반려 / 취소

```ts
invalidateCache('dashboard:approvals:count:pending');
invalidateCache(/^official-docs:approvals:/);
// 또는 전체 official-docs 네임스페이스
invalidateOfficialDocs();
```

### 연차 신청 / 처리

```ts
invalidateCache('dashboard:staff_members:leaves:active');
// v2 전환 후:
invalidateCache(/^v2-attendance:leave/);
```

### 출퇴근 기록 수정

```ts
// 오늘 날짜 key는 동적이므로 RegExp 사용
const today = new Date().toISOString().slice(0, 10);
invalidateCache(`dashboard:attendances:count:checked-in:${today}`);
```

### 재고 수량 변경

```ts
invalidateCache('dashboard:inventory:list');
```

### 알림 발송 (공지·경조사·채팅)

```ts
const limit = 5; // 대시보드 기본 limit
invalidateCache(`dashboard:notifications:recent:${limit}`);
```

---

## 4. TTL 기준표

| 네임스페이스 | TTL | 근거 |
|---|---|---|
| `dashboard:*` | 1분 | 대시보드는 재방문 잦음, 수초 단위 실시간성 불필요 |
| `org:*` | 5분 | 회사·팀 구조는 변경 빈도 낮음 |
| `staff:*` | 5분 | 직원 정보 변경 드묾 |
| `chat:rooms:*` | 1분 | 관리자 모니터링, 짧은 주기 갱신 |
| `chat:messages:*` | 30초 | 실시간성 우선 |
| `payroll:*` | 5분 | 월별 조회, 정산 외 변경 없음 |
| `official-docs:*` | 1분 | mutation 빈도 있음, TTL 짧게 |
| `v2-attendance:*` | 1분 | 더미 단계 — 실 전환 시 재검토 |

---

## 5. 주의사항 (JM5)

1. **캐시 키에 민감정보 포함 금지** — 이메일·전화번호·토큰을 key에 삽입하지 않는다.  
   `staff:historical-names:{sorted-ids}` 처럼 ID(UUID)는 허용하나, 직접 식별 가능한 개인정보는 금지.

2. **동일 key + 다른 filter = 별도 key 필요** — 예: `fetchOrgTeams('A사')`와 `fetchOrgTeams('B사')`는 키가 달라야 한다. 이미 `org:teams:{company}` 패턴으로 처리 중.

3. **TTL이 짧을수록 무효화 부담이 낮다** — 무효화 함수가 없는 네임스페이스는 TTL 내에서 stale 데이터를 허용하는 설계임을 인지한다.

4. **`clearCache()` 는 로그아웃 시만 사용** — 전체 초기화는 다른 화면의 캐시도 날리므로 남용 금지.

5. **RegExp 무효화는 scan 비용 존재** — `cacheMap`을 전체 순회하므로 항목이 수천 개를 초과하면 성능 검토 필요. 현재 규모에서는 문제없음.
