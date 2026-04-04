import { NextRequest, NextResponse } from 'next/server';
import {
  buildResponseContentDisposition,
  createR2DownloadUrl,
  getConfiguredR2ChatBucket,
} from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildInlineContentDisposition(rawName: string): string {
  const normalizedName = String(rawName || 'download');
  const ascii = normalizedName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(normalizedName);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = String(request.nextUrl.searchParams.get('provider') || '').trim().toLowerCase();
    const bucket = String(request.nextUrl.searchParams.get('bucket') || '').trim();
    const objectKey = String(request.nextUrl.searchParams.get('key') || '').trim();
    const download = request.nextUrl.searchParams.get('download') === '1';
    const fileName = String(request.nextUrl.searchParams.get('name') || '').trim() || 'download';

    if (provider !== 'r2') {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }

    if (!bucket || !objectKey) {
      return NextResponse.json({ error: 'bucket and key are required' }, { status: 400 });
    }

    const allowedBucket = getConfiguredR2ChatBucket();
    if (!allowedBucket || bucket !== allowedBucket) {
      return NextResponse.json({ error: 'This bucket is not available' }, { status: 403 });
    }

    const signedUrl = await createR2DownloadUrl(bucket, objectKey);
    if (!signedUrl) {
      return NextResponse.json({ error: 'Cloudflare R2 is not configured' }, { status: 500 });
    }

    const upstream = await fetch(signedUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: '파일을 불러오지 못했습니다.' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set(
      'Content-Disposition',
      download ? buildResponseContentDisposition(fileName) : buildInlineContentDisposition(fileName),
    );
    headers.set('Cache-Control', download ? 'private, max-age=3600' : 'private, max-age=600');
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
  } catch (error) {
    const message = error instanceof Error ? error.message : '?뚯씪 議고쉶 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
