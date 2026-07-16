# 죽은 코드 삭제 기록 (2026-07-16)

## 요약

- 정적 import 그래프 + 메뉴/워크센터 경로 교차 검증 후 **고신뢰 고아 51파일** 삭제.
- `tsc --noEmit` 통과.
- PC/모바일 **의도적 UI 듀얼** 화면(공유캘린더, 마감보고, 나의할일 등)은 유지.

## 삭제 클러스터

### 1. 레거시 근태
- `인사관리서브/근태기록/*` (근태관리메인 + 달력/대시보드/유틸/일괄수정)
- `근태이상통합분석`, `지각조퇴분석`, `조기퇴근감지`
- `휴가신청/근태이상탐지`, `근태차감시뮬레이터`
- `간호근무표.tsx` (AttendWorkcenter thin wrapper)
- `lib/attendance-anomalies.ts`, `attendance-status-meta.ts`, `roster-shift-team-filter.ts`

정본: `AttendWorkcenter`, `AbnormalWorkcenter`, `lib/attendance-abnormal`.

### 2. 레거시 회사관리
- `관리자전용서브/회사관리.tsx`
- `법인카드사용내역`, `인사통합설정`
- `급여기준점검` + 최저임금/비과세한도/비과세항목/법정기준/세율보험/교대제 패널

정본: `CompanyWorkcenter` (+ Card/Payroll/Leave 탭).  
**유지:** `급여월마감잠금` (PayrollDashboard), 모바일 `관리자/회사관리` (CompanyWorkcenter 임베드).

### 3. 단독 고아
- `IssuedCertificateSection`, `StaffFormModal`, `급여정산-Step2Settlement`
- `ApproverTemplateModal`, `보완요청시트`, `DocsStoreSummary`, `RosterGrid`
- `시스템마스터서브`, `직원권한서브`, `역할별대시보드/format-utils`
- `재고 use-stock-data` / `use-stock-shortcuts` / barrel `index`, `모바일/재고/hooks`
- `모바일/내정보/급여명세`, `증명서` (hub 사용)
- `CameraInput`, `PageHeader`, `PullToRefresh`
- `useKoreanImeGuard`, `useOpCheckBoardStream`
- `lib/config`, `lib/types`, `offline-queue-db`, `d1-supabase-compat`, `org-structure-shared`

## 스캔 도구

```bash
node tmp/scan-dead-code.mjs
# → tmp/dead_code_2026-07-16/
```
