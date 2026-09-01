# 11차 · 01 내정보

> 조사일: 2026-08-31 · 대상: `D:\newmso` 현재 워크트리  
> 이 문서는 **메뉴 단위 1차 조사**다. P0/P1 확정은 전 메뉴 종료 후 `13_검증게이트.md`에서 반증한다.  
> 10차 문서는 가설일 뿐, 아래 인용은 이번 라운드가 연 파일이다.

## 1. 이 메뉴가 실제로 하는 일

PC 마이페이지는 개인 ESS 허브다.

| 기능 | PC | 모바일 |
|------|----|--------|
| 프로필·KPI 홈 | `마이페이지/index.tsx` | `모바일/내정보/홈.tsx` |
| 출퇴근 GPS | `출퇴근기록/` | `출퇴근체크인.tsx` |
| 연차 요약/내역 | `연차휴가내역.tsx` (홈 KPI) | `연차.tsx` |
| 할일 | `나의할일.tsx` | `나의할일.tsx` |
| 서류제출·면허보수교육 | `서류제출.tsx` | 동일 컴포넌트 (`docs`) |
| 급여명세·증명서 (비번 게이트) | `급여명세서/` + `증명서관리.tsx` | `records` → 동일 Hub |
| 프로필 수정 (ESS) | 프로필카드 | `정보수정.tsx` |
| 즐겨찾기/단축키 | `즐겨찾기설정.ts` | 빠른메뉴 로컬만 (비연동) |
| 알림함 | 마이페이지 탭 | 바텀탭 `notif` |
| 근로계약 전자서명 | 홈 대기 계약 | 셸 이벤트 |
| 출퇴근 정정·휴게/외근 | 있음 | **없음** |
| 퇴직자 출퇴근·연차 차단 | KPI 클릭 차단 | **없음** |

## 2. 읽은 파일

### PC
`마이페이지/index.tsx`, `certificate-print-utils.ts`, `useGlobalShortcuts.ts`, `나의할일.tsx`, `단축키설정.ts`, `마이페이지공통섹션.tsx`, `면허보수교육제출.tsx`, `서류제출.tsx`, `연차휴가내역.tsx`, `즐겨찾기설정.ts`, `증명서관리.tsx`, `프로필카드.tsx`, `홈탭헤더.tsx`, `급여명세서/index.tsx`, `출퇴근기록/{attendance-utils,checkin-utils,commute-types,index,late-status}.ts(x)`, `프로필카드/{format-utils,InfoItems,types}.*`

목록에 있었으나 **디스크에 없음**: `급여명세서뷰.tsx`, `출퇴근맵.tsx`, `출퇴근시트.tsx` (실제는 `모바일명세서.tsx`, `출퇴근모달.tsx`, `출퇴근차트.tsx`).

### 모바일
`내정보/{index,cert-issue,data-hooks,doc-submit,나의할일,알림설정,알림탭,연차,정보수정,출퇴근체크인,홈}.*`

### API / lib
`app/api/attendance/geo-verify/route.ts` (attendance 하위 이 파일뿐), `staff/profile-photo/upload`, `submission/upload`, `approvals/upload`, `admin/annual-leave/sync`, `annual-leave/summary`, `profile-change-request`, `contracts/sign-complete`, `auth/{session,change-password,verify-password}`, `license-ce`, `notifications/*`, `lib/{annual-leave-summary,annual-leave-ledger,active-staff,use-resolved-staff-id,contract-sign-complete,client-logout,access-control,profile-change-request,profile-photo,cloudflare-runtime,db/get-binding,db/auth/policies}`.

## 3. 조사 발견 (미검증)

### P0 후보

| ID | 제목 | 위치 | 증거 요지 | 반증조건 |
|----|------|------|-----------|----------|
| MY-01 | 출퇴근 쓰기가 geo-verify에 묶여 있지 않음. `bypass_gps`·무좌표·검증 실패여도 INSERT | `출퇴근체크인.tsx:265-348`, PC `출퇴근기록/index.tsx` bypass, `geo-verify/route.ts:145-166` 차단은 `out_of_range`만 | 서버는 audit만 하고 `blocked`가 안 열림. 실제 기록은 `/api/d1/mutate` `attendance` | mutate가 geo 토큰을 강제하거나, 무좌표/`client_bypass`를 `blocked:true`로 바꾸면 거짓 |

### P1 후보

