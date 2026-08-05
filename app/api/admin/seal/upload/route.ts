import { createAdminImageUploadHandler } from '@/lib/admin-image-upload-route';

/**
 * 회사 직인 업로드 — 증명서 날인용.
 * 로고(/api/admin/logo/upload)와 인증·검증·R2 경로가 완전히 같아 팩토리 하나로 합쳤다(8차 D07-022).
 */
export const POST = createAdminImageUploadHandler({ prefix: 'seals', label: '직인' });
