import { NextRequest, NextResponse } from 'next/server';
import {
  buildChatAttachmentObjectKey,
  createChatAttachmentUploadPlan,
  uploadToR2 } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';
import {
  CHAT_MAX_FILE_SIZE_BYTES as MAX_FILE_SIZE_BYTES,
  CHAT_MAX_VIDEO_SIZE_BYTES as MAX_VIDEO_SIZE_BYTES,
  CHAT_MAX_IMAGE_SIZE_BYTES as MAX_IMAGE_SIZE_BYTES,
  CHAT_MAX_FILE_SIZE_LABEL as MAX_FILE_SIZE_LABEL,
} from '@/lib/chat-upload-constants';
import { MAX_SERVER_RELAY_SIZE_BYTES, MAX_SERVER_RELAY_SIZE_LABEL } from '@/lib/upload-constants';
import {
  isRawUploadRequest,
  readRawUploadFileName,
  readRawUploadMeta,
  readRawUploadMimeType } from '@/lib/upload-raw-request';
import {
  DEFAULT_CONTENT_TYPE,
  normalizeUploadFileName,
  normalizeUploadMimeType } from '@/lib/upload-mime';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { assertChatRoomMember } from '@/lib/chat-room-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 첨부 업로드는 R2 PUT/서명 발급이 비싸다 — 사용자당 1분 내 최대 30회로 제한.
const UPLOAD_RATE_LIMIT_MAX = 30;
const UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const R2_BUCKET = 'pchos-files';

type UploadPlanRequest = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  /** 필수: 방 멤버십(notice 예외) 검증용. 없으면 400. roomId 는 오프라인 큐 옛 표기 호환. */
  room_id?: string;
  roomId?: string;
};

type UploadPlanResponse = {
  success: true;
  provider: 'r2';
  bucket: string;
  path: string;
  signedUrl: string;
  fileName: string;
  url: string;
  headers: Record<string, string>;
};

// 파일명 정규화·확장자 추정은 lib/upload-mime 정본으로 이관했다(8차 D07-013·D12-011).
// 여기 있던 사본은 문자클래스가 `[ -<>…]`(0x20~0x3C 범위)라 숫자·점·하이픈을 지우고
// 제어문자는 통과시켰다 — '결산 2026-07.pdf' 가 '결산 pdf' 가 됐다.

function buildSafeFilePath(fileName: string, mimeType: string): string {
  return buildChatAttachmentObjectKey(normalizeUploadFileName(fileName, mimeType), mimeType);
}

