import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/** Supabase Storage URL만 허용 (보안) */
function isAllowedUrl(url: string): boolean {
  if (!SUPABASE_URL || !url) return false;
  try {
    const parsed = new URL(url);
    const base = new URL(SUPABASE_URL);
    return parsed.hostname === base.hostname;
  } catch {
    return false;
  }
}

/** RFC 5987 방식 UTF-8 인코딩 파일명 */
function buildContentDisposition(rawName: string): string {
  // ASCII 범위에서 안전한 문자만 허용 (fallback용)
  const ascii = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(rawName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const fileUrl = decodeURIComponent(searchParams.get('url') ?? '');
    const fileName = decodeURIComponent(searchParams.get('name') ?? '').trim() || 'download';

    if (!fileUrl) {
      return NextResponse.json({ error: 'url 파라미터가 필요합니다.' }, { status: 400 });
    }

    if (!isAllowedUrl(fileUrl)) {
      return NextResponse.json({ error: '허용되지 않는 URL입니다.' }, { status: 403 });
    }

    const upstream = await fetch(fileUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const contentType =
      upstream.headers.get('content-type') || 'application/octet-stream';
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': buildContentDisposition(fileName),
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '다운로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
