'use client';

/**
 * 모바일 채팅 첨부 업로드 유틸.
 *  - sendMobileFileMessage: 파일 → R2 업로드 → messages insert(파일 메시지) 일괄.
 *  - PC의 `/api/chat/upload` 라우트(=`lib/object-storage.ts` + R2 signed upload plan)와
 *    `insertChatMessageWithFallback`를 재사용한다.
 *  - 한도: 이미지 200MB, 동영상 200MB, 기타 200MB (PC와 동일, lib/chat-upload-constants).
 *
 * 제약: JM(단일 책임 + < 500줄), JM2(불필요 fetch X), JM3(toast는 호출측),
 *      JM4(any 금지), JM5(MIME·size 검증, 파일명 sanitize는 서버 위임).
 */

import { supabase } from '@/lib/supabase';
import { insertChatMessageWithFallback } from '@/lib/chat-message-write';
import { pokeChannel } from '@/lib/realtime-bus';
import { triggerMobileChatPush } from './푸시트리거';
import {
  buildChatMessageInsertPayload,
  type MessageRetryPayload,
} from '@/app/main/기능부품/메신저유틸';
import {
  CHAT_MAX_FILE_SIZE_BYTES,
  CHAT_MAX_VIDEO_SIZE_BYTES,
} from '@/lib/chat-upload-constants';
import type { ChatMessage } from '@/types';
import { enqueueUpload } from '@/lib/offline-upload-queue';

export type FileKind = 'image' | 'video' | 'file';

export type UploadAndSendInput = {
  roomId: string;
  senderId: string;
  file: File;
};

export type UploadAndSendResult =
  | { ok: true; message: ChatMessage }
  | { ok: true; queued: true; message: null }
  | { ok: false; error: string };

type UploadPlanResponse = {
  provider?: 'supabase' | 'r2';
  bucket?: string;
  path?: string;
  signedUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  fileName?: string;
  error?: string;
};

type FallbackUploadResponse = {
  provider?: 'supabase' | 'r2';
  bucket?: string;
  path?: string;
  fileName?: string;
  url?: string;
  error?: string;
};

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

function normalizeMimeType(file: File): string {
  const raw = String(file.type || '').trim().toLowerCase();
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw === 'image/x-png') return 'image/png';
  return raw || DEFAULT_CONTENT_TYPE;
}

function resolveFileKind(mime: string): FileKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/** size·type 사전 검증. 통과하지 못하면 사람이 읽을 수 있는 에러 문자열 반환. */
export function validateMobileUploadTarget(file: File): { ok: true } | { ok: false; error: string } {
  const name = String(file.name || '').trim();
  if (!name) return { ok: false, error: '파일 이름이 비어 있습니다.' };

  const mime = normalizeMimeType(file);
  if (mime.startsWith('image/')) {
    if (file.size > CHAT_MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: '이미지 크기는 200MB 이하여야 합니다.' };
    }
    return { ok: true };
  }
  if (mime.startsWith('video/')) {
    if (file.size > CHAT_MAX_VIDEO_SIZE_BYTES) {
      return { ok: false, error: '동영상 크기는 200MB 이하여야 합니다.' };
    }
    return { ok: true };
  }
  if (file.size > CHAT_MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: '파일 크기는 200MB 이하여야 합니다.' };
  }
  return { ok: true };
}

async function requestUploadPlan(file: File): Promise<{ ok: true; payload: UploadPlanResponse } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: normalizeMimeType(file),
        fileSize: file.size,
      }),
    });
    const payload = (await res.json().catch(() => null)) as UploadPlanResponse | null;
    if (!res.ok || !payload?.signedUrl || !payload?.url) {
      return { ok: false, error: payload?.error || `업로드 준비 실패 (HTTP ${res.status})` };
    }
    return { ok: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : '업로드 준비 중 오류';
    return { ok: false, error: message };
  }
}

async function uploadViaServerFallback(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const res = await fetch('/api/chat/upload', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });
    const payload = (await res.json().catch(() => null)) as FallbackUploadResponse | null;
    if (!res.ok || !payload?.url) {
      return { ok: false, error: payload?.error || `업로드 실패 (HTTP ${res.status})` };
    }
    return { ok: true, url: payload.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : '서버 업로드 실패';
    return { ok: false, error: message };
  }
}

/**
 * 파일을 R2에 업로드한 뒤 messages insert까지 한 번에 실행한다.
 * - 온라인: 직접 업로드(PUT signed URL) → 실패 시 서버 fallback(/api/chat/upload formData) 순.
 * - 오프라인 또는 네트워크 실패: 업로드 큐에 적재 후 queued: true 반환.
 *   onSuccessAction으로 messages insert가 업로드 완료 후 체이닝됨.
 */
