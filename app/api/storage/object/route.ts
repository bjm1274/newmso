import { NextRequest, NextResponse } from 'next/server';
import {
  createR2DownloadUrl,
  getConfiguredR2ChatBucket,
} from '@/lib/object-storage';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { assertChatRoomMember } from '@/lib/chat-room-membership';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getCloudflareContext } from '@opennextjs/cloudflare';

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

/**
 * 객체 키 프리픽스별 ACL.
 *
 * 예전에는 이 라우트의 ACL 이 `chat/` 하나뿐이었다. 그래서 세션만 있으면
 * 버킷 안의 **아무 키나** 그대로 스트리밍됐다 — 결재 첨부(`approval/`·`approvals/`),
 * 서류제출(`submission/`), 증빙(`certs/`) 은 물론 크론이 올리는 D1 전체 덤프
 * (`backup/24h/...`, `backup/6h/...`)까지 일반 직원 계정으로 내려받을 수 있었다.
 *
 * 이제 프리픽스를 명시 등록하고 **미등록 프리픽스는 관리자만** 접근한다.
 * (완전 거부가 아니라 관리자 허용으로 둔 이유: 과거 업로드분 중 여기 없는
 *  프리픽스가 남아 있을 경우 전면 404 가 되는 대신 관리자가 확인할 수 있어야 한다.
 *  새 프리픽스를 추가하는 업로드 라우트는 반드시 이 표에도 등록할 것.)
 */
type ObjectAclMode = 'public' | 'authenticated' | 'chat';

const OBJECT_KEY_ACL: ReadonlyArray<{ prefix: string; mode: ObjectAclMode }> = [
  // 인증 없이도 <img src>·인쇄창에서 떠야 하는 자산
  { prefix: 'logos/', mode: 'public' },
  { prefix: 'seals/', mode: 'public' },
  { prefix: 'profiles/', mode: 'public' },
  { prefix: 'popups/', mode: 'public' },
  // 대화방 멤버십 검증
  { prefix: 'chat/', mode: 'chat' },
  // 로그인 사용자 공용 (도메인별 세부 ACL 은 후속 과제)
  { prefix: 'approval/', mode: 'authenticated' },
  { prefix: 'approvals/', mode: 'authenticated' },
  { prefix: 'board/', mode: 'authenticated' },
  { prefix: 'submission/', mode: 'authenticated' },
  { prefix: 'submissions/', mode: 'authenticated' },
  { prefix: 'contracts/', mode: 'authenticated' },
  { prefix: 'certs/', mode: 'authenticated' },
];

