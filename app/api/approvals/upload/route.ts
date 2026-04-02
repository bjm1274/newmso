import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isR2ChatStorageEnabled,
  uploadChatAttachmentToR2,
} from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
const APPROVAL_BUCKET_CANDIDATES = ['board-attachments', 'pchos-files'] as const;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function guessFileExtension(fileName: string, mimeType: string) {
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

function normalizeUploadFileName(fileName: string, mimeType: string) {
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
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || fallback;
}

function buildSafeFilePath(fileName: string, mimeType: string) {
  const ext = guessFileExtension(fileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
  return `approvals/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
}

function isMissingBucketError(error: unknown, bucketName: string) {
  const message = String(
    (error as { message?: string; details?: string })?.message ||
      (error as { message?: string; details?: string })?.details ||
      '',
  ).toLowerCase();

  return (
    (message.includes('bucket') && message.includes('not found')) ||
    message.includes(`bucket ${bucketName.toLowerCase()}`) ||
    message.includes(`bucket_id = '${bucketName.toLowerCase()}'`)
  );
}

function validateUploadTarget(fileName: string, mimeType: string, fileSize: number) {
  if (!fileName.trim()) {
    throw new Error('업로드할 파일 이름이 없습니다.');
  }

  if (mimeType.startsWith('video/')) {
    if (fileSize > MAX_VIDEO_SIZE_BYTES) {
      throw new Error('동영상 크기는 200MB 이하여야 합니다.');
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('파일 크기는 50MB 이하여야 합니다.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    if (isR2ChatStorageEnabled()) {
      const uploaded = await uploadChatAttachmentToR2(
        filePath,
        Buffer.from(arrayBuffer),
        mimeType,
      );

      return NextResponse.json({
        success: true,
        provider: uploaded.provider,
        bucket: uploaded.bucket,
        path: uploaded.path,
        fileName: normalizedFileName,
        mimeType,
        size: file.size,
        url: uploaded.url,
      });
    }

    const supabase = getAdminClient();
    let lastError: unknown = null;

    for (const bucket of APPROVAL_BUCKET_CANDIDATES) {
      const { error } = await supabase.storage.from(bucket).upload(filePath, Buffer.from(arrayBuffer), {
        contentType: mimeType,
        upsert: false,
        cacheControl: '3600',
      });

      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return NextResponse.json({
          success: true,
          provider: 'supabase',
          bucket,
          path: filePath,
          fileName: normalizedFileName,
          mimeType,
          size: file.size,
          url: data.publicUrl,
        });
      }

      lastError = error;
      if (!isMissingBucketError(error, bucket)) {
        return NextResponse.json({ error: error.message || '파일 업로드에 실패했습니다.' }, { status: 500 });
      }
    }

    const message =
      (lastError as { message?: string })?.message ||
      '결재 첨부 업로드용 Storage 버킷을 찾지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '결재 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
