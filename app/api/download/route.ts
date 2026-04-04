import { NextRequest, NextResponse } from 'next/server';
import { buildResponseContentDisposition, isAllowedPublicStorageUrl } from '@/lib/object-storage';

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
      return NextResponse.json({ error: 'url ?뚮씪誘명꽣媛 ?꾩슂?⑸땲??' }, { status: 400 });
    }

    if (!isAllowedUrl(fileUrl)) {
      return NextResponse.json({ error: '?덉슜?섏? ?딅뒗 URL?낅땲??' }, { status: 403 });
    }

    const upstream = await fetch(fileUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set('Content-Disposition', buildResponseContentDisposition(fileName));
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('X-Content-Type-Options', 'nosniff');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) {
      headers.set('Accept-Ranges', acceptRanges);
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '?ㅼ슫濡쒕뱶 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