function resolveObjectAclMode(objectKey: string): ObjectAclMode | null {
  const hit = OBJECT_KEY_ACL.find((entry) => objectKey.startsWith(entry.prefix));
  return hit ? hit.mode : null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
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

    const allowedBucket = getConfiguredR2ChatBucket() || 'pchos-files';
    if (bucket !== allowedBucket && bucket !== 'pchos-files') {
      return NextResponse.json({ error: 'This bucket is not available' }, { status: 403 });
    }

    // 퍼블릭 리소스 (로고, 직인, 프로필 사진, 팝업 이미지)는 세션 미인증 상태(<img src> 태그, 인쇄창 포함)에서도 조회 허용
    const aclMode = resolveObjectAclMode(objectKey);
    const isPublicAsset = aclMode === 'public';

    if (!isPublicAsset && !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 미등록 프리픽스(backup/ 등 운영 산출물 포함)는 관리자만.
    if (aclMode === null && !isAdminSession(session?.user)) {
      return NextResponse.json(
        { error: '해당 경로의 파일에 접근할 권한이 없습니다.' },
        { status: 403 },
      );
    }

    // 채팅 객체 경로일 경우 대화방 멤버십 ACL 검증 (chat/room_id/filename 패턴)
    if (aclMode === 'chat' || objectKey.includes('/chat/')) {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const parts = objectKey.split('/');
      const chatIdx = parts.findIndex((p) => p === 'chat');

      // 키에서 방 id 를 뽑는다.
      //
      // 주의: 실제 업로드 키는 `chat/<timestamp>_<uuid>.<ext>` 2단이라(lib/object-storage.ts:198)
      // 뒤 조각은 **파일명**이지 방 id 가 아니다. 예전에는 그걸 방 id 로 간주해
      // assertChatRoomMember 에 넘겼고, 당연히 멤버십 조회가 실패해
      // **정상 멤버에게도 403** 을 내보내 첨부가 열리지 않았다.
      // 따라서 뒤에 조각이 더 있을 때(`chat/<roomId>/<file>`)만 방 id 로 인정한다.
      const roomIdFromPath =
        chatIdx >= 0 && parts.length > chatIdx + 2 ? parts[chatIdx + 1] : null;

      const userId = String(session.user.id || session.user.user_id || '').trim();
      const role = String(session.user.role || '').toLowerCase();
      // 세션에 is_master·is_admin 필드는 없다 — 항상 false 인 죽은 조건이었다.
      // 실제 관리자 판정은 isAdminSession(is_system_master·role·permissions)이 한다.
      const isMaster = isAdminSession(session.user);

      if (!isMaster && role !== 'admin') {
        const d1 = await getD1Binding();
        if (d1) {
          const db = getD1Drizzle(d1);

          // 경로에 방 id 가 없으면 이 객체를 참조하는 메시지로 방을 역추적한다.
          // 찾지 못하면(업로드 직후 등 아직 메시지가 없는 경우) 세션 검사까지만 적용한다 —
          // 키에 UUID 가 들어 있어 열거가 불가능하다.
          let roomId = roomIdFromPath;
          if (!roomId) {
            try {
              // LIKE 는 쓰지 않는다 — D1 이 `LIKE or GLOB pattern too complex` 로 거부한다.
              // file_url 은 공개 베이스 URL + 객체 키 형태로 저장되므로 정확 일치로 찾는다.
              // (인코딩 여부가 경로에 따라 갈려 두 형태를 모두 후보로 둔다.)
              const publicBase = getPublicBaseUrlInternal();
              const candidates = publicBase
                ? [`${publicBase}/${encodeObjectKey(objectKey)}`, `${publicBase}/${objectKey}`]
                : [];
              if (candidates.length > 0) {
                const found = await d1
                  .prepare('SELECT room_id FROM messages WHERE file_url IN (?1, ?2) LIMIT 1')
                  .bind(candidates[0], candidates[1])
                  .first<{ room_id: string | null }>();
                if (found?.room_id) roomId = String(found.room_id);
              }
            } catch (lookupErr) {
              console.error('[storage/object] 채팅 첨부 방 역추적 실패:', lookupErr);
            }
          }

          if (roomId) {
            const mem = await assertChatRoomMember(db, roomId, userId);
            if (!mem.ok) {
              return NextResponse.json({ error: '해당 대화방 첨부파일 접근 권한이 없습니다.' }, { status: 403 });
            }
          }
        }
      }
    }

    /**
     * 어느 단계에서 실패했는지 남긴다.
     *
     * 예전에는 바인딩·서명 URL 두 경로가 모두 실패해도 응답이
     * "Failed to fetch from storage" 한 줄이라, 원인이
     *   (a) 바인딩이 아예 없음  (b) 바인딩에 그 객체가 없음
     *   (c) 서명 URL 자격증명이 틀림  (d) 객체 자체가 없음
     * 중 무엇인지 구분할 수 없었다. 계정 이전처럼 "예전 파일만 안 열리는"
     * 상황에서 이 구분이 진단의 전부인데 그게 없었다.
     */
    const stages: string[] = [];

    // 1. Direct Cloudflare R2 Worker Binding Attempt (Zero-latency direct stream)
    try {
      const cfCtx = await getCloudflareContext();
      const r2Binding = (cfCtx?.env as any)?.R2;
      if (!r2Binding || typeof r2Binding.get !== 'function') {
        stages.push('binding:unavailable');
      }
      if (r2Binding && typeof r2Binding.get === 'function') {
        const r2Object = await r2Binding.get(objectKey);
        if (!r2Object) stages.push('binding:object-missing');
        if (r2Object && r2Object.body) {
          const contentType = r2Object.httpMetadata?.contentType || 'application/octet-stream';
          const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, immutable',
            'X-Content-Type-Options': 'nosniff',
          };
          if (r2Object.size) {
            headers['Content-Length'] = String(r2Object.size);
          }
          if (download) {
            const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
            const encoded = encodeURIComponent(fileName);
            headers['Content-Disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
          }
          return new NextResponse(r2Object.body as ReadableStream, { status: 200, headers });
        }
      }
    } catch (bindingErr) {
      // Fallback to S3 Presigned URL / REST API
      stages.push('binding:error');
      console.error('[storage/object] R2 바인딩 조회 실패:', bindingErr);
    }

    // 2. Fallback to S3 Presigned URL
    const signedUrl = await createR2DownloadUrl(bucket, objectKey);
    if (!signedUrl) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured', stages: [...stages, 'signed-url:not-configured'] },
        { status: 500 },
      );
    }

    if (!download && !proxy) {
      return NextResponse.redirect(signedUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'private, max-age=300'
        }
      });
    }

    // 스트리밍 프록시
    const upstream = await fetch(signedUrl);
    if (!upstream.ok) {
      stages.push(`signed-url:${upstream.status}`);
      // 403·401 은 대개 자격증명이 다른 계정을 가리킬 때 난다. 서버 로그에
      // 계정 id 를 남겨 두면 계정 이전 후의 오설정을 바로 알아볼 수 있다.
      console.error(
        `[storage/object] 스토리지 조회 실패 (key=${objectKey}, status=${upstream.status}, `
        + `account=${String(process.env.R2_ACCOUNT_ID || '(미설정)')}, stages=${stages.join(' → ')})`,
      );
      return NextResponse.json(
        { error: 'Failed to fetch from storage', stages },
        { status: upstream.status },
      );
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
