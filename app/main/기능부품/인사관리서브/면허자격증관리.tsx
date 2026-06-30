'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';
import { canAccessHrSection } from '@/lib/access-control';
import { getScopedActiveStaffs } from '@/lib/active-staff';
import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db-client';
import { z } from 'zod';
import { LICENSE_TYPE_OPTIONS } from './구성원현황/staff-registration-types';
import {
  computeLicenseStatus,
  computeCENextDue,
  getRenewalRule,
  type LicenseStatus,
  type CEDueStatus } from '@/lib/license-renewal-policy';
import LicenseCEReviewModal from './면허보수교육검토';
import SegmentedDateInput from '@/app/components/SegmentedDateInput';

// ---------------------------------------------------------------------------
// Zod 스키마
// ---------------------------------------------------------------------------
const JobCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string() });
type JobCategory = z.infer<typeof JobCategorySchema>;

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<LicenseStatus, string> = {
  valid: 'bg-green-500/20 text-green-700',
  expiring: 'bg-orange-500/20 text-orange-700',
  expired: 'bg-red-500/20 text-red-600',
  unknown: 'bg-gray-500/20 text-gray-600' };
const STATUS_LABELS: Record<LicenseStatus, string> = {
  valid: '유효',
  expiring: '만료 임박',
  expired: '만료',
  unknown: '확인 필요' };

// ---------------------------------------------------------------------------
// 면허/자격증 row 타입
// ---------------------------------------------------------------------------
interface LicenseRow {
  id: string;
  staff_id: string;
  license_type: string | null;
  license_name: string;
  license_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  renewed_date: string | null;
  issuing_body: string | null;
  memo: string | null;
  [key: string]: unknown;
}

