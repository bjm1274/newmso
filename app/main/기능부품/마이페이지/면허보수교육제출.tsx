'use client';

/**
 * 마이페이지 → 서류제출 안의 "면허·자격 보수교육 이수증" 섹션
 * - 본인 보유 면허(staff_licenses) 중 하나를 선택하여 이수증 업로드
 * - Supabase Storage(board-attachments) 업로드 후 /api/license-ce POST
 * - 본인 제출 이력 표시 (pending/approved/rejected)
 * JM3: 업로드/제출 단계별 try-catch
 * JM4: zod로 응답 검증
 * JM6: label 연결, 단계별 명확한 라벨
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  DOC_ALLOWED_FORMATS_LABEL,
  DOC_MAX_FILE_SIZE_LABEL,
  validateDocUpload,
} from '@/lib/document-submission-shared';
import { useActionDialog } from '@/app/components/useActionDialog';

const StaffLicenseSchema = z.object({
  id: z.string(),
  license_type: z.string().nullable().optional(),
  license_name: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
});
type StaffLicense = z.infer<typeof StaffLicenseSchema>;

const CESubmissionSchema = z.object({
  id: z.string(),
  status: z.string(),
  submitted_at: z.string().nullable().optional(),
  license_id: z.string().nullable().optional(),
  license_type_hint: z.string().nullable().optional(),
  license_name_hint: z.string().nullable().optional(),
  file_url: z.string(),
  file_name: z.string().nullable().optional(),
  applied_expiry_date: z.string().nullable().optional(),
  reject_reason: z.string().nullable().optional(),
});
type CESubmission = z.infer<typeof CESubmissionSchema>;

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: '검토 대기', cls: 'bg-amber-500/15 text-amber-700' },
  approved: { label: '승인 · 만료일 연장됨', cls: 'bg-emerald-500/15 text-emerald-700' },
  rejected: { label: '반려', cls: 'bg-red-500/15 text-red-600' },
};

type Props = {
  user?: { id?: string; name?: string } | null;
};

export default function LicenseCESubmit({ user }: Props) {
  const { dialog, openConfirm } = useActionDialog();
  const [licenses, setLicenses] = useState<StaffLicense[]>([]);
  const [submissions, setSubmissions] = useState<CESubmission[]>([]);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedLicense = useMemo(
    () => licenses.find((l) => l.id === selectedLicenseId) ?? null,
    [licenses, selectedLicenseId],
  );

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [licRes, ceRes] = await Promise.all([
        supabase
          .from('staff_licenses')
          .select('id, license_type, license_name, expiry_date')
          .eq('staff_id', user.id)
          .order('is_primary', { ascending: false }),
        fetch('/api/license-ce', { cache: 'no-store' }).then((r) => r.json()),
      ]);

      const parsedLic = z.array(StaffLicenseSchema).safeParse(licRes.data ?? []);
      setLicenses(parsedLic.success ? parsedLic.data : []);

      if (ceRes?.ok) {
        const parsedCE = z.array(CESubmissionSchema).safeParse(ceRes.items ?? []);
        setSubmissions(parsedCE.success ? parsedCE.data : []);
      }
    } catch (e) {
      toast(`정보 조회 실패: ${e instanceof Error ? e.message : '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    if (!user?.id) return toast('사용자 정보가 없습니다.', 'error');
    if (!selectedLicense && licenses.length > 0) {
      return toast('어떤 면허에 대한 이수증인지 먼저 선택하세요.', 'warning');
    }

    // 파일 검증 — 공통 단일 정책(MIME 화이트리스트 + 크기 한도)
    const validation = validateDocUpload(file);
    if (!validation.ok) {
      return toast(validation.message, 'warning');
    }

    setBusy(true);
    try {
      // 1. Storage 업로드 (R2 via approvals/upload)
      const uploadForm = new FormData();
      uploadForm.append('file', file);

      const uploadRes = await fetch('/api/approvals/upload', {
        method: 'POST',
        body: uploadForm,
      });
      if (!uploadRes.ok) {
        const errJson = (await uploadRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(`업로드 실패: ${errJson.error || uploadRes.statusText}`);
      }
      const uploadData = (await uploadRes.json()) as { url: string };
      const fileUrl = uploadData.url;

      // 2. CE 제출 API
      const res = await fetch('/api/license-ce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_id: selectedLicense?.id ?? null,
          license_type_hint: selectedLicense?.license_type ?? undefined,
          license_name_hint: selectedLicense?.license_name ?? undefined,
          file_url: fileUrl,
          file_name: file.name,
          memo: memo || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '제출 실패');

      toast('이수증을 제출했습니다. 인사 검토 후 만료일이 자동 연장됩니다.', 'success');
      setMemo('');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '제출 중 오류', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id: string) => {
    const confirmed = await openConfirm({
      title: '제출 기록 취소',
      description: '이 제출 기록을 취소(삭제)하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/license-ce/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '취소 실패');
      toast('취소되었습니다.', 'success');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '오류', 'error');
    }
  };

  return (
    <section
      data-testid="license-ce-section"
      className="rounded-[var(--radius-xl)] border border-amber-500/20 bg-amber-500/5 p-4"
    >
      <header className="mb-3">
        <h3 className="text-sm font-bold text-amber-800">면허·자격 보수교육 이수증</h3>
        <p className="mt-0.5 text-[11px] text-amber-700">
          이수증을 업로드하면 인사 담당자가 OCR 스캔으로 교육일을 확인하고, 법정 갱신주기에 맞춰 만료일을 자동 연장합니다.
        </p>
      </header>

      {/* 면허 선택 + 업로드 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="ce-license-select" className="block text-[10px] font-bold text-amber-700 mb-1">
            대상 면허 선택
          </label>
          {licenses.length === 0 ? (
            <p className="text-[11px] text-amber-700 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--card)] border border-amber-200">
              {loading ? '면허 정보를 불러오는 중...' : '등록된 면허가 없습니다. 인사 담당자에게 등록을 요청하세요.'}
            </p>
          ) : (
            <select
              id="ce-license-select"
              value={selectedLicenseId}
              onChange={(e) => setSelectedLicenseId(e.target.value)}
              className="w-full px-3 py-2 border border-amber-200 rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
            >
              <option value="">— 면허를 선택하세요 —</option>
              {licenses.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.license_type ?? '미분류'}
                  {l.license_name ? ` · ${l.license_name}` : ''}
                  {l.expiry_date ? ` (만료 ${l.expiry_date})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-col justify-end gap-1">
          <button
            type="button"
            onClick={handlePick}
            disabled={busy || (licenses.length > 0 && !selectedLicenseId)}
            className="rounded-[var(--radius-md)] bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? '제출 중...' : '📎 이수증 업로드'}
          </button>
          <p className="text-[9px] text-amber-700">{DOC_ALLOWED_FORMATS_LABEL} · {DOC_MAX_FILE_SIZE_LABEL} 이하</p>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="ce-memo-input" className="block text-[10px] font-bold text-amber-700 mb-1">
          메모 (선택)
        </label>
        <input
          id="ce-memo-input"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 2024년도 정기 보수교육 이수"
          className="w-full px-3 py-2 border border-amber-200 rounded-[var(--radius-md)] text-xs bg-[var(--card)]"
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFile}
        aria-label="보수교육 이수증 파일 선택"
      />

      {/* 제출 이력 */}
      {submissions.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold text-amber-700 mb-2">최근 제출 이력</p>
          <ul className="space-y-1.5">
            {submissions.slice(0, 8).map((s) => {
              const meta = STATUS_LABELS[s.status] ?? { label: s.status, cls: 'bg-gray-500/15 text-gray-700' };
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-[var(--card)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-[var(--toss-gray-3)]">
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('ko-KR') : '-'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--foreground)] truncate">
                      {s.license_type_hint ?? '면허종류 미지정'}
                      {s.license_name_hint ? ` · ${s.license_name_hint}` : ''}
                      {s.applied_expiry_date && (
                        <span className="ml-1 text-emerald-600 font-bold">
                          → 만료일 {s.applied_expiry_date}
                        </span>
                      )}
                    </p>
                    {s.reject_reason && (
                      <p className="text-[10px] text-red-600 mt-0.5">반려 사유: {s.reject_reason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={s.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      파일
                    </a>
                    {s.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCancel(s.id)}
                        className="text-[10px] font-bold text-red-500 hover:underline"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {dialog}
    </section>
  );
}
