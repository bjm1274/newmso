import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'video/mp4']);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('서버 설정 오류: Supabase URL 또는 Service Role Key가 없습니다.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function getFileExtension(file: File) {
  const rawExtension = file.name.split('.').pop()?.toLowerCase();
  if (rawExtension && /^[a-z0-9]+$/.test(rawExtension)) {
    return rawExtension;
  }

  if (file.type === 'video/mp4') return 'mp4';
  if (file.type === 'image/png') return 'png';
  return 'jpg';
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: '지원하지 않는 파일 형식입니다. JPG, PNG, MP4만 업로드할 수 있습니다.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: '파일 크기는 25MB 이하여야 합니다.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const filePath = `popup_${Date.now()}_${crypto.randomUUID()}.${getFileExtension(file)}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage.from('popups').upload(filePath, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: true,
      cacheControl: '3600',
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from('popups').getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      path: filePath,
      url: data.publicUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '팝업 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
