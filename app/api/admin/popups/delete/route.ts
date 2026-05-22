import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { deleteFromR2, isInternalStorageObjectUrl } from '@/lib/object-storage';
import {
  getD1Binding,
  getD1Drizzle,
  popups as popupsTable,
  eq,
} from '@/lib/db';

const R2_BUCKET = 'pchos-files';

type DeletePopupPayload = {
  popupId?: string;
};

type PopupRow = {
  id: string;
  title: string | null;
  media_url: string | null;
};

/**
 * R2에 저장된 팝업 URL에서 object key를 추출한다.
 * - 내부 프록시 URL: /api/storage/object?provider=r2&bucket=...&key=<objectKey>
 * - R2 public URL: https://r2.pchos.kr/<objectKey>
 * - Supabase URL (구 포맷): 추출 불가 → null 반환
 */
function extractR2ObjectKey(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;

  // 내부 프록시 URL
  if (isInternalStorageObjectUrl(mediaUrl)) {
    try {
      const parsed = new URL(mediaUrl, 'https://local-storage-proxy.test');
      return parsed.searchParams.get('key') || null;
    } catch {
      return null;
    }
  }

  // R2 public domain (NEXT_PUBLIC_R2_PUBLIC_BASE_URL 기준)
  const r2PublicBase = String(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (r2PublicBase) {
    try {
      const candidate = new URL(mediaUrl);
      const base = new URL(r2PublicBase);
      if (candidate.hostname === base.hostname) {
        const basePath = base.pathname.replace(/\/+$/, '');
        const fullPath = candidate.pathname;
        const objectKey = basePath ? fullPath.slice(basePath.length + 1) : fullPath.slice(1);
        return objectKey ? decodeURIComponent(objectKey) : null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
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

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ error: '[popups/delete] D1 binding not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    const rows = await db
      .select({ id: popupsTable.id, title: popupsTable.title, media_url: popupsTable.media_url })
      .from(popupsTable)
      .where(eq(popupsTable.id, popupId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: '삭제할 팝업을 찾을 수 없습니다.' }, { status: 404 });
    }
    const typedPopup: PopupRow = {
      id: rows[0].id,
      title: rows[0].title ?? null,
      media_url: rows[0].media_url ?? null,
    };

    await db.delete(popupsTable).where(eq(popupsTable.id, popupId));

    const objectKey = extractR2ObjectKey(typedPopup.media_url);
    if (!objectKey) {
      return NextResponse.json({
        success: true,
        warning: `"${typedPopup.title || '제목 없음'}" 팝업은 삭제되었지만 저장소 파일 경로를 확인하지 못해 파일은 유지되었습니다.`,
      });
    }

    try {
      await deleteFromR2(R2_BUCKET, objectKey);
    } catch (storageError: unknown) {
      const message = storageError instanceof Error ? storageError.message : String(storageError);
      return NextResponse.json({
        success: true,
        warning: `"${typedPopup.title || '제목 없음'}" 팝업은 삭제되었지만 파일 정리에 실패했습니다: ${message}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `"${typedPopup.title || '제목 없음'}" 팝업이 삭제되었습니다.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '팝업 삭제 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
