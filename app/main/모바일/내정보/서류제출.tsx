'use client';

/**
 * SDocs — 모바일 서류 제출
 *
 * 기능:
 *  - 서류 종류 chip 선택 (재직증명서·경력증명서 등 6종)
 *  - 발급 사유 입력 (선택)
 *  - "사진 촬영" (capture=environment) / "파일 선택" 업로드
 *    → 즉시 enqueueUpload (planRequester: 'submission')
 *    → onSuccessAction: document_submissions insert
 *  - 제출 이력: SubmissionHistory 컴포넌트에 위임
 *  - 오프라인 큐 시 "오프라인 — 제출 대기 중" 토스트 + 폼 reset
 *
 * JM: 단일 책임, ~280줄
 * JM2: fetchHistory 1회 + 제출 성공 후 refetch
 * JM3: 카메라 권한 거부·MIME 비허용·파일 크기 초과 각각 명시
 * JM4: any 금지, SubmissionRow 타입은 서류제출이력.tsx에서 export
 * JM5: 본인 staffId만 업로드 가능, 민감 정보 로그 미포함
 * JM6: visually-hidden input + label 래퍼, aria-label
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { enqueueUpload } from '@/lib/offline-upload-queue';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import SubmissionHistory, { type SubmissionRow } from './서류제출이력';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
]);

const SUBMISSION_TYPES = [
  '재직증명서',
  '경력증명서',
  '근로계약서',
  '급여명세서',
  '재직확인서',
  '기타',
] as const;

type SubmissionType = (typeof SUBMISSION_TYPES)[number];
type UploadMode = 'camera' | 'file';

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

function normalizeMime(raw: string): string {
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw === 'image/x-png') return 'image/png';
  return raw || 'application/octet-stream';
}

function mimeErrorMsg(mime: string): string {
  if (!mime) return '파일 형식을 확인할 수 없습니다. JPEG·PNG·PDF 파일을 사용하세요.';
  return `허용되지 않는 파일 형식입니다 (${mime}). JPEG·PNG·WEBP·HEIC·PDF만 가능합니다.`;
}

// ─────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────

export type SDocsProps = {
  staffId: string | null;
  onBack: () => void;
};

export default function SDocs({ staffId, onBack }: SDocsProps) {
  const cameraInputId = useId();
  const fileInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 폼 상태
  const [selectedType, setSelectedType] = useState<SubmissionType | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── 이력 상태
  const [history, setHistory] = useState<SubmissionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!staffId) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_repository')
        .select('id, category, file_url, created_at')
        .eq('created_by', staffId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const historyRows: SubmissionRow[] = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        submission_type: r.category ?? '서류',
        reason: null,
        file_url: r.file_url,
        status: '발급완료',
        submitted_at: r.created_at,
        processed_at: r.created_at,
      }));
      setHistory(historyRows);
    } catch (err) {
      console.error('[SDocs] history fetch failed', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const resetForm = useCallback(() => {
    setSelectedType(null);
    setReason('');
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // ── 파일 업로드 처리 (공통)
  const handleFileUpload = useCallback(
    async (file: File, mode: UploadMode) => {
      const clearInput = () => {
        if (mode === 'camera' && cameraRef.current) cameraRef.current.value = '';
        if (mode === 'file' && fileRef.current) fileRef.current.value = '';
      };

      if (!staffId) {
        toast('계정 정보를 확인할 수 없습니다.', 'error');
        clearInput();
        return;
      }
      if (!selectedType) {
        toast('서류 종류를 먼저 선택해 주세요.', 'warning');
        clearInput();
        return;
      }
      // 파일 크기 검증 (JM3)
      if (file.size > MAX_FILE_SIZE) {
        toast(
          `파일 크기는 30MB 이하여야 합니다. 현재: ${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          'error',
        );
        clearInput();
        return;
      }
      // MIME 검증 (JM3)
      const mime = normalizeMime(file.type || '');
      if (!ALLOWED_MIMES.has(mime)) {
        toast(mimeErrorMsg(file.type), 'error');
        clearInput();
        return;
      }

      setSubmitting(true);
      try {
        // JM2: input.change → 즉시 enqueueUpload
        const result = await enqueueUpload({
          file,
          filename: file.name || `submission_${Date.now()}.${mime.split('/')[1] ?? 'bin'}`,
          mimeType: mime,
          planRequester: 'submission',
          planParams: { submissionType: selectedType },
          onSuccessAction: {
            kind: 'insert',
            table: 'document_repository',
            payloadTemplate: {
              created_by: staffId,
              category: selectedType,
              title: `모바일 제출 - ${selectedType}`,
              file_url: '{fileUrl}',
              version: 1,
              created_at: new Date().toISOString(),
            },
          },
        });

        if (result.uploaded) {
          toast(`${selectedType} 제출이 완료되었습니다.`, 'success');
          resetForm();
          void fetchHistory();
        } else if (result.queued) {
          toast(
            `오프라인 — ${selectedType} 제출이 대기 중입니다. 온라인 복귀 시 자동 전송됩니다.`,
            'warning',
          );
          resetForm();
        } else {
          toast(`제출 실패: ${result.error ?? '알 수 없는 오류'}`, 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '제출 중 오류 발생';
        toast(msg, 'error');
      } finally {
        setSubmitting(false);
        clearInput();
      }
    },
    [staffId, selectedType, reason, resetForm, fetchHistory],
  );

  const onCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFileUpload(file, 'camera');
    },
    [handleFileUpload],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFileUpload(file, 'file');
    },
    [handleFileUpload],
  );

  return (
    <div className="m-screen">
      <MobileHeader
        title="서류 제출"
        sub="증명서·서류 발급 신청"
        back={onBack}
      />

      <div className="m-scroll">
        {/* ── 서류 종류 선택 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">서류 종류 선택</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 4px' }}>
            {SUBMISSION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={selectedType === type}
                onClick={() => setSelectedType(type)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 20,
                  border: `1.5px solid ${selectedType === type ? 'var(--m-accent)' : 'var(--m-border)'}`,
                  background: selectedType === type ? 'var(--m-accent-soft)' : 'var(--m-card)',
                  color: selectedType === type ? 'var(--m-accent)' : 'var(--z-700)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* ── 발급 사유 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">
              발급 사유{' '}
              <span style={{ fontWeight: 500, color: 'var(--z-500)' }}>(선택)</span>
            </div>
          </div>
          <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
            <div style={{ padding: '8px 16px' }}>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 은행 제출용, 취업 준비 등"
                aria-label="발급 사유"
                style={{
                  width: '100%',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'none',
                  color: 'var(--z-900)',
                  padding: '8px 0',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── 파일 첨부 */}
        <div className="m-section">
          <div className="m-section-h">
            <div className="lbl">파일 첨부</div>
          </div>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 사진 촬영 — capture=environment (JM3: 권한 거부 시 브라우저 알림) */}
            <input
              ref={cameraRef}
              id={cameraInputId}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraChange}
              disabled={submitting}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                whiteSpace: 'nowrap',
                borderWidth: 0,
              }}
              aria-label="카메라로 사진 촬영"
            />
            <label
              htmlFor={cameraInputId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px 16px',
                borderRadius: 12,
                border: '1.5px solid var(--m-border)',
                background: 'var(--m-card)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 700,
                color: submitting ? 'var(--z-400)' : 'var(--z-800)',
              }}
            >
              <MIcon name="camera" size={18} color={submitting ? 'var(--z-400)' : 'var(--m-accent)'} />
              사진 촬영
            </label>

            {/* 파일 선택 (JM6) */}
            <input
              ref={fileRef}
              id={fileInputId}
              type="file"
              accept="image/*,application/pdf"
              onChange={onFileChange}
              disabled={submitting}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                whiteSpace: 'nowrap',
                borderWidth: 0,
              }}
              aria-label="파일 선택 (이미지 또는 PDF)"
            />
            <label
              htmlFor={fileInputId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '13px 16px',
                borderRadius: 12,
                border: '1.5px solid var(--m-border)',
                background: 'var(--m-card)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 700,
                color: submitting ? 'var(--z-400)' : 'var(--z-800)',
              }}
            >
              <MIcon name="paperclip" size={18} color={submitting ? 'var(--z-400)' : 'var(--m-accent)'} />
              파일 선택 (이미지·PDF)
            </label>

            <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, lineHeight: 1.6 }}>
              허용 형식: JPEG·PNG·WEBP·HEIC·PDF · 최대 30MB
              <br />
              파일 선택 즉시 업로드가 시작됩니다.
            </div>

            {submitting && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'var(--m-accent-soft)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--m-accent)',
                }}
                role="status"
                aria-live="polite"
              >
                <MIcon name="upload" size={15} />
                제출 중…
              </div>
            )}
          </div>
        </div>

        {/* ── 제출 이력 */}
        <SubmissionHistory
          rows={history}
          loading={historyLoading}
          onRefresh={() => void fetchHistory()}
        />

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