function validateUploadTarget(fileName: string, mimeType: string, fileSize: number): void {
  if (!fileName.trim()) {
    throw new Error('업로드할 파일 이름이 없습니다.');
  }

  if (mimeType.startsWith('image/')) {
    if (fileSize > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('이미지 크기는 20MB 이하여야 합니다.');
    }
    return;
  }

  if (mimeType.startsWith('video/')) {
    if (fileSize > MAX_VIDEO_SIZE_BYTES) {
      throw new Error('동영상 크기는 200MB 이하여야 합니다.');
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(`파일 크기는 ${MAX_FILE_SIZE_LABEL} 이하여야 합니다.`);
  }
}

/**
 * room_id 필수 + 방 멤버십 검증.
 *
 * 예전에는 room_id 가 없으면 그냥 통과시키는 opt-in 구조였다("클라가 보내기 시작하면
 * 강제한다"는 전제). 그런데 실제로 보내는 곳은 오프라인 큐뿐이었고 PC 훅과 모바일
 * 온라인 경로는 둘 다 빼고 보냈다 — 즉 이 검사는 사실상 항상 no-op 이었고, 아무나
 * 남의 방 첨부용 presigned URL 을 발급받을 수 있었다(8차 D06-006).
 * 호출부(PC 플랜·PC formData·모바일 플랜·모바일 formData·오프라인 큐)를 모두 고친 뒤
 * 여기서 필수화한다. 큐에 남아 있는 옛 항목 호환을 위해 roomId 표기도 함께 받는다.
 */
async function assertRoomMembership(
  userId: string,
  roomIdRaw: unknown,
): Promise<NextResponse | null> {
  const roomId = String(roomIdRaw ?? '').trim();
  if (!roomId) {
    return NextResponse.json(
      { error: '대화방 정보(room_id)가 필요합니다.' },
      { status: 400 },
    );
  }

  const d1 = await getD1Binding();
  if (!d1) {
    // 로컬 등 binding 없음: 멤버십 스킵(기존 동작 유지)
    return null;
  }
  const db = getD1Drizzle(d1);
  const membership = await assertChatRoomMember(db, roomId, userId);
  if (!membership.ok) {
    return NextResponse.json({ error: membership.error }, { status: membership.status });
  }
  return null;
}

async function createSignedUploadPlan(
  payload: UploadPlanRequest,
  userId: string,
): Promise<NextResponse> {
  const roomDenied = await assertRoomMembership(
    userId,
    payload.room_id ?? payload.roomId,
  );
  if (roomDenied) return roomDenied;

  const rawFileName = String(payload.fileName || '').trim();
  const mimeType = normalizeUploadMimeType(rawFileName, payload.mimeType || DEFAULT_CONTENT_TYPE);
  const fileName = normalizeUploadFileName(rawFileName, mimeType);
  const fileSize = Number(payload.fileSize || 0);

  validateUploadTarget(fileName, mimeType, fileSize);

  const filePath = buildSafeFilePath(fileName, mimeType);
  const r2Plan = await createChatAttachmentUploadPlan(filePath, mimeType);
  if (!r2Plan) {
    return NextResponse.json(
      { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
      { status: 503 },
    );
  }

  const response: UploadPlanResponse = {
    success: true,
    provider: 'r2',
    bucket: r2Plan.bucket,
    path: r2Plan.path,
    signedUrl: r2Plan.signedUrl,
    fileName,
    url: r2Plan.url,
    headers: r2Plan.headers };
  return NextResponse.json(response);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = String(session.user.id).trim();
    const rateKey = `chat-upload:${userId}`;
    const rate = await checkRateLimit(rateKey, UPLOAD_RATE_LIMIT_MAX, UPLOAD_RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '업로드 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }
    await recordFailedAttempt(rateKey, UPLOAD_RATE_LIMIT_WINDOW_MS);

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await request.json().catch(() => ({}))) as UploadPlanRequest;
      return await createSignedUploadPlan(payload, userId);
    }

    // 본문이 이 워커를 통과하는 경로라 상한은 우회 경로 상한을 따른다.
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_SERVER_RELAY_SIZE_BYTES) {
      return NextResponse.json(
        { error: `앱 서버를 거쳐 올릴 수 있는 크기는 ${MAX_SERVER_RELAY_SIZE_LABEL} 까지입니다.` },
        { status: 413 },
      );
    }

    // 본문을 그대로 실어 보내는 경로 — formData 파싱조차 파일 전체를 메모리에
    // 올리므로, 큰 파일은 request.body 스트림을 R2 로 그대로 흘려보낸다.
    if (isRawUploadRequest(contentType)) {
      const rawRoomDenied = await assertRoomMembership(
        userId,
        readRawUploadMeta(request.headers, 'roomId'),
      );
      if (rawRoomDenied) return rawRoomDenied;
      if (!request.body) {
        return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
      }

      const rawName = readRawUploadFileName(request.headers);
      const rawMime = normalizeUploadMimeType(
        rawName,
        readRawUploadMimeType(request.headers) || DEFAULT_CONTENT_TYPE,
      );
      const rawNormalizedName = normalizeUploadFileName(rawName, rawMime);
      validateUploadTarget(rawNormalizedName, rawMime, contentLength);

      const rawPath = buildSafeFilePath(rawNormalizedName, rawMime);
      const rawUploaded = await uploadToR2(R2_BUCKET, rawPath, request.body, rawMime);
      return NextResponse.json({
        success: true,
        provider: rawUploaded.provider,
        bucket: rawUploaded.bucket,
        path: rawUploaded.path,
        fileName: rawNormalizedName,
        url: rawUploaded.url });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const roomDenied = await assertRoomMembership(
      userId,
      formData.get('room_id') ?? formData.get('roomId'),
    );
    if (roomDenied) return roomDenied;

    const rawFileName = String(file.name || '').trim();
    const mimeType = normalizeUploadMimeType(rawFileName, file.type || DEFAULT_CONTENT_TYPE);
    const normalizedFileName = normalizeUploadFileName(rawFileName, mimeType);
    validateUploadTarget(normalizedFileName, mimeType, file.size);

    const filePath = buildSafeFilePath(normalizedFileName, mimeType);
    // 파일 전체를 메모리에 복사하지 않는다 — 큰 첨부에서 워커 메모리 한도를
    // 넘겨 요청이 통째로 죽고, 원인을 알 수 없는 5xx 로 보였다.
    const uploaded = await uploadToR2(R2_BUCKET, filePath, file, mimeType);
    return NextResponse.json({
      success: true,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      path: uploaded.path,
      fileName: normalizedFileName,
      url: uploaded.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '채팅 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
