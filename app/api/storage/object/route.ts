import { NextRequest, NextResponse } from 'next/server';
import { createR2DownloadUrl, getConfiguredR2ChatBucket } from '@/lib/object-storage';
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

    const signedUrl = await createR2DownloadUrl(bucket, objectKey, {
      downloadFileName: download ? fileName : null,
    });
    if (!signedUrl) {
      return NextResponse.json({ error: 'Cloudflare R2 is not configured' }, { status: 500 });
    }

    return NextResponse.redirect(signedUrl, {
      status: 307,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '파일 조회 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
