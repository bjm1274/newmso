import { NextRequest, NextResponse } from 'next/server';
import { buildR2AccessUrl, isR2ChatStorageEnabled, uploadToR2 } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

const R2_BUCKET = 'pchos-files';
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
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

    // 요청자 본인이거나 관리자만 타인 사진 업로드 가능
    const requestorId = String(session.user.id || '');
    const isAdmin =
      session.user.role === 'admin' ||
      (session.user as Record<string, unknown>).is_admin === true ||
      (session.user as any).permissions?.hr === true ||
      (session.user as any).permissions?.mso === true;
    if (requestorId !== staffId && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_IMAGE_TYPES.has(mimeType) && !mimeType.startsWith('image/')) {
      return NextResponse.json(
        { error: '이미지 파일만 업로드할 수 있습니다.' },
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
