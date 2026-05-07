import type { MouseEvent as ReactMouseEvent } from 'react';
import { toast } from '@/lib/toast';
import {
  buildStorageDownloadUrl,
  shouldUseManagedBrowserDownload,
  triggerManagedBrowserDownload,
} from '@/lib/object-storage-url';

type ManagedDownloadOptions = {
  logLabel?: string;
  stopPropagation?: boolean;
};

export function buildManagedDownloadUrl(fileUrl: string, fileName: string): string {
  return buildStorageDownloadUrl(fileUrl, fileName);
}

export async function handleManagedDownloadClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  fileUrl: string,
  fileName: string,
  options: ManagedDownloadOptions = {},
) {
  const { logLabel = 'managed download', stopPropagation = false } = options;

  if (stopPropagation) {
    event.stopPropagation();
  }

  const downloadUrl = buildManagedDownloadUrl(fileUrl, fileName);
  if (!downloadUrl) {
    event.preventDefault();
    toast('다운로드 주소를 만들지 못했습니다.', 'error');
    return;
  }

  if (!shouldUseManagedBrowserDownload()) {
    return;
  }

  event.preventDefault();
  try {
    await triggerManagedBrowserDownload(downloadUrl, fileName);
  } catch (error) {
    console.error(`${logLabel} failed`, error);
    toast('모바일 다운로드에 실패했습니다. 다시 시도해 주세요.', 'error');
  }
}
