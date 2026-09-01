# 11차 · 05 공유캘린더

> 조사일: 2026-08-31 · 1차 조사(미검증).

PC 메인 메뉴 / 모바일은 추가기능 허브 `calendar`. ICS 피드는 PC만.

## 조사 발견

### P0 후보
- **CAL-01** PC `공유캘린더.tsx`가 `localStorage.getItem('user')`를 읽음. 세션 정본은 `erp_user`. props user도 안 넘김 → `sessionUser===null`이면 load가 return하고 **스피너 무한**. 모바일은 props user로 동작. (Oracle/현 로그인 경로에서 PC 캘린더가 안 열리는 유력 원인.)

### P1 후보
- **CAL-02** `!canViewAll && selfId`에서 `selfId===''`이면 본인 필터를 건너뛰어 동사 연차/근무표가 열림.
- **CAL-03** PC는 `id||user_id`, 모바일은 `id`만 — user_id만 있는 세션에서 CAL-02 즉시 발현.

### P2
- 말일 TZ 드롭은 현재 문자열 clamp로 막혀 있음. 남은 것: 법정공휴일 미사용, 비ISO holiday_date, 대기 연차가 UI에는 있고 ICS에는 없음, 키 미설정=허용, `nurse_schedules` 회사 컬럼 없음.

연계: 연차 승인↔전자결재↔인사 leave, 근무표↔인사 attend, 게시판 일정↔04.
