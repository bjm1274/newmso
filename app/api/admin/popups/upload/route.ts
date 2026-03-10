import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'video/mp4']);

type SignedUploadPayload = {
  fileName?: string;
  contentType?: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function getFileExtension(fileName: string, mimeType: string) {
  const rawExtension = fileName.split('.').pop()?.toLowerCase();
  if (rawExtension && /^[a-z0-9]+$/.test(rawExtension)) {
    return rawExtension;
  }

  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

function buildFilePath(fileName: string, mimeType: string) {
  return `popup_${Date.now()}_${crypto.randomUUID()}.${getFileExtension(fileName, mimeType)}`;
}

function getPublicUrl(supabase: ReturnType<typeof getAdminClient>, filePath: string) {
  const { data } = supabase.storage.from('popups').getPublicUrl(filePath);
  return data.publicUrl;
}

function isAllowedType(contentType: string) {
  return ALLOWED_TYPES.has(contentType);
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getAdminClient();
    const requestContentType = request.headers.get('content-type') || '';

    if (requestContentType.includes('application/json')) {
      const payload = (await request.json().catch(() => null)) as SignedUploadPayload | null;
      const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : '';
      const contentType = typeof payload?.contentType === 'string' ? payload.contentType.trim() : '';

      if (!fileName || !contentType) {
        return NextResponse.json({ error: '파일 정보가 올바르지 않습니다.' }, { status: 400 });
      }

      if (!isAllowedType(contentType)) {
        return NextResponse.json(
          { error: 'JPG, PNG, MP4 파일만 업로드할 수 있습니다.' },
          { status: 400 }
        );
      }

      const filePath = buildFilePath(fileName, contentType);
      const { data: signedUpload, error: signedUploadError } = await supabase.storage
        .from('popups')
        .createSignedUploadUrl(filePath, { upsert: true });

      if (signedUploadError || !signedUpload) {
        return NextResponse.json(
          { error: signedUploadError?.message || '업로드 서명을 생성하지 못했습니다.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        path: filePath,
        token: signedUpload.token,
        url: getPublicUrl(supabase, filePath),
        maxFileBytes: MAX_FILE_BYTES,
      });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    if (!isAllowedType(file.type)) {
      return NextResponse.json(
        { error: 'JPG, PNG, MP4 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: '파일 크기는 25MB 이하여야 합니다.' }, { status: 400 });
    }

    const filePath = buildFilePath(file.name, file.type);
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('popups')
      .upload(filePath, Buffer.from(arrayBuffer), {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      path: filePath,
      url: getPublicUrl(supabase, filePath),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '팝업 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
