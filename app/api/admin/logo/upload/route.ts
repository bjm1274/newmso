import { createAdminImageUploadHandler } from '@/lib/admin-image-upload-route';

/**
 * 회사(병원) 로고 업로드 — 재직증명서 헤더/워터마크용.
 * 직인(/api/admin/seal/upload)과 인증·검증·R2 경로가 완전히 같아 팩토리 하나로 합쳤다(8차 D07-022).
 */
export const POST = createAdminImageUploadHandler({ prefix: 'logos', label: '로고' });
