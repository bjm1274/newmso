import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import {
  buildR2AccessUrl,
  createChatAttachmentUploadPlan,
  isR2ChatStorageEnabled,
  uploadToR2,
} from '@/lib/object-storage';

const R2_BUCKET = 'pchos-files';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'video/mp4']);

type SignedUploadPayload = {
  fileName?: string;
  contentType?: string;
};

function getFileExtension(fileName: string, mimeType: string): string {
  const rawExtension = fileName.split('.').pop()?.toLowerCase();
  if (rawExtension && /^[a-z0-9]+$/.test(rawExtension)) {
    return rawExtension;
  }
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

function buildObjectKey(fileName: string, mimeType: string): string {
  return `popups/popup_${Date.now()}_${crypto.randomUUID()}.${getFileExtension(fileName, mimeType)}`;
}

function isVideoType(contentType: string): boolean {
  return contentType === 'video/mp4';
}

function getMaxFileBytes(contentType: string): number | null {
  return isVideoType(contentType) ? MAX_VIDEO_BYTES : null;
}

function validateFileSize(contentType: string, fileSize: number): void {
  if (isVideoType(contentType) && fileSize > MAX_VIDEO_BYTES) {
    throw new Error('동영상 크기는 200MB 이하여야 합니다.');
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isR2ChatStorageEnabled()) {
      return NextResponse.json(
        { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    const requestContentType = request.headers.get('content-type') || '';

    // JSON 요청: presigned PUT URL 발급 (클라이언트 직접 업로드용, 주로 동영상)
    if (requestContentType.includes('application/json')) {
      const payload = (await request.json().catch(() => null)) as SignedUploadPayload | null;
      const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : '';
      const contentType = typeof payload?.contentType === 'string' ? payload.contentType.trim() : '';

      if (!fileName || !contentType) {
        return NextResponse.json({ error: '파일 정보가 올바르지 않습니다.' }, { status: 400 });
      }
      if (!ALLOWED_TYPES.has(contentType)) {
        return NextResponse.json(
          { error: 'JPG, PNG, MP4 파일만 업로드할 수 있습니다.' },
          { status: 400 },
        );
      }

      const objectKey = buildObjectKey(fileName, contentType);
      const plan = await createChatAttachmentUploadPlan(objectKey, contentType);
      if (!plan) {
        return NextResponse.json(
          { error: 'R2 업로드 서명을 생성하지 못했습니다.' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        provider: 'r2',
        path: plan.path,
        signedUrl: plan.signedUrl,
        headers: plan.headers,
        url: buildR2AccessUrl(R2_BUCKET, objectKey),
        maxFileBytes: getMaxFileBytes(contentType),
      });
    }

    // multipart/form-data: 서버에서 직접 업로드 (이미지)
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 209_715_200) {
      return NextResponse.json({ error: '파일 크기가 200MB를 초과합니다.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'JPG, PNG, MP4 파일만 업로드할 수 있습니다.' },
        { status: 400 },
      );
    }

    validateFileSize(file.type, file.size);

    const objectKey = buildObjectKey(file.name, file.type);
    const arrayBuffer = await file.arrayBuffer();
    const uploaded = await uploadToR2(R2_BUCKET, objectKey, Buffer.from(arrayBuffer), file.type);

    return NextResponse.json({
      success: true,
      provider: 'r2',
      path: uploaded.path,
      url: buildR2AccessUrl(R2_BUCKET, objectKey),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '팝업 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
