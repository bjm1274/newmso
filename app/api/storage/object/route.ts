import { NextRequest, NextResponse } from 'next/server';
import {
  createR2DownloadUrl,
  getConfiguredR2ChatBucket,
} from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';
import { assertChatRoomMember } from '@/lib/chat-room-membership';
import { getD1Binding, getD1Drizzle } from '@/lib/db';


export const dynamic = 'force-dynamic';

function getPublicBaseUrlInternal(): string {
  return String(
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = String(request.nextUrl.searchParams.get('provider') || '').trim().toLowerCase();
    const bucket = String(request.nextUrl.searchParams.get('bucket') || '').trim();
    const objectKey = String(request.nextUrl.searchParams.get('key') || '').trim().split('?')[0];
    const download = request.nextUrl.searchParams.get('download') === '1';
    const proxy = request.nextUrl.searchParams.get('proxy') === '1';
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

    // 채팅 객체 경로일 경우 대화방 멤버십 ACL 검증 (chat/room_id/filename 패턴)
    if (objectKey.startsWith('chat/') || objectKey.includes('/chat/')) {
      const parts = objectKey.split('/');
      const chatIdx = parts.findIndex((p) => p === 'chat');
      const roomIdCandidate = chatIdx >= 0 && parts.length > chatIdx + 1 ? parts[chatIdx + 1] : null;
      if (roomIdCandidate && roomIdCandidate.length > 20) {
        const userId = String(session.user.id || session.user.user_id || '').trim();
        const role = String(session.user.role || '').toLowerCase();
        const isMaster = Boolean(session.user.is_master || session.user.is_admin);
        if (!isMaster && role !== 'admin') {
          const d1 = await getD1Binding();
          if (d1) {
            const db = getD1Drizzle(d1);
            const mem = await assertChatRoomMember(db, roomIdCandidate, userId);
            if (!mem.ok) {
              return NextResponse.json({ error: '해당 대화방 첨부파일 접근 권한이 없습니다.' }, { status: 403 });
            }
          }
        }
      }
    }

    // R2 custom domain이 설정돼 있으면 인라인 보기는 R2 CDN으로 직접 redirect
    // (Workers 응답 본문 부담 제거, 브라우저가 redirect 자체를 캐싱).
    // 다운로드 요청은 Content-Disposition을 강제해야 하므로 기존 프록시 경로 유지.
    const publicBaseUrl = getPublicBaseUrlInternal();
    if (publicBaseUrl && !download && !proxy) {
      const target = `${publicBaseUrl}/${encodeObjectKey(objectKey)}`;
      return NextResponse.redirect(target, {
        status: 302,
        headers: {
          // 객체 키가 UUID라 영구 불변 → 브라우저 redirect 캐시 길게 유지
          'Cache-Control': 'public, max-age=86400, immutable' } });
    }

    const signedUrl = await createR2DownloadUrl(bucket, objectKey);
    if (!signedUrl) {
      return NextResponse.json({ error: 'Cloudflare R2 is not configured' }, { status: 500 });
    }

    // 스트리밍 프록시: R2에서 직접 가져와서 바이트를 전달 (CORS 우회)
    const upstream = await fetch(signedUrl);
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Failed to fetch from storage' }, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff' };
    if (contentLength) headers['Content-Length'] = contentLength;
    if (download) {
      const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
      const encoded = encodeURIComponent(fileName);
      headers['Content-Disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
    }

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : '스토리지 접근 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
