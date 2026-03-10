import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

type DeletePopupPayload = {
  popupId?: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return {
    supabase: createClient(supabaseUrl, serviceKey),
    supabaseUrl,
  };
}

function extractPopupStoragePath(mediaUrl: string | null | undefined, supabaseUrl: string) {
  if (!mediaUrl) return null;

  const normalizedBase = supabaseUrl.replace(/\/+$/, '');
  const prefixes = [
    `${normalizedBase}/storage/v1/object/public/popups/`,
    `${normalizedBase}/storage/v1/object/sign/popups/`,
    `${normalizedBase}/storage/v1/object/authenticated/popups/`,
  ];

  const matchedPrefix = prefixes.find((prefix) => mediaUrl.startsWith(prefix));
  if (!matchedPrefix) return null;

  const relativePath = mediaUrl.slice(matchedPrefix.length).split('?')[0];
  return relativePath ? decodeURIComponent(relativePath) : null;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as DeletePopupPayload | null;
    const popupId = typeof payload?.popupId === 'string' ? payload.popupId.trim() : '';
    if (!popupId) {
      return NextResponse.json({ error: '삭제할 팝업 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    const { supabase, supabaseUrl } = getAdminClient();
    const { data: popup, error: selectError } = await supabase
      .from('popups')
      .select('id, title, media_url')
      .eq('id', popupId)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (!popup) {
      return NextResponse.json({ error: '삭제할 팝업을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('popups')
      .delete()
      .eq('id', popupId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const storagePath = extractPopupStoragePath(popup.media_url, supabaseUrl);
    if (!storagePath) {
      return NextResponse.json({
        success: true,
        warning: `"${popup.title || '제목 없음'}" 팝업은 삭제되었지만 저장소 파일 경로를 확인하지 못해 파일은 유지되었습니다.`,
      });
    }

    const { error: storageError } = await supabase.storage
      .from('popups')
      .remove([storagePath]);

    if (storageError) {
      return NextResponse.json({
        success: true,
        warning: `"${popup.title || '제목 없음'}" 팝업은 삭제되었지만 파일 정리에 실패했습니다: ${storageError.message}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `"${popup.title || '제목 없음'}" 팝업이 삭제되었습니다.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '팝업 삭제 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
