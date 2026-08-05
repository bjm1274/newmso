import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';
// SSOT size: @/lib/upload-constants
import { MAX_FILE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from '@/lib/upload-constants';
import {
  ALLOWED_APPLICATION_MIME_TYPES,
  hasBlockedUploadExtension,
  normalizeUploadFileName,
  normalizeUploadMimeType } from '@/lib/upload-mime';

export const dynamic = 'force-dynamic';

const R2_BUCKET = 'pchos-files';

// 8차 D05-013.
// 예전에는 이 라우트에 MIME 검사가 **하나도** 없었다. `file.type` 을 그대로 받아
// R2 content-type 으로 쓰고 저장했으므로, 결재 첨부(면허보수교육제출·서류제출·
// ReportApprovalForm 등 8개 호출부)에서 임의 형식 파일이 그대로 올라갔다.
// 짝 라우트 /api/approval/upload 는 이미 같은 화이트리스트로 고쳐졌는데 이쪽만
// 비어 있어, 같은 '결재 첨부' 가 진입점에 따라 다른 보안 정책을 받는 상태였다.
// 판정은 lib/upload-mime 정본을 공유해 둘이 다시 갈라지지 않게 한다.
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/'];

function isAllowedMime(mime: string): boolean {
  if (ALLOWED_APPLICATION_MIME_TYPES.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function guessFileExtension(fileName: string, mimeType: string): string {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  if (mimeType.startsWith('image/')) return mimeType.split('/')[1] || 'png';
  if (mimeType.startsWith('video/')) return mimeType.split('/')[1] || 'mp4';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  return 'bin';
}

function buildSafeFilePath(fileName: string, mimeType: string): string {
  const ext = guessFileExtension(fileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
  return `approvals/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
}

function validateUploadTarget(fileName: string, mimeType: string, fileSize: number): void {
  if (!fileName.trim()) {
    throw new Error('업로드할 파일 이름이 없습니다.');
  }

  if (mimeType.startsWith('image/')) {
    return;
  }

  if (mimeType.startsWith('video/')) {
    if (fileSize > MAX_VIDEO_SIZE_BYTES) {
      throw new Error('동영상 크기는 200MB 이하여야 합니다.');
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('파일 크기는 200MB 이하여야 합니다.');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 209_715_200) {
      return NextResponse.json({ error: '파일 크기가 200MB를 초과합니다.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const rawFileName = String(file.name || '').trim();
    // 신고 MIME 은 클라이언트가 자유롭게 바꿀 수 있으므로 확장자도 함께 본다.
    if (hasBlockedUploadExtension(rawFileName)) {
      return NextResponse.json(
        { error: '실행 파일 형식은 첨부할 수 없습니다.' },
        { status: 415 },
      );
    }
    const mimeType = normalizeUploadMimeType(rawFileName, file.type ?? '');
    if (!isAllowedMime(mimeType)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다: ${mimeType}` },
        { status: 415 },
      );
    }

    const normalizedFileName = normalizeUploadFileName(rawFileName, mimeType);
    validateUploadTarget(normalizedFileName, mimeType, file.size);

    const filePath = buildSafeFilePath(normalizedFileName, mimeType);
    const arrayBuffer = await file.arrayBuffer();

    const uploaded = await uploadToR2(R2_BUCKET, filePath, Buffer.from(arrayBuffer), mimeType);

    return NextResponse.json({
      success: true,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      path: uploaded.path,
      fileName: normalizedFileName,
      mimeType,
      size: file.size,
      url: uploaded.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '결재 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