| ID | 제목 | 위치 | 반증조건 |
|----|------|------|----------|
| MY-02 | geo-verify 실패/오프라인이면 단말 시계로 기록, 지각 판정 `'정상'` 폴백 | 모바일 `출퇴근체크인.tsx:296-400` | 실패 시 쓰기 거절 또는 서버시각 강제 |
| MY-03 | PC 출근 날짜키·지각이 `formatLocalDateKey` / `getHours()`라 KST 월집계와 어긋남 | PC `출퇴근기록/index.tsx:154` 부근 | `formatKoreanDateKey`/`getKoreanMinutesOfDay`만 쓰면 거짓 |
| MY-04 | 모바일은 퇴직자에게 출퇴근·연차 차단 없음 (`isActiveStaff` 계산 후 미사용) | `홈.tsx:169`, `출퇴근체크인.tsx:333` | mutate가 퇴사 status를 거부하거나 메뉴를 숨기면 거짓 |
| MY-05 | 서류제출 탭은 UI/딥링크가 열리고, 즐겨찾기만 `hr_문서보관함`으로 막힘 | `access-control.ts:535`, `마이페이지/index.tsx` 탭바 | `hr_문서보관함` 없는 직원에게 서류제출이 안 열리면 거짓 |
| MY-06 | `open_mypage_tab`이 records 외 탭을 권한 없이 연다 | `page.tsx` `openMyPageTab`, `applyInitialTab` | documents/commute 딥링크가 거부 계정에서 홈으로 떨어지면 거짓 |
| MY-07 | 즐겨찾기 HR/재고 맵이 한글 레거시만. 영문 `payroll`/`attend`는 메뉴 권한만으로 fail-open | `즐겨찾기설정.ts:302-325` vs `SUB_MENUS` 영문 id | picker에 급여가 안 보이거나 클릭 시 허용 탭으로만 떨어지면 내비 우회만 |
| MY-08 | 모바일 알림 토글 키 `hr` vs 런타임 `attendance`/`인사` — 꺼도 푸시 유지 | `알림설정.tsx:388` vs `settings.ts` | 필터가 `hr`을 매핑하면 거짓 |
| MY-09 | 연차 sync 쓰기는 `canAccessStaffRecord`만, 회사 필터 없음 (읽기 API는 회사 가드 있음) | `admin/annual-leave/sync/route.ts:11-30` vs `summary/route.ts` | 타사 staffId 403이면 거짓 |
| MY-10 | 프로필 사진 업로드: 클라이언트 `staffId` + HR이면 회사 미검사, `profiles/` public ACL | `profile-photo/upload/route.ts:54-78` | 타사 staffId 403이면 거짓 |
| MY-11 | `GET /api/license-ce` HR이면 전사 목록 (회사 필터 없음) | `license-ce/route.ts:18-67` | 세션 회사로 제한되면 거짓 |
| MY-12 | 계약 서명: `CONTRACT_ENCRYPTION_KEY` 없어도 평문 저장 | `contracts/sign-complete/route.ts:141-177` | 키 없을 때 503이면 거짓 |
| MY-13 | 서류 `created_by: user.id` vs 조회 `resolvedStaffId` — 제출 완료가 안 보일 수 있음 | `서류제출.tsx:213` | 두 id가 항상 같으면 재현 안 됨 |
| MY-14 | 모바일 내정보 라우터는 `records`만 막고 edit/docs/attend는 진입 자유 | `모바일/내정보/index.tsx:39-107` | `mypage_수정:false`로 정보수정 화면이 안 열리면 거짓 |

### P2 / info (요약)

- 홈 근태 KPI 실패를 ‘집계 중’/0으로 침묵
- 홈 헤더 고용형태 `정규직`, 사번 `00123` 하드코딩
- 증명서 인쇄 `issued_at` 없으면 오늘을 발급일로
- 연차 재계산 fetch 실패 swallow 후 reload
- 조퇴를 클라이언트가 `attendance.status` UPDATE
- 카메라 stream cleanup이 stale closure
- 관심 키워드 저장되나 `keywordAlertsEnabled` 기본 false
- 알림함 실패 = “받은 알림이 없습니다”
- 위치 캐시 `maximumAge: 60s`
- 모바일 프로필 사진이 `staff_members` 컬럼을 안 갱신
- 서류가 전용 `submission/upload`가 아니라 `approvals/upload`
- 급여 비밀번호는 UI 게이트뿐, 모바일 `records`는 홈 pwGate 우회 가능
- 계약 서명 알림이 본인에게만
- `mypage_증명서조회` 미설정은 허용 (명시 fail-open)
- PC 탭바가 `getPermittedMypageTabs`를 안 씀. 연차 `permKey`가 `profile`

## 4. PC ↔ 모바일 패리티

빠진 것: PC형 즐겨찾기 연동, 출퇴근 정정·근무상태, 퇴직자 차단, 알림 유형 키 일치.  
있는 것: 면허보수교육, 급여·증명서 허브, 서류, 할일, 프로필 ESS.

## 5. 다음 메뉴로

연계에서 다시 탈 것: 출퇴근 → 인사 근태/결근 크론, 연차 → 전자결재/캘린더, 서류·계약 → 인사 docs, 알림 키 → 알림 메뉴.
