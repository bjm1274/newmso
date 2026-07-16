import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';
// SSOT size: @/lib/upload-constants
import { MAX_FILE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from '@/lib/upload-constants';

export const dynamic = 'force-dynamic';

const R2_BUCKET = 'pchos-files';

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

function normalizeUploadFileName(fileName: string, mimeType: string): string {
  const ext = guessFileExtension(fileName, mimeType);
  const fallback =
    mimeType.startsWith('image/')
      ? `image.${ext}`
      : mimeType.startsWith('video/')
        ? `video.${ext}`
        : mimeType === 'application/pdf'
          ? `document.${ext}`
          : `attachment.${ext}`;
  const rawName = String(fileName || '').trim() || fallback;
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[ -<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || fallback;
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

    const mimeType = file.type || 'application/octet-stream';
    const normalizedFileName = normalizeUploadFileName(String(file.name || '').trim(), mimeType);
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