interface EnrichedLicense extends LicenseRow {
  status: LicenseStatus;
  effectiveExpiry: string | null;
  effectiveExpirySource: 'explicit' | 'renewed' | 'issued' | 'unknown';
  daysLeft: number | null;
  ceDueDate: string | null;
  ceDueStatus: CEDueStatus;
  ceDaysLeft: number | null;
  ceLabel: string | null;
  staff: Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------
export default function LicenseManager({
  staffs = [],
  selectedCo,
  user }: {
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
    license_type: '',
    license_name: '',
    license_number: '',
    issued_date: '',
    expiry_date: '',
    renewed_date: '',
    issuing_body: '',
    memo: '' });
  const [customLicenseName, setCustomLicenseName] = useState('');
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<'전체' | '유효' | '만료 임박' | '만료' | '확인 필요'>('전체');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterJobCode, setFilterJobCode] = useState('');
  const [filterLicenseType, setFilterLicenseType] = useState('');

  // 보수교육 검토 모달
  const [ceReviewOpen, setCEReviewOpen] = useState(false);
  const [pendingCECount, setPendingCECount] = useState(0);
  // license_id → 마지막 승인된 보수교육 이수일
  const [lastCEMap, setLastCEMap] = useState<Record<string, string>>({});

  // 회사 필터 + 재직자만 (퇴사자 제외)
  const filteredStaffs = getScopedActiveStaffs(
    staffs as Record<string, unknown>[],
    selectedCo ?? '전체',
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
    const { data } = await db.from('staff_licenses').select('*').order('expiry_date');
    setLicenses(data ?? []);
  }, []);

  // 면허별 마지막 승인된 보수교육 이수일 조회
  const fetchLastCE = useCallback(async () => {
    const { data, error } = await db
      .from('license_continuing_education')
      .select('license_id, education_date')
      .eq('status', 'approved')
      .not('education_date', 'is', null)
      .not('license_id', 'is', null)
      .order('education_date', { ascending: false });
    if (error) return;
    const next: Record<string, string> = {};
    for (const row of (data ?? []) as { license_id: string | null; education_date: string | null }[]) {
      if (!row.license_id || !row.education_date) continue;
      if (!next[row.license_id]) next[row.license_id] = row.education_date;
    }
    setLastCEMap(next);
  }, []);

  const fetchJobCategories = useCallback(async () => {
    const { data, error } = await db
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
    const { data, error } = await db
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

  useEffect(() => { void fetchLicenses(); void fetchJobCategories(); void fetchLastCE(); }, [fetchLicenses, fetchJobCategories, fetchLastCE]);
  useEffect(() => { void fetchStaffJobMap(); }, [fetchStaffJobMap]);

  // 부모 staffs prop이 갱신되면(=구성원현황 등에서 새로고침 호출됨) staff_licenses도 재조회
  useEffect(() => {
    void fetchLicenses();
  }, [staffs, fetchLicenses]);

  // 브라우저 탭 복귀 시 최신 상태 동기화
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchLicenses();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchLicenses]);

  const enriched: EnrichedLicense[] = licenses.map((l) => {
    const computed = computeLicenseStatus({
      license_type: l.license_type,
      expiry_date: l.expiry_date,
      renewed_date: l.renewed_date,
      issued_date: l.issued_date });
    const ceDue = computeCENextDue({
      license_type: l.license_type,
      last_ce_date: lastCEMap[l.id] ?? null,
      renewed_date: l.renewed_date,
      issued_date: l.issued_date });
    return {
      ...l,
      status: computed.status,
      effectiveExpiry: computed.effective.date,
      effectiveExpirySource: computed.effective.source,
      daysLeft: computed.daysLeft,
      ceDueDate: ceDue.date,
      ceDueStatus: ceDue.status,
      ceDaysLeft: ceDue.daysLeft,
      ceLabel: ceDue.ceLabel,
      staff: filteredStaffs.find((s) => String(s.id) === String(l.staff_id)) };
  });

  // 재직자(filteredStaffs) ID 집합 — 퇴사자 자격증은 목록에서 제외
  const activeStaffIds = new Set(filteredStaffs.map((s) => String(s.id)));

  const filtered = enriched.filter((l) => {
    if (!activeStaffIds.has(String(l.staff_id))) return false;
    if (filterStatus === '유효' && l.status !== 'valid') return false;
    if (filterStatus === '만료 임박' && l.status !== 'expiring') return false;
    if (filterStatus === '만료' && l.status !== 'expired') return false;
    if (filterStatus === '확인 필요' && l.status !== 'unknown') return false;
    if (filterStaff && String(l.staff_id) !== filterStaff) return false;
    if (filterLicenseType) {
      const type = String(l.license_type ?? '').trim();
      if (filterLicenseType === '기타') {
        // '기타' 필터는 명시적으로 '기타'로 저장된 항목 + 분류 미지정(NULL/빈값) 항목까지 포함
        const isKnownType = (LICENSE_TYPE_OPTIONS as readonly string[]).includes(type);
        if (isKnownType && type !== '기타') return false;
      } else if (type !== filterLicenseType) {
        return false;
      }
    }
    if (!staffIdsForJobFilter.has(String(l.staff_id))) return false;
    return true;
  });

  const activeEnriched = enriched.filter((l) => activeStaffIds.has(String(l.staff_id)));
  const expiringCount = activeEnriched.filter((l) => l.status === 'expiring').length;
  const expiredCount = activeEnriched.filter((l) => l.status === 'expired').length;
  const unknownCount = activeEnriched.filter((l) => l.status === 'unknown').length;

  // 보수교육 검토 대기 건수
  const fetchPendingCECount = useCallback(async () => {
    if (!canEdit) return;
    const { count } = await db
      .from('license_continuing_education')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingCECount(count ?? 0);
  }, [canEdit]);

  useEffect(() => { void fetchPendingCECount(); }, [fetchPendingCECount, ceReviewOpen]);

  const openAdd = () => {
    setEditId(null);
    setForm({
      staff_id: String(filteredStaffs[0]?.id ?? ''),
      license_type: '',
      license_name: '',
      license_number: '',
      issued_date: '',
      expiry_date: '',
      renewed_date: '',
      issuing_body: '',
      memo: '' });
    setCustomLicenseName('');
    setStaffSearchTerm('');
    setShowModal(true);
  };

  const openEdit = (l: EnrichedLicense) => {
    const rawType = String(l.license_type ?? '');
    const rawName = String(l.license_name ?? '');
    const knownTypes = LICENSE_TYPE_OPTIONS as readonly string[];
    // 기존 row에서 종류·명 분리:
    // - license_type이 enum이면 그대로 사용
    // - license_type 비었고 license_name이 enum이면 license_type으로 승격
    // - 그 외는 '기타' + customName=license_name
    let type = '';
    let custom = '';
    if (knownTypes.includes(rawType)) {
      type = rawType;
      if (rawType === '기타') custom = rawName;
    } else if (knownTypes.includes(rawName)) {
      type = rawName;
    } else if (rawName) {
      type = '기타';
      custom = rawName;
    }
    setEditId(String(l.id));
    setForm({
      staff_id: String(l.staff_id),
      license_type: type,
      license_name: rawName,
      license_number: String(l.license_number ?? ''),
      issued_date: String(l.issued_date ?? ''),
      expiry_date: String(l.expiry_date ?? ''),
      renewed_date: String(l.renewed_date ?? ''),
      issuing_body: String(l.issuing_body ?? ''),
      memo: String(l.memo ?? '') });
    setCustomLicenseName(custom);
    setStaffSearchTerm('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.staff_id) return toast('직원을 선택하세요.', 'warning');
    if (!form.license_type) return toast('면허·자격 종류를 선택하세요.', 'warning');
    if (form.license_type === '기타' && !customLicenseName.trim()) {
      return toast('"기타" 선택 시 명칭을 직접 입력하세요.', 'warning');
    }
    if (!canEdit) return toast('수정 권한이 없습니다.', 'error');
    setSaving(true);
    try {
      // license_name = (기타면 직접 입력값, 그 외엔 종류명) — 기존 NOT NULL 컬럼 유지
      const resolvedName =
        form.license_type === '기타' ? customLicenseName.trim() : form.license_type;
      // PostgreSQL date 컬럼은 빈 문자열을 거부하므로 null로 변환
      const payload = {
        ...form,
        license_name: resolvedName,
        license_type: form.license_type || null,
        issued_date: form.issued_date || null,
        expiry_date: form.expiry_date || null,
        renewed_date: form.renewed_date || null };
      if (editId) {
        await db.from('staff_licenses').update(payload).eq('id', editId);
      } else {
        await db.from('staff_licenses').insert([payload]);
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
      tone: 'danger' });
    if (!confirmed) return;
    await db.from('staff_licenses').delete().eq('id', id);
    void fetchLicenses();
  };

  return (
    <div className="p-4 md:p-5 space-y-5">
      {dialog}

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <p className="text-xs text-[var(--toss-gray-3)]">직원별 면허·자격증 만료일을 추적합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchLicenses()}
            className="px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-[var(--radius-md)] text-xs font-bold bg-[var(--card)] hover:bg-[var(--muted)]"
            aria-label="목록 새로고침"
            title="목록 새로고침"
          >
            새로고침
          </button>
          {canEdit && (
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold shadow-sm hover:opacity-90"
            >
              + 등록
            </button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '전체', value: activeEnriched.length, color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
          { label: '만료 임박 (60일)', value: expiringCount, color: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
          { label: '만료됨', value: expiredCount, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
          { label: '확인 필요', value: unknownCount, color: 'bg-gray-500/10 text-gray-700 border-gray-500/20' },
        ].map((c) => (
          <div key={c.label} className={`p-3 rounded-[var(--radius-lg)] border ${c.color} text-center`}>
            <p className="text-xl font-bold">{c.value}</p>
            <p className="text-[10px] font-semibold mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 보수교육 검토 진입 + 미검토 배지 */}
      {canEdit && (
        <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-blue-500/20 bg-blue-500/10 px-4 py-3">
          <div>
            <p className="text-xs font-bold text-blue-700">📄 보수교육 이수증 검토</p>
            <p className="mt-0.5 text-[10px] text-blue-600">
              직원이 제출한 이수증을 OCR로 스캔하여 교육일을 추출하고, 법정 갱신주기로 만료일을 자동 연장합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCEReviewOpen(true)}
            className="rounded-[var(--radius-md)] bg-blue-600 px-4 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-blue-700"
          >
            검토 대기 {pendingCECount}건
          </button>
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['전체', '유효', '만료 임박', '만료', '확인 필요'] as const).map((f) => (
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
        <select
          value={filterLicenseType}
          onChange={(e) => setFilterLicenseType(e.target.value)}
          className="px-3 py-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--card)] outline-none"
          aria-label="면허·자격 종류 필터"
        >
          <option value="">전체 면허·자격</option>
          {LICENSE_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
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

      {/* 면허 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">
          등록된 면허·자격증이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => {
            const daysLeft = l.daysLeft;
            const rule = getRenewalRule(l.license_type);
            const isInferred = l.effectiveExpirySource !== 'explicit' && l.effectiveExpirySource !== 'unknown';
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
                          : l.status === 'unknown'
                            ? 'bg-gray-400'
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
                      {isInferred && l.effectiveExpiry && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/15 text-amber-700"
                          title={`만료일 미입력 — ${rule?.label ?? '법정 갱신주기'} 기준 자동 산출`}
                        >
                          자동산출
                        </span>
                      )}
                      {l.ceDueStatus === 'overdue' && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-red-500/15 text-red-600"
                          title={l.ceLabel ?? '보수교육 마감 경과'}
                        >
                          보수교육 미이수
                        </span>
                      )}
                      {l.ceDueStatus === 'due_soon' && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-500/15 text-orange-700"
                          title={l.ceLabel ?? '보수교육 마감 임박'}
                        >
                          보수교육 임박
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">
                      {String((l.staff as Record<string, unknown>)?.name ?? '')} ·{' '}
                      {String(l.issuing_body ?? '발급기관 미기재')}
                      {l.license_number ? ` · ${String(l.license_number)}` : ''}
                    </p>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">
                      {l.issued_date ? `발급: ${String(l.issued_date)}` : ''}
                      {l.renewed_date ? ` · 갱신: ${String(l.renewed_date)}` : ''}
                      {l.effectiveExpiry
                        ? ` · 만료${isInferred ? '(예상)' : ''}: ${l.effectiveExpiry}`
                        : ' · 만료일: 정보부족'}
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
                    {l.ceDueDate && l.ceDueStatus !== 'unknown' && (
                      <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                        보수교육 마감: {l.ceDueDate}
                        {l.ceDaysLeft !== null && (
                          <span
                            className={`ml-1 font-bold ${
                              l.ceDaysLeft < 0
                                ? 'text-red-500'
                                : l.ceDaysLeft <= 60
                                  ? 'text-orange-500'
                                  : 'text-green-600'
                            }`}
                          >
                            {l.ceDaysLeft < 0
                              ? `(${Math.abs(l.ceDaysLeft)}일 경과)`
                              : `(${l.ceDaysLeft}일 남음)`}
                          </span>
                        )}
                        {l.ceLabel && (
                          <span className="ml-1 text-[var(--toss-gray-4)]">· {l.ceLabel}</span>
                        )}
                      </p>
                    )}
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
                  직원 <span className="text-red-500" aria-hidden>*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    id="lic-staff-select"
                    aria-required="true"
                    value={form.staff_id}
                    onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                    className="w-1/2 px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                  >
                    {(() => {
                      const term = staffSearchTerm.trim().toLowerCase();
                      const list = term
                        ? filteredStaffs.filter((s) =>
                            String(s.name ?? '').toLowerCase().includes(term),
                          )
                        : filteredStaffs;
                      // 검색 결과에서 빠진 현재 선택된 직원도 항상 보이도록 prepend
                      if (form.staff_id && !list.some((s) => String(s.id) === form.staff_id)) {
                        const cur = filteredStaffs.find((s) => String(s.id) === form.staff_id);
                        if (cur) return [cur, ...list];
                      }
                      return list;
                    })().map((s) => (
                      <option key={String(s.id)} value={String(s.id)}>
                        {String(s.name)} ({String(s.position ?? '')})
                      </option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="none"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--toss-gray-3)]"
                    >
                      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <input
                      type="text"
                      value={staffSearchTerm}
                      onChange={(e) => setStaffSearchTerm(e.target.value)}
                      placeholder="이름 검색"
                      aria-label="직원 이름 검색"
                      className="w-full pl-10 pr-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="lic-type-select" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  면허·자격 종류 <span className="text-red-500" aria-hidden>*</span>
                </label>
                <select
                  id="lic-type-select"
                  aria-required="true"
                  value={form.license_type}
                  onChange={(e) => setForm((f) => ({ ...f, license_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                >
                  <option value="">종류를 선택하세요</option>
                  {LICENSE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {form.license_type === '기타' && (
                  <input
                    type="text"
                    value={customLicenseName}
                    onChange={(e) => setCustomLicenseName(e.target.value)}
                    placeholder="명칭을 직접 입력하세요 (예: 보건교사 자격)"
                    aria-label="기타 면허·자격 명칭 직접 입력"
                    className="mt-2 w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                  />
                )}
              </div>
              {(
                [
                  { label: '자격증 번호', key: 'license_number', type: 'text', placeholder: '예: 제12345호' },
                  { label: '발급기관', key: 'issuing_body', type: 'text', placeholder: '예: 보건복지부' },
                  { label: '발급일', key: 'issued_date', type: 'date', placeholder: '' },
                  { label: '갱신일', key: 'renewed_date', type: 'date', placeholder: '' },
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
                  {type === 'date' ? (
                    <SegmentedDateInput
                      id={`lic-field-${key}`}
                      value={form[key]}
                      onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                      ariaLabel={label.replace(/\s*\*\s*$/, '')}
                    />
                  ) : (
                    <input
                      id={`lic-field-${key}`}
                      type={type}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm"
              >
                취소
              </button>
              <button
                type="button"
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

      {ceReviewOpen && (
        <LicenseCEReviewModal
          onClose={() => setCEReviewOpen(false)}
          onChanged={() => {
            void fetchLicenses();
            void fetchPendingCECount();
            void fetchLastCE();
          }}
          staffs={filteredStaffs}
        />
      )}
    </div>
  );
}
