'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import type { StaffMember } from '@/types';

const ORDER_TYPES = ['승진', '전보(부서이동)', '퇴직/면직'] as const;

type AppointmentRecord = {
  id?: string | number;
  staff_id: string;
  staff_name: string;
  company: string;
  order_type: string;
  effective_date: string;
  before_dept?: string | null;
  after_dept?: string | null;
  before_position?: string | null;
  after_position?: string | null;
  before_role?: string | null;
  after_role?: string | null;
  reason?: string | null;
  memo?: string | null;
  status?: string | null;
  issued_by?: string | null;
  issued_at?: string | null;
};

type Props = {
  staffs?: StaffMember[];
  selectedCo?: string;
  user?: StaffMember | Record<string, unknown> | null;
};

type AppointmentFormState = {
  staff_id: string;
  order_type: (typeof ORDER_TYPES)[number];
  effective_date: string;
  before_dept: string;
  after_dept: string;
  before_position: string;
  after_position: string;
  before_role: string;
  after_role: string;
  reason: string;
  memo: string;
};

export default function PersonnelAppointment({
  staffs = [],
  selectedCo = '전체',
  user = null,
}: Props) {
  const [records, setRecords] = useState<AppointmentRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'발령목록' | '관보생성'>('발령목록');
  const [filter, setFilter] = useState('전체');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AppointmentFormState>({
    staff_id: '',
    order_type: ORDER_TYPES[0],
    effective_date: '',
    before_dept: '',
    after_dept: '',
    before_position: '',
    after_position: '',
    before_role: '',
    after_role: '',
    reason: '',
    memo: '',
  });

  const filteredStaffs = useMemo(() => {
    return staffs.filter((staff) => selectedCo === '전체' || staff.company === selectedCo);
  }, [selectedCo, staffs]);

  const fetchRecords = useCallback(async () => {
    try {
      let query = supabase
        .from('personnel_appointments')
        .select('*')
        .order('effective_date', { ascending: false })
        .order('issued_at', { ascending: false });

      if (selectedCo !== '전체') {
        query = query.eq('company', selectedCo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data ?? []) as AppointmentRecord[]);
    } catch (error) {
      console.error('인사발령 조회 실패:', error);
      toast('인사발령 이력을 불러오지 못했습니다.', 'warning');
      setRecords([]);
    }
  }, [selectedCo]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (filter !== '전체' && record.order_type !== filter) return false;
      return true;
    });
  }, [filter, records]);

  const resetForm = () => {
    setForm({
      staff_id: '',
      order_type: ORDER_TYPES[0],
      effective_date: '',
      before_dept: '',
      after_dept: '',
      before_position: '',
      after_position: '',
      before_role: '',
      after_role: '',
      reason: '',
      memo: '',
    });
  };

  const handleStaffSelect = (staffId: string) => {
    const staff = filteredStaffs.find((item) => String(item.id) === staffId);
    if (!staff) {
      setForm((prev) => ({ ...prev, staff_id: staffId }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      staff_id: staffId,
      before_dept: staff.department || '',
      before_position: staff.position || '',
      before_role: staff.role || '',
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const staff = filteredStaffs.find((item) => String(item.id) === form.staff_id);
    if (!staff) {
      toast('직원을 선택해주세요.', 'warning');
      return;
    }

    if (!form.effective_date) {
      toast('발령일을 선택해주세요.', 'warning');
      return;
    }

    setSaving(true);
    const actor = readClientAuditActor();

    try {
      const newRecord: AppointmentRecord = {
        staff_id: String(staff.id),
        staff_name: staff.name,
        company: staff.company,
        order_type: form.order_type,
        effective_date: form.effective_date,
        before_dept: form.before_dept || '',
        after_dept: form.after_dept || '',
        before_position: form.before_position || '',
        after_position: form.after_position || '',
        before_role: form.before_role || '',
        after_role: form.after_role || '',
        reason: form.reason.trim(),
        memo: form.memo.trim(),
        status: '발령완료',
        issued_by:
          typeof user?.name === 'string'
            ? user.name
            : typeof (user as Record<string, unknown> | null)?.['name'] === 'string'
              ? ((user as Record<string, unknown>).name as string)
              : '관리자',
        issued_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('personnel_appointments')
        .insert([newRecord])
        .select()
        .single();

      if (error || !data) {
        throw error || new Error('인사발령 저장 응답이 비어 있습니다.');
      }

      const staffUpdates: Record<string, unknown> = {};
      if (form.after_dept.trim()) staffUpdates.department = form.after_dept.trim();
      if (form.after_position.trim()) staffUpdates.position = form.after_position.trim();
      if (form.after_role.trim()) staffUpdates.role = form.after_role.trim();

      if (Object.keys(staffUpdates).length > 0) {
        const { error: staffUpdateError } = await supabase
          .from('staff_members')
          .update(staffUpdates)
          .eq('id', form.staff_id);

        if (staffUpdateError) {
          throw staffUpdateError;
        }
      }

      await logAudit(
        '인사발령등록',
        'staff_member',
        String(staff.id),
        {
          appointment_id: data.id,
          order_type: newRecord.order_type,
          effective_date: newRecord.effective_date,
          ...buildAuditDiff(
            {
              department: form.before_dept || null,
              position: form.before_position || null,
              role: form.before_role || null,
            },
            {
              department: form.after_dept || form.before_dept || null,
              position: form.after_position || form.before_position || null,
              role: form.after_role || form.before_role || null,
            },
            ['department', 'position', 'role'],
          ),
          reason: newRecord.reason || null,
          memo: newRecord.memo || null,
        },
        actor.userId,
        actor.userName,
      );

      setRecords((prev) => [data as AppointmentRecord, ...prev]);
      toast('인사발령이 저장되었습니다.', 'success');
      setShowForm(false);
      resetForm();
      fetchRecords();
    } catch (error) {
      console.error('personnel_appointments insert failed:', error);
      toast('인사발령 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateGazette = async () => {
    const now = new Date();
    const currentMonthRecords = filteredRecords.filter((record) => {
      const effectiveDate = new Date(record.effective_date);
      return (
        effectiveDate.getFullYear() === now.getFullYear() &&
        effectiveDate.getMonth() === now.getMonth()
      );
    });

    if (currentMonthRecords.length === 0) {
      toast('이번 달 발령 내역이 없습니다.', 'warning');
      return;
    }

    const lines = currentMonthRecords.map((record, index) => {
      const beforeDept = record.before_dept || '-';
      const afterDept = record.after_dept || beforeDept;
      const beforePosition = record.before_position ? `(${record.before_position})` : '';
      const afterPosition = record.after_position ? `(${record.after_position})` : '';
      return `${index + 1}. ${record.staff_name} | ${record.order_type} | ${beforeDept}${beforePosition} → ${afterDept}${afterPosition} | 발령일: ${record.effective_date}`;
    });

    const text = `═══ 인사발령 관보 ═══\n발행일: ${new Date().toLocaleDateString('ko-KR')}\n\n${lines.join('\n')}\n\n위와 같이 인사발령 합니다.\n${selectedCo === '전체' ? '회사 공통' : selectedCo}`;
    await navigator.clipboard?.writeText(text);
    toast('관보 내용이 클립보드에 복사되었습니다.', 'success');
  };

  return (
    <div className="flex h-full flex-col animate-in fade-in duration-300">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
              인사발령 관리
              <span className="ml-2 text-sm text-[var(--accent)]">[{selectedCo}]</span>
            </h2>
            <p className="text-xs text-[var(--toss-gray-3)]">
              승진, 전보, 퇴직/면직 이력을 저장하고 직원 최신 정보를 함께 반영합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generateGazette}
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-[11px] font-bold text-white shadow-md transition-opacity hover:opacity-90"
            >
              관보 생성
            </button>
            <button
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
              className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-[11px] font-bold text-white shadow-md transition-opacity hover:opacity-90"
            >
              {showForm ? '등록 닫기' : '+ 발령 등록'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-1 border-b border-[var(--border)] -mb-5">
          {(['발령목록', '관보생성'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-5 py-3 text-[11px] font-bold transition-all ${
                activeTab === tab
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--toss-gray-3)]'
              }`}
            >
              {tab === '발령목록' ? '발령 이력' : '관보/공지'}
            </button>
          ))}
        </div>
      </header>

      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto bg-[var(--page-bg)] p-4 md:p-5">
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
          >
            <h3 className="text-sm font-bold text-[var(--foreground)]">인사발령 등록</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <select
                value={form.staff_id}
                onChange={(event) => handleStaffSelect(event.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none"
                required
              >
                <option value="">직원 선택</option>
                {filteredStaffs.map((staff) => (
                  <option key={staff.id} value={String(staff.id)}>
                    {staff.name} ({staff.department || '부서 미지정'} · {staff.position || '직급 미지정'})
                  </option>
                ))}
              </select>

              <select
                value={form.order_type}
                onChange={(event) => setForm((prev) => ({ ...prev, order_type: event.target.value as typeof ORDER_TYPES[number] }))}
                className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none"
              >
                {ORDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <SmartDatePicker
                value={form.effective_date}
                onChange={(value) => setForm((prev) => ({ ...prev, effective_date: value }))}
                inputClassName="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--tab-bg)] p-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-[9px] font-bold text-[var(--toss-gray-4)]">현재 부서</label>
                <input
                  value={form.before_dept}
                  readOnly
                  className="w-full rounded-lg bg-[var(--tab-bg)] px-2 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-[var(--accent)]">변경 부서</label>
                <input
                  value={form.after_dept}
                  onChange={(event) => setForm((prev) => ({ ...prev, after_dept: event.target.value }))}
                  placeholder="변경 부서"
                  className="w-full rounded-lg border border-[var(--accent)]/30 bg-blue-50/30 px-2 py-2 text-[11px] font-bold text-[var(--foreground)] outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-[var(--toss-gray-4)]">현재 직급</label>
                <input
                  value={form.before_position}
                  readOnly
                  className="w-full rounded-lg bg-[var(--tab-bg)] px-2 py-2 text-[11px] font-bold text-[var(--toss-gray-4)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-[var(--accent)]">변경 직급</label>
                <input
                  value={form.after_position}
                  onChange={(event) => setForm((prev) => ({ ...prev, after_position: event.target.value }))}
                  placeholder="변경 직급"
                  className="w-full rounded-lg border border-[var(--accent)]/30 bg-blue-50/30 px-2 py-2 text-[11px] font-bold text-[var(--foreground)] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input
                type="text"
                value={form.reason}
                onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="발령 사유"
                className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]"
              />
              <input
                type="text"
                value={form.memo}
                onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                placeholder="비고"
                className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-[11px] font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--toss-gray-3)]"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold text-white shadow-md disabled:opacity-50"
              >
                {saving ? '저장 중...' : '발령 등록'}
              </button>
            </div>
          </form>
        )}

        <div className="w-fit overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
          <div className="flex gap-1">
            {['전체', ...ORDER_TYPES].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${
                  filter === item
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--toss-gray-3)]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {activeTab === '발령목록' && (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px]">
                <thead className="bg-[var(--muted)]">
                  <tr className="border-b border-[var(--border)] text-left text-[var(--toss-gray-4)]">
                    <th className="px-4 py-3 font-bold">직원</th>
                    <th className="px-4 py-3 font-bold">유형</th>
                    <th className="px-4 py-3 font-bold">변경 내용</th>
                    <th className="px-4 py-3 font-bold">발령일</th>
                    <th className="px-4 py-3 font-bold">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center font-bold text-[var(--toss-gray-3)]">
                        발령 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => (
                      <tr key={record.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50">
                        <td className="px-4 py-3 font-bold text-[var(--foreground)]">{record.staff_name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg bg-blue-50 px-2 py-1 font-bold text-blue-700">
                            {record.order_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">
                          {(record.before_dept || record.after_dept) && (
                            <span>
                              {record.before_dept || '-'} →{' '}
                              <strong className="text-[var(--foreground)]">
                                {record.after_dept || record.before_dept || '-'}
                              </strong>
                            </span>
                          )}
                          {(record.before_position || record.after_position) && (
                            <span className="ml-2">
                              {record.before_position || '-'} →{' '}
                              <strong className="text-[var(--foreground)]">
                                {record.after_position || record.before_position || '-'}
                              </strong>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">{record.effective_date}</td>
                        <td className="px-4 py-3 text-[var(--toss-gray-4)]">{record.reason || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === '관보생성' && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--foreground)]">이번 달 인사발령 관보</h3>
              <button
                type="button"
                onClick={generateGazette}
                className="rounded-xl bg-gray-900 px-4 py-2 text-[10px] font-bold text-white"
              >
                클립보드 복사
              </button>
            </div>
            <div className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--tab-bg)] p-4 font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
              <p className="mb-4 border-b border-[var(--border)] pb-3 text-center text-lg font-bold">
                ═══ 인사발령 관보 ═══
              </p>
              <p className="mb-4 text-[10px] text-[var(--toss-gray-3)]">
                발행일: {new Date().toLocaleDateString('ko-KR')}
              </p>
              {filteredRecords.length === 0 ? (
                <p className="py-5 text-center text-[var(--toss-gray-3)]">이번 달 발령 내역이 없습니다.</p>
              ) : (
                filteredRecords.map((record, index) => (
                  <div key={record.id} className="border-b border-[var(--border-subtle)] py-2 last:border-0">
                    <span className="text-[var(--toss-gray-3)]">{index + 1}.</span>{' '}
                    <strong>{record.staff_name}</strong> | {record.order_type} |{' '}
                    {record.before_dept || '-'}
                    {record.before_position ? `(${record.before_position})` : ''} →{' '}
                    {record.after_dept || record.before_dept || '-'}
                    {record.after_position ? `(${record.after_position})` : ''} | {record.effective_date}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
