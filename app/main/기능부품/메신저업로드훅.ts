'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { buildUploadRequestFileName } from './메신저첨부';
import type { SendMessageOptions } from './메신저메시지서비스';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;

type ShareTarget = {
  id: string;
  fileCount: number;
  text: string | null;
  url: string | null;
  title: string | null;
};

type UseChatUploadsParams = {
  selectedRoomId: string | null;
  shareTarget?: ShareTarget | null;
  onConsumeShareTarget?: () => void;
  inputMsgRef: MutableRefObject<string>;
  setInputMsg: Dispatch<SetStateAction<string>>;
  handleSendMessage: (options?: SendMessageOptions) => Promise<boolean>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

function getFileKind(mime: string): 'image' | 'video' | 'file' {
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function useChatUploads({
  selectedRoomId,
  shareTarget,
  onConsumeShareTarget,
  inputMsgRef,
  setInputMsg,
  handleSendMessage,
  scrollToBottom,
}: UseChatUploadsParams) {
  const [pendingAlbumFiles, setPendingAlbumFiles] = useState<File[]>([]);
  const [albumPreviewUrls, setAlbumPreviewUrls] = useState<string[]>([]);
  const [fileUploading, setFileUploading] = useState(false);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const albumPreviewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    albumPreviewUrlsRef.current = albumPreviewUrls;
  }, [albumPreviewUrls]);

  const revokeAlbumPreviewUrls = useCallback((urls: string[]) => {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    return () => {
      revokeAlbumPreviewUrls(albumPreviewUrlsRef.current);
    };
  }, [revokeAlbumPreviewUrls]);

  useEffect(() => {
    if (!shareTarget) return;
    onConsumeShareTarget?.();

    void (async () => {
      try {
        const parts: string[] = [];
        if (shareTarget.title) parts.push(shareTarget.title);
        if (shareTarget.text && shareTarget.text !== shareTarget.url) parts.push(shareTarget.text);
        if (shareTarget.url) parts.push(shareTarget.url);

        if (parts.length > 0) {
          const message = parts.join('\n');
          setInputMsg(message);
          inputMsgRef.current = message;
        }

        if (shareTarget.fileCount > 0 && 'caches' in window) {
          const cache = await caches.open('erp-share-target-v1');
          const keys = await cache.keys();
          const shareKeys = keys.filter((request) =>
            request.url.includes(`/share-target-file/${shareTarget.id}/`)
          );
          const files: File[] = [];

          for (const request of shareKeys) {
            const response = await cache.match(request);
            if (!response) continue;

            const buffer = await response.arrayBuffer();
            const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
            const fileName =
              response.headers.get('X-File-Name') ||
              decodeURIComponent(new URL(request.url).searchParams.get('name') || 'file');

            files.push(new File([buffer], fileName, { type: contentType }));
            await cache.delete(request);
          }

          if (files.length > 0) {
            setPendingAttachmentFiles((prev) => [...prev, ...files]);
          }
        }
      } catch (error) {
        console.warn('[Share Target] file restore failed:', error);
      }
    })();
  }, [inputMsgRef, onConsumeShareTarget, setInputMsg, shareTarget]);

  const appendPendingAlbumFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const previewUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setPendingAlbumFiles((prev) => [...prev, ...imageFiles]);
    setAlbumPreviewUrls((prev) => [...prev, ...previewUrls]);
  }, []);

  const processFileUpload = useCallback(
    async (
      file: File,
      options?: {
        contentSnapshot?: string;
        shouldClearSnapshot?: boolean;
        albumId?: string | null;
        albumIndex?: number | null;
        albumTotal?: number | null;
      }
    ) => {
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
          toast('동영상 크기는 200MB 이하여야 합니다.');
          return false;
        }
      } else if (!file.type.startsWith('image/')) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast('파일 크기는 20MB 이하여야 합니다.');
          return false;
        }
      }

      const contentSnapshot = options?.contentSnapshot ?? inputMsgRef.current;
      const uploadFileName = buildUploadRequestFileName(file);
      setFileUploading(true);

      try {
        const uploadViaAppServer = async () => {
          const formData = new FormData();
          formData.append('file', file, uploadFileName);

          const fallbackResponse = await fetch('/api/chat/upload', {
            method: 'POST',
            body: formData,
          });
          const fallbackPayload = (await fallbackResponse.json().catch(() => null)) as {
            provider?: 'supabase' | 'r2';
            bucket?: string;
            path?: string;
            fileName?: string;
            url?: string;
            error?: string;
          } | null;

          if (!fallbackResponse.ok || !fallbackPayload?.path || !fallbackPayload?.url) {
            throw new Error(fallbackPayload?.error || `파일 업로드에 실패했습니다. (HTTP ${fallbackResponse.status})`);
          }

          return fallbackPayload;
        };

        const response = await fetch('/api/chat/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: uploadFileName,
            mimeType: file.type || 'application/octet-stream',
            fileSize: file.size,
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          provider?: 'supabase' | 'r2';
          bucket?: string;
          path?: string;
          token?: string;
          signedUrl?: string;
          url?: string;
          headers?: Record<string, string>;
          error?: string;
        } | null;

        if (!response.ok || !payload?.path || !payload?.signedUrl || !payload?.provider) {
          throw new Error(payload?.error || `파일 업로드 준비에 실패했습니다. (HTTP ${response.status})`);
        }

        let publicUrl =
          payload.url ||
          (payload.provider === 'supabase' && payload.bucket
            ? supabase.storage.from(payload.bucket).getPublicUrl(payload.path).data.publicUrl
            : '');

        try {
          let uploadErrorMessage = '';
          if (payload.provider === 'supabase' && payload.bucket && payload.token) {
            const uploadClient = supabase.storage.from(payload.bucket) as typeof supabase.storage extends {
              from: (...args: unknown[]) => infer TStorageClient;
            }
              ? TStorageClient & {
                  uploadToSignedUrl?: (
                    path: string,
                    token: string,
                    fileBody: File,
                    options?: Record<string, unknown>,
                  ) => Promise<{ error: { message?: string } | null }>;
                }
              : {
                  uploadToSignedUrl?: (
                    path: string,
                    token: string,
                    fileBody: File,
                    options?: Record<string, unknown>,
                  ) => Promise<{ error: { message?: string } | null }>;
                };

            if (typeof uploadClient.uploadToSignedUrl === 'function') {
              const uploadResult = await uploadClient.uploadToSignedUrl(payload.path, payload.token, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
                cacheControl: '3600',
              });
              uploadErrorMessage = uploadResult.error?.message || '';
            }
          }

          if (payload.provider !== 'supabase' || uploadErrorMessage) {
            const directUploadResponse = await fetch(payload.signedUrl, {
              method: 'PUT',
              headers:
                payload.provider === 'r2'
                  ? payload.headers || { 'content-type': file.type || 'application/octet-stream' }
                  : {
                      'content-type': file.type || 'application/octet-stream',
                      'x-upsert': 'false',
                      'cache-control': '3600',
                    },
              body: file,
            });

            if (!directUploadResponse.ok) {
              throw new Error(
                uploadErrorMessage || `Storage 직접 업로드에 실패했습니다. (HTTP ${directUploadResponse.status})`
              );
            }
          }
        } catch (directUploadError) {
          console.warn('직접 업로드 실패, 서버 업로드로 다시 시도합니다.', directUploadError);
          const fallbackPayload = await uploadViaAppServer();
          publicUrl = fallbackPayload.url || '';
        }

        if (!publicUrl) {
          throw new Error('업로드한 파일 URL을 확인하지 못했습니다.');
        }

        return await handleSendMessage({
          fileUrl: publicUrl,
          fileSizeBytes: file.size,
          fileKind: getFileKind(file.type || ''),
          fileName: uploadFileName,
          contentOverride: contentSnapshot.trim(),
          clearComposerIfUnchangedFrom: options?.shouldClearSnapshot === false ? undefined : contentSnapshot,
          albumId: options?.albumId ?? null,
          albumIndex: options?.albumIndex ?? null,
          albumTotal: options?.albumTotal ?? null,
        });
      } catch (error: unknown) {
        console.error('file upload failed:', error);
        const message = (error as Error)?.message || String(error);
        const hint = message.includes('Unauthorized')
          ? '로그인 세션이 만료되었을 수 있습니다. 다시 로그인 후 시도해 주세요.'
          : message.includes('버킷') || message.includes('bucket') || message.includes('not found') || message.includes('r2')
            ? 'Cloudflare R2 또는 Supabase Storage 버킷 구성이 올바른지 확인해 주세요.'
            : message.includes('413') || message.toLowerCase().includes('entity too large')
              ? '서버 요청 한도를 초과했습니다. 최신 경로가 반영된 상태인지 확인한 뒤 다시 시도해 주세요.'
              : message;
        toast(`파일 업로드에 실패했습니다.\n\n${hint}`, 'error');
        return false;
      } finally {
        setFileUploading(false);
      }
    },
    [handleSendMessage, inputMsgRef],
  );

  const confirmPendingAttachmentUpload = useCallback(async () => {
    if (pendingAttachmentFiles.length === 0) return;

    const queuedFiles = [...pendingAttachmentFiles];
    const contentSnapshot = inputMsgRef.current;
    setPendingAttachmentFiles([]);

    for (const [index, attachmentFile] of queuedFiles.entries()) {
      await processFileUpload(attachmentFile, {
        contentSnapshot: index === 0 ? contentSnapshot : '',
      });
    }
  }, [inputMsgRef, pendingAttachmentFiles, processFileUpload]);

  const cancelPendingAttachmentUpload = useCallback(() => {
    setPendingAttachmentFiles([]);
  }, []);

  const handleAlbumFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    appendPendingAlbumFiles(files);
    event.target.value = '';
  }, [appendPendingAlbumFiles]);

  const removeAlbumFile = useCallback((index: number) => {
    const targetUrl = albumPreviewUrls[index];
    if (targetUrl) {
      URL.revokeObjectURL(targetUrl);
    }

    setPendingAlbumFiles((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    setAlbumPreviewUrls((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, [albumPreviewUrls]);

  const cancelAlbumUpload = useCallback(() => {
    revokeAlbumPreviewUrls(albumPreviewUrlsRef.current);
    setPendingAlbumFiles([]);
    setAlbumPreviewUrls([]);
  }, [revokeAlbumPreviewUrls]);

  const sendAlbum = useCallback(async () => {
    if (pendingAlbumFiles.length === 0 || !selectedRoomId) return;

    const files = [...pendingAlbumFiles];
    const composerSnapshot = inputMsgRef.current;
    cancelAlbumUpload();

    if (files.length === 1) {
      await processFileUpload(files[0], { contentSnapshot: composerSnapshot });
      return;
    }

    const albumId = crypto.randomUUID();
    let successCount = 0;
    let failedCount = 0;
    let captionConsumed = false;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const sent = await processFileUpload(file, {
        contentSnapshot: captionConsumed ? '' : composerSnapshot,
        shouldClearSnapshot: !captionConsumed,
        albumId,
        albumIndex: index,
        albumTotal: files.length,
      });
      if (sent) {
        successCount += 1;
        captionConsumed = true;
      } else {
        failedCount += 1;
      }
    }

    if (successCount > 0) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    }

    if (failedCount > 0) {
      if (successCount > 0) {
        toast(`사진 ${successCount}장은 전송했고 ${failedCount}장은 실패했습니다.`, 'warning');
      } else {
        toast('선택한 사진 업로드에 모두 실패했습니다.', 'error');
      }
    }
  }, [cancelAlbumUpload, inputMsgRef, pendingAlbumFiles, processFileUpload, scrollToBottom, selectedRoomId]);

  const handleComposerPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    if (clipboardItems.length === 0) return;

    const imageFiles = clipboardItems
      .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;

    event.preventDefault();
    if (imageFiles.length > 1 || pendingAlbumFiles.length > 0) {
      appendPendingAlbumFiles(imageFiles);
      return;
    }

    setPendingAttachmentFiles((prev) => [...prev, ...imageFiles]);
  }, [appendPendingAlbumFiles, pendingAlbumFiles.length]);

  const queueDroppedFiles = useCallback((files: File[]) => {
    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const otherFiles = files.filter((file) => !file.type.startsWith('image/'));
    const shouldBundleImages = imageFiles.length > 1 || (pendingAlbumFiles.length > 0 && imageFiles.length > 0);

    if (shouldBundleImages) {
      appendPendingAlbumFiles(imageFiles);
      if (otherFiles.length > 0) {
        setPendingAttachmentFiles((prev) => [...prev, ...otherFiles]);
      }
      return;
    }

    setPendingAttachmentFiles((prev) => [...prev, ...files]);
  }, [appendPendingAlbumFiles, pendingAlbumFiles.length]);

  const handleAttachmentSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    queueDroppedFiles(files);
    event.target.value = '';
  }, [queueDroppedFiles]);

  useEffect(() => {
    setPendingAttachmentFiles([]);
    setPendingAlbumFiles([]);
    setAlbumPreviewUrls((prev) => {
      revokeAlbumPreviewUrls(prev);
      return [];
    });
  }, [revokeAlbumPreviewUrls, selectedRoomId]);

  return {
    pendingAlbumFiles,
    albumPreviewUrls,
    pendingAttachmentFiles,
    fileUploading,
    processFileUpload,
    confirmPendingAttachmentUpload,
    cancelPendingAttachmentUpload,
    handleAlbumFileSelect,
    removeAlbumFile,
    cancelAlbumUpload,
    sendAlbum,
    handleComposerPaste,
    queueDroppedFiles,
    handleAttachmentSelect,
  };
}
