import { NextRequest, NextResponse } from 'next/server';
import {
  createR2DownloadUrl,
  getConfiguredR2ChatBucket,
} from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const signedUrl = await createR2DownloadUrl(
      bucket,
      objectKey,
      download ? { downloadFileName: fileName } : undefined,
    );
    if (!signedUrl) {
      return NextResponse.json({ error: 'Cloudflare R2 is not configured' }, { status: 500 });
    }
    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '?뚯씪 議고쉶 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
