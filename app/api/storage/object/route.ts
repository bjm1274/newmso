import { NextRequest, NextResponse } from 'next/server';
import {
  createR2DownloadUrl,
  getConfiguredR2ChatBucket,
  getS3ObjectStream,
  getLocalDiskStream,
  fetchFromCloudflareR2Api,
} from '@/lib/object-storage';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { assertChatRoomMember } from '@/lib/chat-room-membership';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { isCloudflareWorkerRuntime } from '@/lib/cloudflare-runtime';
import { buildObjectResponseHeaders } from './content-policy';
import { normalizeUploadMimeType } from '@/lib/upload-mime';

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
 * messages.file_url 에 저장되는 **내부 프록시 형태** 문자열.
 * lib/object-storage.ts buildR2AccessUrl 의 공개 베이스 미설정 분기와 같은 형태여야
 * 정확 일치 역추적이 걸린다(URLSearchParams 라 키의 `/` 가 `%2F` 로 인코딩된다).
 */
function buildInternalObjectUrl(bucket: string, objectKey: string): string {
  const params = new URLSearchParams({ provider: 'r2', bucket, key: objectKey });
  return `/api/storage/object?${params.toString()}`;
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
    // 이름을 안 실어 보내는 호출부(모바일 게시판 '열기' 등)에서도 최소한 확장자가
    // 살아 있는 이름이 되도록 오브젝트 키의 마지막 조각을 폴백으로 쓴다.
    // 예전 폴백 'download' 는 확장자가 없어 저장 파일이 열리지 않았다.
    const fileName =
      String(request.nextUrl.searchParams.get('name') || '').trim()
      || objectKey.split('/').pop()
      || 'download';

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
          let roomIds: string[] = roomIdFromPath ? [roomIdFromPath] : [];
          if (roomIds.length === 0) {
            try {
              // LIKE 는 쓰지 않는다 — D1 이 `LIKE or GLOB pattern too complex` 로 거부한다.
              // 정확 일치로 찾되, **저장 형태가 두 가지**라는 점을 반영해야 한다.
              // 운영 실측(2026-08-27, messages.file_url 2,988건):
              //   공개 베이스 형태 https://r2.pchos.kr/chat/<file>              1,837건
              //   내부 프록시 형태 /api/storage/object?provider=r2&bucket=…&key=…  1,151건
              // 예전에는 공개 베이스 형태만 후보로 만들어 내부 프록시 형태 38.6% 는
              // IN 조회가 구조적으로 0행이었고, roomId 가 null 인 채 멤버십 검사를
              // 통째로 건너뛰었다(fail-open). 두 형태를 모두 후보로 만든다.
              // 내부 프록시 형태의 문자열은 lib/object-storage.ts buildR2AccessUrl 이
              // URLSearchParams 로 만든 것과 정확히 같아야 한다(키가 %2F 로 인코딩된다).
              const candidates: string[] = [];
              const pushCandidate = (value: string) => {
                if (value && !candidates.includes(value)) candidates.push(value);
              };

              const publicBase = getPublicBaseUrlInternal();
              if (publicBase) {
                pushCandidate(`${publicBase}/${encodeObjectKey(objectKey)}`);
                pushCandidate(`${publicBase}/${objectKey}`);
              }
              for (const candidateBucket of [bucket, 'pchos-files']) {
                pushCandidate(buildInternalObjectUrl(candidateBucket, objectKey));
              }

              if (candidates.length > 0) {
                const placeholders = candidates.map((_, i) => `?${i + 1}`).join(', ');
                const found = await d1
                  .prepare(
                    `SELECT DISTINCT room_id FROM messages WHERE file_url IN (${placeholders}) LIMIT 20`,
                  )
                  .bind(...candidates)
                  .all<{ room_id: string | null }>();
                roomIds = (found?.results ?? [])
                  .map((row) => String(row?.room_id ?? '').trim())
                  .filter(Boolean);
              }
            } catch (lookupErr) {
              console.error('[storage/object] 채팅 첨부 방 역추적 실패:', lookupErr);
            }
          }

          if (roomIds.length > 0) {
            // 같은 첨부가 여러 방에 있을 수 있다(전달·재게시 — 운영 실측 13건).
            // 한 방만 뽑아 검사하면 **다른 방의 정상 멤버가 403** 을 받는다.
            // 참조하는 방 중 하나라도 멤버면 통과시킨다 — 그 방에서 이미 볼 수 있는 파일이다.
            let allowed = false;
            for (const candidateRoomId of roomIds) {
              const mem = await assertChatRoomMember(db, candidateRoomId, userId);
              if (mem.ok) {
                allowed = true;
                break;
              }
            }
            if (!allowed) {
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

    // 0. Direct Local Disk File Storage (Docker Standalone / Local 환경)
    const localFile = getLocalDiskStream(objectKey);
    if (localFile && localFile.stream) {
      const mimeType = normalizeUploadMimeType(fileName, 'application/octet-stream');
      const headers = buildObjectResponseHeaders({
        storedContentType: mimeType,
        cacheControl: isPublicAsset ? 'public, max-age=86400, immutable' : 'private, max-age=3600',
        download,
        fileName,
        contentLength: String(localFile.contentLength),
      });
      return new NextResponse(localFile.stream as any, { status: 200, headers });
    }

    // 1. Direct Cloudflare R2 Worker Binding Attempt (Zero-latency direct stream)
    if (isCloudflareWorkerRuntime()) {
      try {
        const { getCloudflareContext } = await import('@opennextjs/cloudflare');
        const cfCtx = await getCloudflareContext({ async: true });
        const r2Binding = (cfCtx?.env as any)?.R2;
        if (!r2Binding || typeof r2Binding.get !== 'function') {
          stages.push('binding:unavailable');
        }
        if (r2Binding && typeof r2Binding.get === 'function') {
          const r2Object = await r2Binding.get(objectKey);
          if (!r2Object) stages.push('binding:object-missing');
          if (r2Object && r2Object.body) {
            const headers = buildObjectResponseHeaders({
              storedContentType: r2Object.httpMetadata?.contentType || 'application/octet-stream',
              cacheControl: 'public, max-age=86400, immutable',
              download,
              fileName,
              contentLength: r2Object.size ? String(r2Object.size) : null });
            return new NextResponse(r2Object.body as ReadableStream, { status: 200, headers });
          }
        }
      } catch (bindingErr) {
        stages.push('binding:error');
      }
    }

    // 1.2 Direct Cloudflare R2 REST API Stream & Auto-Cache (Node.js Standalone / Docker 환경)
    try {
      const r2ApiObj = await fetchFromCloudflareR2Api(objectKey, bucket);
      if (r2ApiObj && r2ApiObj.stream) {
        const headers = buildObjectResponseHeaders({
          storedContentType: r2ApiObj.contentType,
          cacheControl: isPublicAsset ? 'public, max-age=86400, immutable' : 'private, max-age=3600',
          download,
          fileName,
          contentLength: r2ApiObj.contentLength,
        });
        return new NextResponse(r2ApiObj.stream, { status: 200, headers });
      }
    } catch {
      stages.push('r2-rest-api:error');
    }

    // 1.5 Direct S3 SDK Stream Attempt (Node.js Standalone / Docker 환경)
    try {
      const s3Obj = await getS3ObjectStream(bucket, objectKey);
      if (s3Obj && s3Obj.stream) {
        const headers = buildObjectResponseHeaders({
          storedContentType: s3Obj.contentType,
          cacheControl: isPublicAsset ? 'public, max-age=86400, immutable' : 'private, max-age=3600',
          download,
          fileName,
          contentLength: s3Obj.contentLength });
        return new NextResponse(s3Obj.stream as any, { status: 200, headers });
      }
    } catch (s3StreamErr) {
      stages.push('s3-sdk-stream:error');
    }

    // 2. Fallback to S3 Presigned URL
    const signedUrl = await createR2DownloadUrl(bucket, objectKey);
    if (!signedUrl) {
      return NextResponse.json(
        { error: '요청한 파일을 스토리지에서 찾을 수 없습니다.', stages: [...stages, 'not-found'] },
        { status: 404 },
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

    const headers = buildObjectResponseHeaders({
      storedContentType: upstream.headers.get('content-type') || 'application/octet-stream',
      cacheControl: 'private, max-age=3600',
      download,
      fileName,
      contentLength: upstream.headers.get('content-length') });

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : '스토리지 접근 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
