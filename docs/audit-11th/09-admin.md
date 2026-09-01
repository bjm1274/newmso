# 11차 · 09 관리자

> 조사일: 2026-08-31 · 1차 조사(미검증). 워크센터 exec/company/roles/ops/forms/audit + 시스템마스터.

## 조사 발견

### P0 후보
- **AD-01** 권한 에디터가 unset `admin_*`를 끈 것처럼 보이지만 `isAdminUser`면 미설정=허용. 백업/초기화/마스터 키도 `admin` 별칭.
- **AD-02** `/api/admin/staff-permission`이 `system_master` JSON 플래그를 그대로 복사 가능.
- **AD-03** Audit 백업·DR이 하드코딩 허구 + restore는 501. 실제 JSON 복원은 클라 upsert로 staff_members까지 덮음.

### P1 후보
- **AD-04** data-reset / reset-staff가 named master가 아니라 `isAdminSession`. 백업 성공이 필수가 아님.
- **AD-05** Exec 대시보드에 staffs/inventory를 안 넘겨 0으로 보임. Ops 토글은 local state.
- **AD-06** 시스템마스터 UI vs API(9999) 불일치. 채팅 삭제는 db-client 직접.
- **AD-07** 결재 양식 관리가 D1 실패 시 localStorage만 저장.

모바일 허브가 동일 위험한 셸을 그대로 띄움.
