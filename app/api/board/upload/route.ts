import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canAccessBoard } from '@/lib/access-control';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser,
} from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;   // 일반 파일: 50MB
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 동영상: 200MB
const BOARD_BUCKET_CANDIDATES = ['board-attachments', 'pchos-files'] as const;

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

  if (mimeType.includes('/')) {
    const guessed = mimeType.split('/')[1]?.toLowerCase();
    if (guessed) return guessed;
  }

  return 'bin';
}

function buildSafeFilePath(fileName: string, mimeType: string) {
  const ext = guessFileExtension(fileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
  return `board/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
}

function detectAttachmentType(fileName: string, mimeType: string) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';

  const ext = guessFileExtension(fileName, mimeType);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

function isMissingBucketError(error: unknown, bucketName: string) {
  const message = String(
    (error as { message?: string; details?: string })?.message ||
      (error as { message?: string; details?: string })?.details ||
      ''
  ).toLowerCase();

  return (
    (message.includes('bucket') && message.includes('not found')) ||
    message.includes(`bucket ${bucketName.toLowerCase()}`) ||
    message.includes(`bucket_id = '${bucketName.toLowerCase()}'`)
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const boardType = String(formData.get('boardType') || formData.get('boardId') || '').trim();
    const file = formData.get('file');

    if (!boardType) {
      return NextResponse.json({ error: 'boardType is required.' }, { status: 400 });
    }

    const latestUser = await resolveLatestSessionUser(normalizeSessionUser(session.user));
    if (!canAccessBoard(latestUser, boardType, 'write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    if (file.type.startsWith('image/')) {
      // 이미지: 크기 제한 없음
    } else if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_SIZE_BYTES) {
        return NextResponse.json({ error: '동영상 크기는 200MB 이하여야 합니다.' }, { status: 400 });
      }
    } else {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: '파일 크기는 50MB 이하여야 합니다.' }, { status: 400 });
      }
    }

    const supabase = getAdminClient();
    const filePath = buildSafeFilePath(file.name, file.type || 'application/octet-stream');
    const arrayBuffer = await file.arrayBuffer();
    let lastError: unknown = null;

    for (const bucket of BOARD_BUCKET_CANDIDATES) {
      const { error } = await supabase.storage.from(bucket).upload(filePath, Buffer.from(arrayBuffer), {
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
          fileName: file.name,
          type: detectAttachmentType(file.name, file.type || ''),
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
      '게시판 첨부 업로드용 Storage 버킷을 찾지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '게시판 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
