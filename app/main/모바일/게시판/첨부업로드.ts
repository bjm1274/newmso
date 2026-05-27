'use client';

/**
 * 첨부업로드 — 작성 폼용 R2 업로드 wrapper + validation.
 * PC의 lib/object-storage 직접 의존 대신 게시판업로드.ts 헬퍼 재사용.
 * JM: 단일 책임 (validation + 업로드 호출), ~120줄
 * JM3: 실패 시 사용자 메시지·로그 분리
 * JM4: any 금지, AttachmentItem 재사용
 * JM5: type/size 검증 (이미지 25MB, 동영상 200MB, 일반 50MB)
 */

import { uploadBoardAttachmentFile, type UploadedBoardAttachment } from '@/app/main/기능부품/게시판업로드';
import { inferAttachmentType } from '@/app/main/기능부품/게시판공통';
import { toast } from '@/lib/toast';

const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const FILE_MAX_BYTES = 50 * 1024 * 1024;

const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'cpl', 'app', 'sh', 'ps1',
]);

function fileExt(file: File): string {
  const name = String(file.name || '').trim();
  const i = name.lastIndexOf('.');
  return i > -1 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

function validateFile(file: File): string | null {
  if (!file) return '파일이 비어 있습니다.';
  const ext = fileExt(file);
  if (BLOCKED_EXT.has(ext)) {
    return '보안상 업로드할 수 없는 파일 형식입니다.';
  }
  const inferred = inferAttachmentType(file.name, file.type);
  let limit = FILE_MAX_BYTES;
  if (inferred === 'image') limit = IMAGE_MAX_BYTES;
  else if (inferred === 'video') limit = VIDEO_MAX_BYTES;

  if (file.size > limit) {
    const mb = Math.floor(limit / 1024 / 1024);
    return `파일이 너무 큽니다. ${inferred === 'image' ? '이미지' : inferred === 'video' ? '동영상' : '파일'} 최대 ${mb}MB.`;
  }
  return null;
}

export type DraftAttachment = UploadedBoardAttachment & {
  size?: number;
};

export type UploadProgress = {
  fileName: string;
  total: number;
  done: number;
};

/**
 * 여러 파일을 순차 업로드. 진행 상황은 onProgress로 알림.
 * 실패한 파일은 skip하고 성공한 항목만 반환.
 */
export async function uploadBoardAttachments(
  files: File[],
  boardType: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<DraftAttachment[]> {
  const total = files.length;
  const out: DraftAttachment[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const validationError = validateFile(file);
    if (validationError) {
      toast(`${file.name}: ${validationError}`, 'error');
      onProgress?.({ fileName: file.name, total, done: i + 1 });
      continue;
    }
    onProgress?.({ fileName: file.name, total, done: i });
    try {
      const uploaded = await uploadBoardAttachmentFile(file, boardType);
      if (uploaded?.url) {
        out.push({ ...uploaded, size: file.size });
      }
    } catch (err) {
      toast(`${file.name} 업로드 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    }
    onProgress?.({ fileName: file.name, total, done: i + 1 });
  }
  return out;
}
