import { NextRequest, NextResponse } from 'next/server';
import { buildResponseContentDisposition, isAllowedPublicStorageUrl } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';
import { isInlineSafeContentType } from '@/app/api/storage/object/content-policy';


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

    // 내부 스토리지 프록시 상대 경로 처리
    if (fileUrl.startsWith('/api/storage/object') || fileUrl.startsWith('/')) {
      const redirectUrl = new URL(fileUrl, request.nextUrl.origin);
      if (inline) {
        redirectUrl.searchParams.set('inline', '1');
      } else {
        redirectUrl.searchParams.set('download', '1');
      }
      if (fileName && fileName !== 'download') {
        redirectUrl.searchParams.set('name', fileName);
      }
      return NextResponse.redirect(redirectUrl);
    }

    // r2.pchos.kr 등 공개 R2 도메인은 내부 프록시로 안전하게 리다이렉트
    if (fileUrl.includes('r2.pchos.kr')) {
      try {
        const parsed = new URL(fileUrl);
        const objectKey = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
        const internalUrl = new URL('/api/storage/object', request.nextUrl.origin);
        internalUrl.searchParams.set('provider', 'r2');
        internalUrl.searchParams.set('bucket', 'pchos-files');
        internalUrl.searchParams.set('key', objectKey);
        if (inline) internalUrl.searchParams.set('inline', '1');
        else internalUrl.searchParams.set('download', '1');
        if (fileName && fileName !== 'download') internalUrl.searchParams.set('name', fileName);
        return NextResponse.redirect(internalUrl);
      } catch {}
    }

    if (!isAllowedUrl(fileUrl)) {
      return NextResponse.json({ error: '허용되지 않는 URL입니다' }, { status: 403 });
    }

    const upstream = await fetch(fileUrl, {
      signal: AbortSignal.timeout(30_000) }).catch(() => null);

    if (!upstream?.ok || !upstream.body) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이 응답도 **앱 오리진**에서 나간다. inline=1 은 buildStorageInlineUrl 의
    // 폴백 경로가 쓰는데, 상류가 신고한 Content-Type 을 그대로 inline 으로 내보내면
    // text/html·image/svg+xml 첨부가 앱 오리진에서 실행된다 —
    // /api/storage/object 와 같은 저장형 XSS 다. 판정은 같은 정본을 쓴다.
    const upstreamContentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const inlineSafe = isInlineSafeContentType(upstreamContentType);

    const headers = new Headers();
    headers.set('Content-Type', inlineSafe ? upstreamContentType : 'application/octet-stream');
    headers.set('Content-Disposition', buildContentDisposition(fileName, inline && inlineSafe));
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
      headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : '다운로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