export async function sendMobileFileMessage(
  input: UploadAndSendInput,
): Promise<UploadAndSendResult> {
  if (!input.roomId || !input.senderId) {
    return { ok: false, error: '대화방 정보가 올바르지 않습니다.' };
  }

  const validation = validateMobileUploadTarget(input.file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const mime = normalizeMimeType(input.file);
  const fileKind: FileKind = resolveFileKind(mime);
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // 오프라인 선조건 — 즉시 큐잉
  if (isOffline) {
    const insertPayloadTemplate: Record<string, unknown> = {
      room_id: input.roomId,
      sender_id: input.senderId,
      // 정본 컬럼은 file_kind (메시지 버블 이미지 판정 기준). message_type은 하위호환용 병기.
      file_kind: fileKind,
      message_type: fileKind === 'image' ? 'image' : fileKind === 'video' ? 'video' : 'file',
      file_url: '{fileUrl}',
      file_name: input.file.name,
      file_size_bytes: input.file.size,
    };
    const result = await enqueueUpload({
      file: input.file,
      filename: input.file.name,
      mimeType: mime,
      planRequester: 'chat',
      planParams: { roomId: input.roomId },
      onSuccessAction: {
        kind: 'insert',
        table: 'messages',
        payloadTemplate: insertPayloadTemplate,
      },
    });
    if (result.queued) return { ok: true, queued: true, message: null };
    if (result.error) return { ok: false, error: result.error };
  }

  // 온라인 경로 — 직접 업로드 먼저, 실패 시 enqueueUpload로 폴백 큐잉
  let publicUrl = '';
  const plan = await requestUploadPlan(input.file);
  if (plan.ok) {
    try {
      const putRes = await fetch(plan.payload.signedUrl as string, {
        method: 'PUT',
        headers: plan.payload.headers || { 'content-type': mime },
        body: input.file,
      });
      if (!putRes.ok) {
        throw new Error(`R2 직접 업로드 실패 (HTTP ${putRes.status})`);
      }
      publicUrl = String(plan.payload.url || '');
    } catch {
      // R2 PUT 실패 — 서버 fallback 시도
      const fb = await uploadViaServerFallback(input.file);
      if (fb.ok) {
        publicUrl = fb.url;
      } else {
        // 서버 fallback도 실패 → 오프라인 큐 적재
        const insertPayloadTemplate: Record<string, unknown> = {
          room_id: input.roomId,
          sender_id: input.senderId,
          file_kind: fileKind,
          message_type: fileKind === 'image' ? 'image' : fileKind === 'video' ? 'video' : 'file',
          file_url: '{fileUrl}',
          file_name: input.file.name,
          file_size_bytes: input.file.size,
        };
        const qResult = await enqueueUpload({
          file: input.file,
          filename: input.file.name,
          mimeType: mime,
          planRequester: 'chat',
          planParams: { roomId: input.roomId },
          onSuccessAction: {
            kind: 'insert',
            table: 'messages',
            payloadTemplate: insertPayloadTemplate,
          },
        });
        if (qResult.queued) return { ok: true, queued: true, message: null };
        return { ok: false, error: fb.error };
      }
    }
  } else {
    // plan 실패 → 서버 multipart fallback
    const fb = await uploadViaServerFallback(input.file);
    if (!fb.ok) return { ok: false, error: fb.error };
    publicUrl = fb.url;
  }

  if (!publicUrl) {
    return { ok: false, error: '업로드된 파일 URL을 확인하지 못했습니다.' };
  }

  // messages insert
  const retryPayload: MessageRetryPayload = {
    roomId: input.roomId,
    content: '',
    fileUrl: publicUrl,
    fileName: input.file.name,
    fileSizeBytes: input.file.size,
    fileKind,
    replyToId: null,
    albumId: null,
    albumIndex: null,
    albumTotal: null,
  };
  const insertPayload = buildChatMessageInsertPayload(input.senderId, retryPayload);

  try {
    const { data, error } = await insertChatMessageWithFallback<ChatMessage>(
      supabase,
      insertPayload,
    );
    if (error || !data) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : '메시지 저장 실패';
      return { ok: false, error: message };
    }
    pokeChannel(`mobile-chat-room-${input.roomId}`);
    pokeChannel('mobile-chat-rooms-list');
    // 전송 직후 수신자 푸시 즉시 트리거 (모바일 파일 메시지도 PC와 동일하게).
    triggerMobileChatPush(input.roomId, String((data as ChatMessage).id || ''));
    return { ok: true, message: data as ChatMessage };
  } catch (err) {
    const message = err instanceof Error ? err.message : '메시지 저장 실패';
    return { ok: false, error: message };
  }
}

/** 첨부 input accept 속성 (이미지 + 동영상 + 일반 문서). */
export const MOBILE_CHAT_UPLOAD_ACCEPT =
  'image/*,video/*,application/pdf,application/zip,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
