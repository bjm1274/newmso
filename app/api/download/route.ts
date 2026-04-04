import { NextRequest, NextResponse } from 'next/server';
import { isAllowedPublicStorageUrl } from '@/lib/object-storage';
import { buildPublicStorageDownloadUrl } from '@/lib/object-storage-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

function isAllowedUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (SUPABASE_URL) {
      const base = new URL(SUPABASE_URL);
      if (
        parsed.hostname === base.hostname &&
        parsed.pathname.startsWith('/storage/v1/object/')
      ) {
        return true;
      }
    }
    return isAllowedPublicStorageUrl(url);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const fileUrl = String(searchParams.get('url') ?? '').trim();
    const fileName = String(searchParams.get('name') ?? '').trim() || 'download';

    if (!fileUrl) {
      return NextResponse.json({ error: 'url 파라미터가 필요합니다.' }, { status: 400 });
    }

    if (!isAllowedUrl(fileUrl)) {
      return NextResponse.json({ error: '허용되지 않는 URL입니다.' }, { status: 403 });
    }

    return NextResponse.redirect(buildPublicStorageDownloadUrl(fileUrl, fileName), {
      status: 307,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '다운로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
