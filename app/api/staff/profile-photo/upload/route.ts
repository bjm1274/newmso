import { NextRequest, NextResponse } from 'next/server';
import { buildR2AccessUrl, isR2ChatStorageEnabled, uploadToR2 } from '@/lib/object-storage';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { normalizeUploadMimeType } from '@/lib/upload-mime';
import {
  ACTIVE_CONTENT_UPLOAD_ERROR,
  isActiveContentUpload } from '@/app/api/storage/object/content-policy';

export const dynamic = 'force-dynamic';

const R2_BUCKET = 'pchos-files';
// bmp·avif 는 lib/upload-mime 의 MIME_BY_EXTENSION 에 있는 이미지 형식이라
// 예전 `startsWith('image/')` 경로로 통과하던 것을 그대로 유지한다.
// image/svg+xml 만 빠진다 — SVG 는 `<script>` 를 담을 수 있고 `profiles/` 는
// OBJECT_KEY_ACL 상 **비인증 공개** 프리픽스라, 여기로 올라간 SVG 는 로그인조차
// 필요 없이 앱 오리진에서 열린다.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/avif',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

function buildObjectKey(staffId: string): string {
  return `profiles/${staffId}/avatar`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isR2ChatStorageEnabled()) {
      return NextResponse.json(
        { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BYTES) {
      return NextResponse.json({ error: '프로필 사진은 10MB 이하여야 합니다.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const staffId = String(formData.get('staffId') || '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }
    if (!staffId) {
      return NextResponse.json({ error: 'staffId가 누락되었습니다.' }, { status: 400 });
    }

    // 요청자 본인이거나 관리자·인사담당자만 타인 사진 업로드 가능
    const requestorId = String(session.user.id || '');
    const userPerms = (session.user as { permissions?: Record<string, unknown> })?.permissions || {};
    const hasHrAccess =
      isAdminSession(session.user) ||
      userPerms.hr === true ||
      userPerms.hr_management === true ||
      userPerms.hr_admin === true ||
      userPerms.hr_직원등록 === true ||
      userPerms.hr_구성원 === true ||
      userPerms.menu_hr === true ||
      Object.keys(userPerms).some((k) => userPerms[k] && (k.startsWith('hr_') || k.startsWith('hr:')));

    if (requestorId !== staffId && !hasHrAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 브라우저가 image/jpg·image/x-png 로 신고하거나 아예 비워 보내는 경우가 있어
    // 파일명 확장자로 보충한다(다른 업로드 라우트와 같은 정본을 쓴다).
    const rawFileName = String(file.name || '').trim();
    const mimeType = normalizeUploadMimeType(rawFileName, file.type || '');

    // 예전 조건은 `!ALLOWED_IMAGE_TYPES.has(mime) && !mime.startsWith('image/')` 였다.
    // 뒤쪽 프리픽스 검사가 화이트리스트를 무력화해 image/svg+xml 이 그대로 통과했고,
    // 그 파일은 비인증 공개 프리픽스(profiles/)에서 앱 오리진 문서로 열렸다.
    // 확장자도 함께 본다 — 신고 MIME 은 클라이언트가 정하는 값이다.
    if (!ALLOWED_IMAGE_TYPES.has(mimeType) || isActiveContentUpload(rawFileName, mimeType)) {
      return NextResponse.json(
        {
          error: ALLOWED_IMAGE_TYPES.has(mimeType)
            ? ACTIVE_CONTENT_UPLOAD_ERROR
            : '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '프로필 사진은 10MB 이하여야 합니다.' }, { status: 413 });
    }

    const objectKey = buildObjectKey(staffId);
    const arrayBuffer = await file.arrayBuffer();
    await uploadToR2(R2_BUCKET, objectKey, Buffer.from(arrayBuffer), mimeType);

    const uploadedAt = new Date().toISOString();
    const url = buildR2AccessUrl(R2_BUCKET, objectKey);

    return NextResponse.json({
      success: true,
      path: objectKey,
      url,
      uploadedAt });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '프로필 사진 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
