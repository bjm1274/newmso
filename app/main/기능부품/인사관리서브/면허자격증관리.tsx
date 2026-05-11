'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { canAccessHrSection } from '@/lib/access-control';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import LegacyLicenseMigration from './LegacyLicenseMigration';

// ---------------------------------------------------------------------------
// Zod 스키마
// ---------------------------------------------------------------------------
const JobCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});
type JobCategory = z.infer<typeof JobCategorySchema>;

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  valid: 'bg-green-500/20 text-green-700',
  expiring: 'bg-orange-500/20 text-orange-700',
  expired: 'bg-red-500/20 text-red-600',
};
const STATUS_LABELS: Record<string, string> = {
  valid: '유효',
  expiring: '만료 임박',
  expired: '만료',
};

function getStatus(expiry: string | null): 'valid' | 'expiring' | 'expired' {
  if (!expiry) return 'valid';
  const d = new Date(expiry);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'expired';
  if (diff <= 60) return 'expiring';
  return 'valid';
}

function getDaysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// 면허/자격증 row 타입
// ---------------------------------------------------------------------------
interface LicenseRow {
  id: string;
  staff_id: string;
  license_name: string;
  license_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  issuing_body: string | null;
  memo: string | null;
  [key: string]: unknown;
}

interface EnrichedLicense extends LicenseRow {
  status: 'expired' | 'valid' | 'expiring';
  staff: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function LicenseManager({
  staffs = [],
  selectedCo,
  user,
}: {
  staffs: Record<string, unknown>[];
  selectedCo: string;
  user: Record<string, unknown> | null | undefined;
}) {
  const { dialog, openConfirm } = useActionDialog();
  const canEdit = canAccessHrSection(user ?? {}, '면허/자격증');

  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [staffJobMap, setStaffJobMap] = useState<Record<string, string[]>>({});

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    staff_id: '',
    license_name: '',
    license_number: '',
    issued_date: '',
    expiry_date: '',
    issuing_body: '',
    memo: '',
  });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<'전체' | '유효' | '만료 임박' | '만료'>('전체');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterJobCode, setFilterJobCode] = useState('');

  const filteredStaffs = (staffs as Record<string, unknown>[]).filter(
    (s) => selectedCo === '전체' || s.company === selectedCo
  );

  // 직종 필터에 해당하는 직원 ID 집합
  const staffIdsForJobFilter: Set<string> = (() => {
    if (!filterJobCode) return new Set(filteredStaffs.map((s) => String(s.id)));
    const matching = new Set<string>();
    for (const [staffId, catIds] of Object.entries(staffJobMap)) {
      const cats = jobCategories.filter((c) => catIds.includes(c.id));
      if (cats.some((c) => c.code === filterJobCode)) matching.add(staffId);
    }
    return matching;
  })();

  const fetchLicenses = useCallback(async () => {
    const { data } = await supabase.from('staff_licenses').select('*').order('expiry_date');
    setLicenses(data ?? []);
  }, []);

  const fetchJobCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('job_categories')
      .select('id, code, name')
      .order('display_order');
    if (error) return;
    const parsed = z.array(JobCategorySchema).safeParse(data ?? []);
    if (parsed.success) setJobCategories(parsed.data);
  }, []);

  const fetchStaffJobMap = useCallback(async () => {
    const staffIds = filteredStaffs.map((s) => String(s.id));
    if (staffIds.length === 0) return;
    const { data, error } = await supabase
      .from('staff_job_categories')
      .select('staff_id, job_category_id')
      .in('staff_id', staffIds);
    if (error) return;
    const next: Record<string, string[]> = {};
    for (const row of data ?? []) {
      const sid = String(row.staff_id);
      if (!next[sid]) next[sid] = [];
      next[sid].push(String(row.job_category_id));
    }
    setStaffJobMap(next);
  }, [filteredStaffs]);

  useEffect(() => { void fetchLicenses(); void fetchJobCategories(); }, [fetchLicenses, fetchJobCategories]);
  useEffect(() => { void fetchStaffJobMap(); }, [fetchStaffJobMap]);

  const enriched: EnrichedLicense[] = licenses.map((l) => ({
    ...l,
    status: getStatus(l.expiry_date),
    staff: filteredStaffs.find((s) => String(s.id) === String(l.staff_id)),
  }));

  const filtered = enriched.filter((l) => {
    if (filterStatus === '유효' && l.status !== 'valid') return false;
    if (filterStatus === '만료 임박' && l.status !== 'expiring') return false;
    if (filterStatus === '만료' && l.status !== 'expired') return false;
    if (filterStaff && String(l.staff_id) !== filterStaff) return false;
    if (!staffIdsForJobFilter.has(String(l.staff_id))) return false;
    return true;
  });

  const expiringCount = enriched.filter((l) => l.status === 'expiring').length;
  const expiredCount = enriched.filter((l) => l.status === 'expired').length;

  const openAdd = () => {
    setEditId(null);
    setForm({
      staff_id: String(filteredStaffs[0]?.id ?? ''),
      license_name: '',
      license_number: '',
      issued_date: '',
      expiry_date: '',
      issuing_body: '',
      memo: '',
    });
    setShowModal(true);
  };

  const openEdit = (l: EnrichedLicense) => {
    setEditId(String(l.id));
    setForm({
      staff_id: String(l.staff_id),
      license_name: String(l.license_name ?? ''),
      license_number: String(l.license_number ?? ''),
      issued_date: String(l.issued_date ?? ''),
      expiry_date: String(l.expiry_date ?? ''),
      issuing_body: String(l.issuing_body ?? ''),
      memo: String(l.memo ?? ''),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.license_name.trim()) return toast('면허/자격증명을 입력하세요.', 'warning');
    if (!form.staff_id) return toast('직원을 선택하세요.', 'warning');
    if (!canEdit) return toast('수정 권한이 없습니다.', 'error');
    setSaving(true);
    try {
      if (editId) {
        await supabase.from('staff_licenses').update(form).eq('id', editId);
      } else {
        await supabase.from('staff_licenses').insert([form]);
      }
      setShowModal(false);
      void fetchLicenses();
    } catch {
      toast('저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return toast('삭제 권한이 없습니다.', 'error');
    const target = licenses.find((l) => l.id === id);
    const confirmed = await openConfirm({
      title: '면허·자격증 삭제',
      description: `${String(target?.license_name ?? '선택한 면허·자격증')} 기록을 삭제합니다.\n만료 알림과 자격 현황에서 제거됩니다.`,
      confirmText: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    await supabase.from('staff_licenses').delete().eq('id', id);
    void fetchLicenses();
  };

  return (
    <div className="p-4 md:p-5 space-y-5">
      {dialog}

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">면허·자격증 관리</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">직원별 면허·자격증 만료일을 추적합니다.</p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold shadow-sm hover:opacity-90"
          >
            + 등록
          </button>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '전체', value: enriched.length, color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
          { label: '만료 임박 (60일)', value: expiringCount, color: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
          { label: '만료됨', value: expiredCount, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
        ].map((c) => (
          <div key={c.label} className={`p-3 rounded-[var(--radius-lg)] border ${c.color} text-center`}>
            <p className="text-xl font-bold">{c.value}</p>
            <p className="text-[10px] font-semibold mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['전체', '유효', '만료 임박', '만료'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-all ${
              filterStatus === f
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
            }`}
          >
            {f}
          </button>
        ))}
        <select
          value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value)}
          className="px-3 py-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--card)] outline-none"
          aria-label="직원 필터"
        >
          <option value="">전체 직원</option>
          {filteredStaffs.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              {String(s.name)}
            </option>
          ))}
        </select>
        {jobCategories.length > 0 && (
          <select
            value={filterJobCode}
            onChange={(e) => setFilterJobCode(e.target.value)}
            className="px-3 py-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--card)] outline-none"
            aria-label="직종 필터"
          >
            <option value="">전체 직종</option>
            {jobCategories.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 이전 데이터 마이그레이션 섹션 (분리 컴포넌트) */}
      <LegacyLicenseMigration
        staffs={filteredStaffs}
        canEdit={canEdit}
        onMigrated={fetchLicenses}
      />

      {/* 면허 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">
          등록된 면허·자격증이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => {
            const daysLeft = getDaysLeft((l.expiry_date as string | null) ?? null);
            return (
              <div
                key={String(l.id)}
                className="flex items-center justify-between p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className={`w-2 h-12 rounded-full ${
                      l.status === 'expired'
                        ? 'bg-red-400'
                        : l.status === 'expiring'
                          ? 'bg-orange-400'
                          : 'bg-green-400'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {String(l.license_name ?? '')}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${STATUS_COLORS[l.status]}`}>
                        {STATUS_LABELS[l.status]}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">
                      {String((l.staff as Record<string, unknown>)?.name ?? '')} ·{' '}
                      {String(l.issuing_body ?? '발급기관 미기재')}
                      {l.license_number ? ` · ${String(l.license_number)}` : ''}
                    </p>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">
                      {l.issued_date ? `발급: ${String(l.issued_date)}` : ''}
                      {l.expiry_date ? ` · 만료: ${String(l.expiry_date)}` : ''}
                      {daysLeft !== null && (
                        <span
                          className={`ml-1 font-bold ${
                            daysLeft < 0
                              ? 'text-red-500'
                              : daysLeft <= 60
                                ? 'text-orange-500'
                                : 'text-green-600'
                          }`}
                        >
                          {daysLeft < 0 ? `(${Math.abs(daysLeft)}일 경과)` : `(${daysLeft}일 남음)`}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openEdit(l)}
                      className="px-2 py-1 text-[10px] bg-blue-500/10 text-blue-600 font-bold rounded-md hover:bg-blue-500/20"
                    >
                      편집
                    </button>
                    <button
                      onClick={() => handleDelete(String(l.id))}
                      className="px-2 py-1 text-[10px] bg-red-500/10 text-red-500 font-bold rounded-md hover:bg-red-500/20"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 등록/편집 모달 */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="면허·자격증 등록/편집"
        >
          <div
            className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">
              {editId ? '면허·자격증 편집' : '면허·자격증 등록'}
            </h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="lic-staff-select" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  직원 *
                </label>
                <select
                  id="lic-staff-select"
                  value={form.staff_id}
                  onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                >
                  {filteredStaffs.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {String(s.name)} ({String(s.position ?? '')})
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  { label: '면허·자격증명 *', key: 'license_name', type: 'text', placeholder: '예: 간호사 면허' },
                  { label: '자격증 번호', key: 'license_number', type: 'text', placeholder: '예: 제12345호' },
                  { label: '발급기관', key: 'issuing_body', type: 'text', placeholder: '예: 보건복지부' },
                  { label: '발급일', key: 'issued_date', type: 'date', placeholder: '' },
                  { label: '만료일', key: 'expiry_date', type: 'date', placeholder: '' },
                  { label: '메모', key: 'memo', type: 'text', placeholder: '비고 사항' },
                ] as { label: string; key: keyof typeof form; type: string; placeholder: string }[]
              ).map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label
                    htmlFor={`lic-field-${key}`}
                    className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1"
                  >
                    {label}
                  </label>
                  <input
                    id={`lic-field-${key}`}
                    type={type}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
