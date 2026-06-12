'use client';

/**
 * 인사 담당자용 — 직원이 제출한 면허·자격 보수교육 이수증 검토 모달
 * - 검토 대기 목록 조회
 * - 첨부 파일 미리보기
 * - "OCR 스캔" → /api/license-ce/ocr 호출 → 교육일/기관/시간 자동 추출
 * - "승인" → /api/license-ce/[id] PATCH approve → staff_licenses 갱신·만료일 연장
 * - "반려" → 사유 입력 후 PATCH reject
 * JM3 적용: 에러 사용자 메시지 분리, 부분 실패 허용
 * JM4 적용: 외부 응답 zod 검증
 * JM6 적용: label 연결, 키보드 닫기, role=dialog
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { toast } from '@/lib/toast';
import { computeEffectiveExpiry, getRenewalRule, addMonths } from '@/lib/license-renewal-policy';

const CERowSchema = z.object({
  id: z.string(),
  staff_id: z.string(),
  license_id: z.string().nullable().optional(),
  license_type_hint: z.string().nullable().optional(),
  license_name_hint: z.string().nullable().optional(),
  file_url: z.string(),
  file_name: z.string().nullable().optional(),
  status: z.string(),
  submitted_at: z.string().nullable().optional(),
  ocr_text: z.string().nullable().optional(),
  ocr_education_date: z.string().nullable().optional(),
  education_date: z.string().nullable().optional(),
  applied_expiry_date: z.string().nullable().optional(),
  reject_reason: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
});
type CERow = z.infer<typeof CERowSchema>;

const OcrResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    education_date: z.string().nullable(),
    course_name: z.string().nullable(),
    institution: z.string().nullable(),
    certificate_number: z.string().nullable(),
    hours: z.number().nullable().optional(),
    raw_text: z.string().nullable().optional(),
  }),
  rawText: z.string().optional(),
});

type Props = {
  onClose: () => void;
  onChanged?: () => void;
  staffs: Record<string, unknown>[];
};

export default function LicenseCEReviewModal({ onClose, onChanged, staffs }: Props) {
  const [items, setItems] = useState<CERow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 'ocr' | 'approve' | 'reject' | null
  const [educationDate, setEducationDate] = useState('');
  const [overrideExpiry, setOverrideExpiry] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [ocrMeta, setOcrMeta] = useState<Record<string, unknown> | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [memo, setMemo] = useState('');

  const staffMap = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const s of staffs) m.set(String(s.id), s);
    return m;
  }, [staffs]);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/license-ce?status=pending', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '조회 실패');
      const parsed = z.array(CERowSchema).safeParse(json.items ?? []);
      setItems(parsed.success ? parsed.data : []);
    } catch (e) {
      toast(`목록 조회 실패: ${e instanceof Error ? e.message : '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPending(); }, [fetchPending]);

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selected = useMemo(() => items.find((it) => it.id === selectedId) ?? null, [items, selectedId]);

  // 항목 변경 시 폼 초기화
  useEffect(() => {
    if (!selected) {
      setEducationDate('');
      setOverrideExpiry('');
      setOcrText('');
      setOcrMeta(null);
      setRejectReason('');
      setMemo('');
      return;
    }
    setEducationDate(selected.education_date ?? selected.ocr_education_date ?? '');
    setOverrideExpiry('');
    setOcrText(selected.ocr_text ?? '');
    setOcrMeta(null);
    setRejectReason(selected.reject_reason ?? '');
    setMemo(selected.memo ?? '');
  }, [selected?.id]);

  const previewExpiry = useMemo(() => {
    if (!educationDate) return null;
    if (overrideExpiry) return overrideExpiry;
    const rule = getRenewalRule(selected?.license_type_hint ?? null);
    const cycleMonths = rule?.cycleMonths ?? 24;
    return addMonths(educationDate, cycleMonths);
  }, [educationDate, overrideExpiry, selected?.license_type_hint]);

  const runOcr = async () => {
    if (!selected) return;
    setBusy('ocr');
    try {
      // 첨부 파일을 fetch → base64 변환 → API 전송
      const fileRes = await fetch(selected.file_url);
      if (!fileRes.ok) throw new Error('첨부 파일을 불러오지 못했습니다.');
      const blob = await fileRes.blob();
      if (!blob.type.startsWith('image/') && blob.type !== 'application/pdf') {
        throw new Error('이미지 또는 PDF 파일만 OCR 가능합니다.');
      }
      // PDF는 현재 지원 안 함 — 안내
      if (blob.type === 'application/pdf') {
        throw new Error('PDF OCR은 미지원입니다. 직원에게 이미지(jpg/png)로 재업로드를 요청하세요.');
      }
      const base64 = await blobToBase64(blob);
      const res = await fetch('/api/license-ce/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mimeType: blob.type,
          licenseType: selected.license_type_hint ?? undefined,
          licenseName: selected.license_name_hint ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'OCR 실패');
      const parsed = OcrResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error('OCR 응답 형식 오류');
      const { data, rawText } = parsed.data;
      if (data.education_date) setEducationDate(data.education_date);
      setOcrText(rawText ?? data.raw_text ?? '');
      setOcrMeta({ ...data });
      toast('OCR 추출 완료. 결과를 확인하고 승인하세요.', 'success');
    } catch (e) {
      toast(`OCR 실패: ${e instanceof Error ? e.message : '오류'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!selected) return;
    if (!educationDate) return toast('교육일을 입력하거나 OCR로 추출하세요.', 'warning');
    setBusy('approve');
    try {
      const res = await fetch(`/api/license-ce/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          education_date: educationDate,
          override_expiry_date: overrideExpiry || undefined,
          ocr_text: ocrText || undefined,
          ocr_education_date: ocrMeta?.education_date ?? undefined,
          ocr_extracted_meta: ocrMeta ?? undefined,
          memo: memo || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '승인 실패');
      toast(`승인 완료. 새 만료일: ${json.newExpiry ?? '-'}`, 'success');
      setSelectedId(null);
      await fetchPending();
      onChanged?.();
    } catch (e) {
      toast(`승인 실패: ${e instanceof Error ? e.message : '오류'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!selected) return;
    if (!rejectReason.trim()) return toast('반려 사유를 입력하세요.', 'warning');
    setBusy('reject');
    try {
      const res = await fetch(`/api/license-ce/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          reject_reason: rejectReason,
          memo: memo || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '반려 실패');
      toast('반려 처리되었습니다.', 'success');
      setSelectedId(null);
      await fetchPending();
      onChanged?.();
    } catch (e) {
      toast(`반려 실패: ${e instanceof Error ? e.message : '오류'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="보수교육 이수증 검토"
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3"
    >
      <div
        className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-5xl max-h-[92vh] overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 좌측: 검토 대기 목록 */}
        <aside className="border-r border-[var(--border)] flex flex-col min-h-0">
          <header className="p-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--foreground)]">검토 대기</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)] text-lg"
            >×</button>
          </header>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-xs text-[var(--toss-gray-3)]">불러오는 중...</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-xs text-[var(--toss-gray-3)]">검토 대기 항목이 없습니다.</p>
            ) : (
              items.map((it) => {
                const staff = staffMap.get(it.staff_id);
                const staffName = String(staff?.name ?? '알 수 없음');
                const isActive = selectedId === it.id;
                return (
                  <button
                    type="button"
                    key={it.id}
                    onClick={() => setSelectedId(it.id)}
                    className={`w-full text-left p-3 border-b border-[var(--border)] transition-colors ${
                      isActive ? 'bg-blue-500/10' : 'hover:bg-[var(--muted)]'
                    }`}
                  >
                    <p className="text-xs font-bold text-[var(--foreground)]">{staffName}</p>
                    <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                      {it.license_type_hint ?? '면허종류 미지정'}
                      {it.license_name_hint ? ` · ${it.license_name_hint}` : ''}
                    </p>
                    <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">
                      제출 {it.submitted_at ? new Date(it.submitted_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* 우측: 상세 검토 패널 */}
        <section className="flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--toss-gray-3)]">
              왼쪽 목록에서 검토할 항목을 선택하세요.
            </div>
          ) : (
            <>
              <header className="p-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-bold text-[var(--foreground)]">
                  {String(staffMap.get(selected.staff_id)?.name ?? '직원')} ·{' '}
                  {selected.license_type_hint ?? '면허종류 미지정'}
                </h3>
                {selected.license_name_hint && (
                  <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">{selected.license_name_hint}</p>
                )}
              </header>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 첨부 미리보기 */}
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">첨부 파일</p>
                  <a
                    href={selected.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-blue-600 hover:underline break-all"
                  >
                    {selected.file_name ?? '파일 열기 →'}
                  </a>
                  <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden bg-[var(--muted)]">
                    {/* 이미지면 미리보기, PDF면 iframe */}
                    {/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(selected.file_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.file_url}
                        alt="이수증 미리보기"
                        className="w-full max-h-72 object-contain bg-black/5"
                      />
                    ) : (
                      <iframe
                        title="이수증"
                        src={selected.file_url}
                        className="w-full h-72"
                      />
                    )}
                  </div>
                </div>

                {/* OCR 실행 */}
                <div className="rounded-[var(--radius-md)] border border-blue-500/30 bg-blue-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-blue-700">OCR 자동 스캔</p>
                      <p className="text-[10px] text-blue-600 mt-0.5">
                        Gemini Vision으로 교육일·과정명·발급기관을 추출합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={runOcr}
                      disabled={busy !== null}
                      className="rounded-[var(--radius-md)] bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      {busy === 'ocr' ? '스캔 중...' : '🔍 OCR 스캔'}
                    </button>
                  </div>
                  {ocrMeta && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                      <Field label="추출 교육일" value={String(ocrMeta.education_date ?? '-')} />
                      <Field label="과정명" value={String(ocrMeta.course_name ?? '-')} />
                      <Field label="기관" value={String(ocrMeta.institution ?? '-')} />
                      <Field label="이수시간" value={ocrMeta.hours ? `${ocrMeta.hours}시간` : '-'} />
                    </div>
                  )}
                </div>

                {/* 교육일 / 만료일 입력 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ce-education-date" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                      교육일 *
                    </label>
                    <input
                      id="ce-education-date"
                      type="date"
                      value={educationDate}
                      onChange={(e) => setEducationDate(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="ce-override-expiry" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                      만료일 수기지정 (선택)
                    </label>
                    <input
                      id="ce-override-expiry"
                      type="date"
                      value={overrideExpiry}
                      onChange={(e) => setOverrideExpiry(e.target.value)}
                      placeholder={previewExpiry ?? ''}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)]"
                    />
                  </div>
                </div>

                {/* 적용 미리보기 */}
                {previewExpiry && (
                  <div className="rounded-[var(--radius-md)] bg-emerald-500/10 border border-emerald-500/30 p-3">
                    <p className="text-[11px] font-bold text-emerald-700">적용 예정</p>
                    <p className="text-[10px] text-emerald-700 mt-1">
                      갱신일: <strong>{educationDate}</strong> →{' '}
                      만료일: <strong>{previewExpiry}</strong>
                      {!overrideExpiry && (
                        <span className="ml-1 text-emerald-600">
                          ({getRenewalRule(selected.license_type_hint)?.label ?? '기본 24개월'})
                        </span>
                      )}
                    </p>
                    {(() => {
                      // 단순 표시용: 실제 staff_licenses 갱신 결과는 서버에서 확정
                      const eff = computeEffectiveExpiry({
                        license_type: selected.license_type_hint,
                        expiry_date: overrideExpiry || previewExpiry,
                        renewed_date: educationDate,
                      });
                      return (
                        <p className="text-[9px] text-emerald-600 mt-0.5">
                          산출 근거: {eff.source === 'explicit' ? '입력값' : '갱신일 + 법정 갱신주기'}
                        </p>
                      );
                    })()}
                  </div>
                )}

                {/* 메모 */}
                <div>
                  <label htmlFor="ce-memo" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                    메모 (선택)
                  </label>
                  <textarea
                    id="ce-memo"
                    rows={2}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--card)] resize-none"
                  />
                </div>

                {/* 반려 사유 */}
                <div>
                  <label htmlFor="ce-reject-reason" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                    반려 사유 (반려 시 필수)
                  </label>
                  <input
                    id="ce-reject-reason"
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="예: 교육일이 보이지 않음, 다른 교육 이수증"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--card)]"
                  />
                </div>
              </div>

              <footer className="p-3 border-t border-[var(--border)] flex gap-2">
                <button
                  type="button"
                  onClick={reject}
                  disabled={busy !== null}
                  className="flex-1 py-2 rounded-[var(--radius-md)] bg-red-500/10 text-red-600 font-bold text-sm disabled:opacity-50 hover:bg-red-500/20"
                >
                  {busy === 'reject' ? '반려 중...' : '반려'}
                </button>
                <button
                  type="button"
                  onClick={approve}
                  disabled={busy !== null || !educationDate}
                  className="flex-[2] py-2 rounded-[var(--radius-md)] bg-emerald-600 text-white font-bold text-sm disabled:opacity-50 hover:bg-emerald-700"
                >
                  {busy === 'approve' ? '적용 중...' : '승인 + 만료일 연장 적용'}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[var(--card)] border border-[var(--border)] px-2 py-1">
      <p className="text-[9px] font-semibold text-[var(--toss-gray-3)]">{label}</p>
      <p className="text-[11px] font-bold text-[var(--foreground)] truncate">{value}</p>
    </div>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('FileReader 결과 형식 오류'));
      // "data:image/png;base64,xxxx" → "xxxx"
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('파일 읽기 실패'));
    reader.readAsDataURL(blob);
  });
}
