/**
 * 백업 복구 — AuditBackupTab.tsx가 호출하는 실제 경로.
 *
 * 스펙 경로('/api/admin/audit/restore')의 핸들러를 그대로 재노출한다.
 * 처리 방침/권한 게이트는 ../../restore/route.ts 참고.
 */
export { POST, dynamic } from '../../restore/route';
