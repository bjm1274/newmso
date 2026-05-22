import { NextRequest, NextResponse } from 'next/server';
import { buildResponseContentDisposition, isAllowedPublicStorageUrl } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';


export const dynamic = 'force-dynamic';

function buildContentDisposition(fileName: string, inline: boolean): string {
  const value = buildResponseContentDisposition(fileName);
  return inline ? value.replace(/^attachment/i, 'inline') : value;
}

function isAllowedUrl(url: string): boolean {
  if (!url) return false;
  try {
    return isAllowedPublicStorageUrl(url);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const fileUrl = String(searchParams.get('url') ?? '').trim();
    const fileName = String(searchParams.get('name') ?? '').trim() || 'download';
    const inline = searchParams.get('inline') === '1';

    if (!fileUrl) {
      return NextResponse.json({ error: 'url 파라미터가 필요합니다' }, { status: 400 });
    }

    if (!isAllowedUrl(fileUrl)) {
      return NextResponse.json({ error: '허용되지 않는 URL입니다' }, { status: 403 });
    }

    const upstream = await fetch(fileUrl, {
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);

    if (!upstream?.ok || !upstream.body) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set('Content-Disposition', buildContentDisposition(fileName, inline));
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
    const message = err instanceof Error ? err.message : '다운로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
