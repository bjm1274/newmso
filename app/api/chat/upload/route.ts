import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
const CHAT_BUCKET_CANDIDATES = ['pchos-files', 'board-attachments'] as const;

type UploadPlanRequest = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

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

function buildFallbackFileName(mimeType: string, ext: string) {
  if (mimeType.startsWith('image/')) return `image.${ext}`;
  if (mimeType.startsWith('video/')) return `video.${ext}`;
  if (mimeType === 'application/pdf') return `document.${ext}`;
  return `attachment.${ext}`;
}

function normalizeUploadFileName(fileName: string, mimeType: string) {
  const ext = guessFileExtension(fileName, mimeType);
  const rawName = String(fileName || '').trim() || buildFallbackFileName(mimeType, ext);
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || buildFallbackFileName(mimeType, ext);
}

function buildSafeFilePath(fileName: string, mimeType: string) {
  const normalizedFileName = normalizeUploadFileName(fileName, mimeType);
  const ext = guessFileExtension(normalizedFileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';

  // Storage object key는 원본 파일명과 분리해 ASCII-safe 경로만 사용한다.
  // 표시용 원본 이름은 DB의 file_name 필드로 별도 보존한다.
  return `chat/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
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
    throw new Error('파일 크기는 20MB 이하여야 합니다.');
  }
}

async function createSignedUploadPlan(
  supabase: any,
  payload: UploadPlanRequest,
) {
  const mimeType = String(payload.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileName = normalizeUploadFileName(String(payload.fileName || '').trim(), mimeType);
  const fileSize = Number(payload.fileSize || 0);

  validateUploadTarget(fileName, mimeType, fileSize);

  let lastError: unknown = null;
  const filePath = buildSafeFilePath(fileName, mimeType);

  for (const bucket of CHAT_BUCKET_CANDIDATES) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);

    if (!error && data?.token) {
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return NextResponse.json({
        success: true,
        bucket,
        path: filePath,
        token: data.token,
        signedUrl: data.signedUrl,
        fileName,
        url: publicUrlData.publicUrl,
      });
    }

    lastError = error;
    if (!isMissingBucketError(error, bucket)) {
      return NextResponse.json(
        { error: error?.message || '파일 업로드 준비에 실패했습니다.' },
        { status: 500 },
      );
    }
  }

  const message =
    (lastError as { message?: string })?.message || '채팅 첨부 업로드용 Storage 버킷을 찾지 못했습니다.';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getAdminClient();
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await request.json().catch(() => ({}))) as UploadPlanRequest;
      return await createSignedUploadPlan(supabase, payload);
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
    let lastError: unknown = null;

    for (const bucket of CHAT_BUCKET_CANDIDATES) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, Buffer.from(arrayBuffer), {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600',
        });

      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return NextResponse.json({
          success: true,
          bucket,
          path: filePath,
          fileName: normalizedFileName,
          url: data.publicUrl,
        });
      }

      lastError = error;
      if (!isMissingBucketError(error, bucket)) {
        return NextResponse.json({ error: error.message || '파일 업로드에 실패했습니다.' }, { status: 500 });
      }
    }

    const message =
      (lastError as { message?: string })?.message || '채팅 첨부 업로드용 Storage 버킷을 찾지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '채팅 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
