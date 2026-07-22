'use client';

/**
 * AttachmentPicker — 결재 첨부 파일 선택 + 미리보기 섹션.
 *
 * - 파일 input (visually-hidden) + 버튼 래퍼 (JM6)
 * - image/*, application/pdf, text/*, application/* 허용
 * - 최대 5개, 파일당 200MB
 * - input.change → 즉시 enqueueUpload (JM2)
 * - 업로드 결과(fileUrl/queued)를 부모에게 콜백
 *
 * JM: 단일 책임, ~200줄
 * JM3: 카메라 권한 거부·크기 초과·MIME 비허용 각각 명시
 * JM4: any 금지, AttachmentEntry 타입 엄격
 * JM6: visually-hidden input + button 래퍼, aria-label, role=list
 */

import { useCallback, useId, useRef, useState } from 'react';
import { enqueueUpload } from '@/lib/offline-upload-queue';
import { toast } from '@/lib/toast';
import MIcon from '../공통/MIcon';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ACCEPTED_MIMES =
  'image/*,application/pdf,text/plain,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type AttachmentEntry = {
  localId: string;
  file: File;
  state: 'uploading' | 'done' | 'queued' | 'error';
  fileUrl: string | null;
  errorMsg: string | null;
};

export type AttachmentPickerProps = {
  /** 외부에서 approvalId를 알고 있을 때 전달 (선택) */
  approvalId?: string;
  onChange: (entries: AttachmentEntry[]) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPicker({ approvalId, onChange }: AttachmentPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<AttachmentEntry[]>([]);

  const updateEntries = useCallback(
    (updater: (prev: AttachmentEntry[]) => AttachmentEntry[]) => {
      setEntries((prev) => {
        const next = updater(prev);
        onChange(next);
        return next;
      });
    },
    [onChange],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const remaining = MAX_FILES - entries.length;
      if (remaining <= 0) {
        toast(`첨부 파일은 최대 ${MAX_FILES}개까지 가능합니다.`, 'warning');
        return;
      }

      const toProcess = Array.from(files).slice(0, remaining);
      const newEntries: AttachmentEntry[] = toProcess.map((f) => ({
        localId: crypto.randomUUID(),
        file: f,
        state: 'uploading' as const,
        fileUrl: null,
        errorMsg: null }));

      updateEntries((prev) => [...prev, ...newEntries]);

      for (const entry of newEntries) {
        const { file, localId } = entry;

        // 클라이언트 측 검증 (JM3: 각 케이스 별도 처리)
        if (file.size > MAX_FILE_SIZE) {
          updateEntries((prev) =>
            prev.map((e) =>
              e.localId === localId
                ? { ...e, state: 'error', errorMsg: `파일 크기 초과 (최대 200MB, 현재 ${formatBytes(file.size)})` }
                : e,
            ),
          );
          continue;
        }

        const mime = file.type || 'application/octet-stream';
        const isImage = mime.startsWith('image/');
        const isPdf = mime === 'application/pdf';
        const isText = mime.startsWith('text/');
        const isDoc = mime.startsWith('application/');
        if (!isImage && !isPdf && !isText && !isDoc) {
          updateEntries((prev) =>
            prev.map((e) =>
              e.localId === localId
                ? { ...e, state: 'error', errorMsg: `허용되지 않는 파일 형식 (${mime})` }
                : e,
            ),
          );
          continue;
        }

        // 즉시 업로드 시도 (JM2: input.change 시점)
        // 주의: 첨부 메타는 PC와 동일하게 approvals.meta_data.attachments 에 저장한다.
        //       (정본 스키마에 approval_attachments 테이블이 없으므로 별도 insert 하지 않는다.)
        //       업로드로 얻은 fileUrl 을 부모 폼이 onChange 로 받아 meta_data 에 기록.
        const result = await enqueueUpload({
          file,
          filename: file.name,
          mimeType: mime,
          planRequester: 'approval',
          planParams: approvalId ? { approvalId } : {} });

        if (result.uploaded) {
          updateEntries((prev) =>
            prev.map((e) =>
              e.localId === localId ? { ...e, state: 'done', fileUrl: result.fileUrl } : e,
            ),
          );
        } else if (result.queued) {
          updateEntries((prev) =>
            prev.map((e) =>
              e.localId === localId ? { ...e, state: 'queued', fileUrl: null } : e,
            ),
          );
        } else {
          updateEntries((prev) =>
            prev.map((e) =>
              e.localId === localId
                ? { ...e, state: 'error', errorMsg: result.error ?? '업로드 실패' }
                : e,
            ),
          );
        }
      }

      // input 초기화 (같은 파일 재선택 허용)
      if (inputRef.current) inputRef.current.value = '';
    },
    [entries.length, approvalId, updateEntries],
  );

  const removeEntry = useCallback(
    (localId: string) => {
      updateEntries((prev) => prev.filter((e) => e.localId !== localId));
    },
    [updateEntries],
  );

  const queued = entries.filter((e) => e.state === 'queued').length;
  const done = entries.filter((e) => e.state === 'done').length;

  return (
    <div style={{ marginTop: 8 }}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px 6px' }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', letterSpacing: '0.03em' }}>
          첨부 파일 {entries.length > 0 ? `${entries.length}/${MAX_FILES}` : `(최대 ${MAX_FILES}개)`}
        </span>
        {queued > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-warning)' }}>
            오프라인 — {queued}개 업로드 대기 중
          </span>
        )}
        {queued === 0 && done > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-success)' }}>
            {done}개 업로드 완료
          </span>
        )}
      </div>

      {/* 첨부 목록 */}
      {entries.length > 0 && (
        <ul role="list" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {entries.map((entry) => (
            <li
              key={entry.localId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: 'var(--m-bg)',
                borderRadius: 10,
                border: '1px solid var(--m-border)' }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background:
                    entry.state === 'done'
                      ? 'var(--m-success-soft)'
                      : entry.state === 'queued'
                        ? 'var(--m-warning-soft)'
                        : entry.state === 'error'
                          ? 'var(--m-danger-soft)'
                          : 'var(--m-accent-soft)',
                  color:
                    entry.state === 'done'
                      ? 'var(--m-success)'
                      : entry.state === 'queued'
                        ? 'var(--m-warning)'
                        : entry.state === 'error'
                          ? 'var(--m-danger)'
                          : 'var(--m-accent)' }}
                aria-hidden="true"
              >
                {entry.file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(entry.file)}
                    alt={entry.file.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <MIcon
                    name={
                      entry.state === 'done'
                        ? 'checkCircle'
                        : entry.state === 'error'
                          ? 'fileWarning'
                          : entry.state === 'queued'
                            ? 'upload'
                            : 'paperclip'
                    }
                    size={15}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--z-900)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' }}
                >
                  {entry.file.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 1 }}>
                  {entry.state === 'error'
                    ? entry.errorMsg
                    : entry.state === 'queued'
                      ? '오프라인 대기'
                      : entry.state === 'uploading'
                        ? '업로드 중…'
                        : `완료 · ${formatBytes(entry.file.size)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(entry.localId)}
                aria-label={`${entry.file.name} 첨부 제거`}
                style={{
                  flexShrink: 0,
                  padding: 4,
                  color: 'var(--z-400)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer' }}
              >
                <MIcon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 파일 선택 버튼 */}
      {entries.length < MAX_FILES && (
        <>
          {/* visually-hidden input (JM6) */}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={ACCEPTED_MIMES}
            onChange={(e) => void handleFiles(e.target.files)}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              borderWidth: 0 }}
            aria-label="첨부 파일 선택"
          />
          <label
            htmlFor={inputId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '11px 16px',
              borderRadius: 10,
              border: '1.5px dashed var(--m-border)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--m-accent)',
              background: 'var(--m-accent-soft)' }}
          >
            <MIcon name="paperclip" size={16} />
            파일 첨부 (사진·PDF·문서)
          </label>
        </>
      )}
    </div>
  );
}
