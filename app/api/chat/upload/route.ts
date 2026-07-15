import { NextRequest, NextResponse } from 'next/server';
import {
  buildChatAttachmentObjectKey,
  createChatAttachmentUploadPlan,
  uploadToR2 } from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rate-limit';
import { CHAT_MAX_FILE_SIZE_BYTES as MAX_FILE_SIZE_BYTES, CHAT_MAX_VIDEO_SIZE_BYTES as MAX_VIDEO_SIZE_BYTES } from '@/lib/chat-upload-constants';
import { DEFAULT_CONTENT_TYPE, normalizeUploadMimeType } from '@/lib/upload-mime';
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
  /** 선택: 전달 시 방 멤버십(notice 예외) 검증 */
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

function guessFileExtension(fileName: string, mimeType: string): string {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  if (mimeType.startsWith('image/')) return mimeType.split('/')[1] || 'png';
  if (mimeType.startsWith('video/')) return mimeType.split('/')[1] || 'mp4';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  return 'bin';
}

function buildFallbackFileName(mimeType: string, ext: string): string {
  if (mimeType.startsWith('image/')) return `image.${ext}`;
  if (mimeType.startsWith('video/')) return `video.${ext}`;
  if (mimeType === 'application/pdf') return `document.${ext}`;
  return `attachment.${ext}`;
}

function normalizeUploadFileName(fileName: string, mimeType: string): string {
  const ext = guessFileExtension(fileName, mimeType);
  const rawName = String(fileName || '').trim() || buildFallbackFileName(mimeType, ext);
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[ -<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || buildFallbackFileName(mimeType, ext);
}

function buildSafeFilePath(fileName: string, mimeType: string): string {
  return buildChatAttachmentObjectKey(normalizeUploadFileName(fileName, mimeType), mimeType);
}

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

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
    throw new Error('파일 크기는 20MB 이하여야 합니다.');
  }
}

/**
 * room_id가 있으면 멤버십 검증. 없으면 하위호환으로 통과
 * (클라가 room_id를 보내기 시작하면 완전 강제).
 */
async function assertOptionalRoomMembership(
  userId: string,
  roomIdRaw: unknown,
): Promise<NextResponse | null> {
  const roomId = String(roomIdRaw ?? '').trim();
  if (!roomId) return null;

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
  const roomDenied = await assertOptionalRoomMembership(
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

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 209_715_200) {
      return NextResponse.json({ error: '파일 크기가 200MB를 초과합니다.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const roomDenied = await assertOptionalRoomMembership(
      userId,
      formData.get('room_id') ?? formData.get('roomId'),
    );
    if (roomDenied) return roomDenied;

    const rawFileName = String(file.name || '').trim();
    const mimeType = normalizeUploadMimeType(rawFileName, file.type || DEFAULT_CONTENT_TYPE);
    const normalizedFileName = normalizeUploadFileName(rawFileName, mimeType);
    validateUploadTarget(normalizedFileName, mimeType, file.size);

    const filePath = buildSafeFilePath(normalizedFileName, mimeType);
    const arrayBuffer = await file.arrayBuffer();

    const uploaded = await uploadToR2(R2_BUCKET, filePath, Buffer.from(arrayBuffer), mimeType);
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
