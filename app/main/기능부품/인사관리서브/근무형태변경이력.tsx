'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import type { StaffMember } from '@/types';

type WorkType =
  | '정규직'
  | '파트타임'
  | '계약직'
  | '일용직'
  | '파견';

type WorkTypeRecord = {
  id?: string | number;
  staff_id: string;
  staff_name: string;
  changed_date: string;
  prev_type: string;
  new_type: string;
  reason: string;
  approver: string;
  company: string;
  created_at?: string | null;
};

type Props = {
  staffs: StaffMember[];
  selectedCo: string;
  user?: StaffMember | Record<string, unknown> | null;
};

const WORK_TYPES: WorkType[] = ['정규직', '파트타임', '계약직', '일용직', '파견'];

const TYPE_STYLES: Record<string, string> = {
  정규직: 'bg-blue-50 text-blue-700 border-blue-200',
  파트타임: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  계약직: 'bg-amber-50 text-amber-700 border-amber-200',
  일용직: 'bg-rose-50 text-rose-700 border-rose-200',
  파견: 'bg-violet-50 text-violet-700 border-violet-200',
};

function getCurrentWorkType(staff?: StaffMember | null) {
  if (!staff) return '';
  const direct = typeof staff.employment_type === 'string' ? staff.employment_type.trim() : '';
  if (direct) return direct;
  const permissionValue =
    staff.permissions && typeof staff.permissions === 'object'
      ? staff.permissions.current_work_type
      : '';
  return typeof permissionValue === 'string' ? permissionValue.trim() : '';
}

export default function WorkTypeChangeHistory({ staffs, selectedCo, user }: Props) {
  const [records, setRecords] = useState<WorkTypeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [form, setForm] = useState<{
    staff_id: string;
    staff_name: string;
    changed_date: string;
    prev_type: string;
    new_type: WorkType;
    reason: string;
    approver: string;
  }>({
    staff_id: '',
    staff_name: '',
    changed_date: new Date().toISOString().slice(0, 10),
    prev_type: '',
    new_type: '정규직',
    reason: '',
    approver:
      typeof user?.name === 'string'
        ? user.name
        : typeof (user as Record<string, unknown> | null)?.['name'] === 'string'
          ? ((user as Record<string, unknown>).name as string)
          : '',
  });

  const filteredStaffs = useMemo(() => {
    if (selectedCo === '전체') return staffs;
    return staffs.filter((staff) => staff.company === selectedCo);
  }, [selectedCo, staffs]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('work_type_change_history')
        .select('*')
        .order('changed_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (selectedCo !== '전체') {
        query = query.eq('company', selectedCo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data ?? []) as WorkTypeRecord[]);
    } catch (error) {
      console.warn('근무형태 변경 이력 조회 실패:', error);
      setRecords([]);
      toast('근무형태 변경 이력을 불러오지 못했습니다.', 'warning');
    } finally {
      setLoading(false);
    }
  }, [selectedCo]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    const keyword = searchName.trim();
    if (!keyword) return records;
    return records.filter((record) => record.staff_name?.includes(keyword));
  }, [records, searchName]);

  const latestByStaff = useMemo(() => {
    const map = new Map<string, WorkTypeRecord>();
    records.forEach((record) => {
      if (!record.staff_id) return;
      if (!map.has(record.staff_id)) {
        map.set(record.staff_id, record);
      }
    });
    return map;
  }, [records]);

  const handleStaffSelect = (staffId: string) => {
    const selectedStaff = filteredStaffs.find((staff) => String(staff.id) === staffId);
    setForm((prev) => ({
      ...prev,
      staff_id: staffId,
      staff_name: selectedStaff?.name ?? '',
      prev_type: getCurrentWorkType(selectedStaff),
    }));
  };

  const resetForm = () => {
    setForm((prev) => ({
      ...prev,
      staff_id: '',
      staff_name: '',
      changed_date: new Date().toISOString().slice(0, 10),
      prev_type: '',
      new_type: '정규직',
      reason: '',
    }));
  };

  const handleSave = async () => {
    if (!form.staff_id || !form.changed_date || !form.new_type) {
      toast('직원, 변경일, 변경 근무형태를 확인해주세요.', 'warning');
      return;
    }

    const selectedStaff = filteredStaffs.find((staff) => String(staff.id) === form.staff_id);
    if (!selectedStaff) {
      toast('선택한 직원을 찾을 수 없습니다.', 'error');
      return;
    }

    setSaving(true);
    const actor = readClientAuditActor();

    try {
      const payload: WorkTypeRecord = {
        staff_id: String(form.staff_id),
        staff_name: form.staff_name || selectedStaff.name,
        changed_date: form.changed_date,
        prev_type: form.prev_type || getCurrentWorkType(selectedStaff),
        new_type: form.new_type,
        reason: form.reason.trim(),
        approver: form.approver.trim(),
        company: selectedStaff.company || selectedCo,
      };

      const { data, error } = await supabase
        .from('work_type_change_history')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      const nextPermissions = {
        ...(selectedStaff.permissions || {}),
        current_work_type: form.new_type,
      };

      const { error: updateWithColumnError } = await supabase
        .from('staff_members')
        .update({
          employment_type: form.new_type,
          permissions: nextPermissions,
        })
        .eq('id', form.staff_id);

      if (updateWithColumnError) {
        const { error: fallbackError } = await supabase
          .from('staff_members')
          .update({ permissions: nextPermissions })
          .eq('id', form.staff_id);

        if (fallbackError) {
          throw fallbackError;
        }
      }

      await logAudit(
        '근무형태변경',
        'staff_member',
        form.staff_id,
        {
          employee_no: selectedStaff.employee_no || null,
          staff_name: selectedStaff.name,
          ...buildAuditDiff(
            {
              employment_type: payload.prev_type || null,
            },
            {
              employment_type: payload.new_type,
            },
            ['employment_type'],
          ),
          reason: payload.reason || null,
          effective_date: payload.changed_date,
        },
        actor.userId,
        actor.userName,
      );

      setRecords((prev) => [data as WorkTypeRecord, ...prev]);
      toast('근무형태 변경 이력이 저장되었습니다.', 'success');
      setShowForm(false);
      resetForm();
      fetchRecords();
    } catch (error) {
      console.error('근무형태 변경 저장 실패:', error);
      toast('근무형태 변경 이력을 저장하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: WorkTypeRecord) => {
    if (!record.id) return;
    if (!window.confirm(`${record.staff_name}님의 근무형태 변경 이력을 삭제할까요?`)) return;

    const actor = readClientAuditActor();

    try {
      const { error } = await supabase
        .from('work_type_change_history')
        .delete()
        .eq('id', record.id);

      if (error) throw error;

      await logAudit(
        '근무형태변경삭제',
        'work_type_change_history',
        String(record.id),
        {
          staff_id: record.staff_id,
          staff_name: record.staff_name,
          before: record,
        },
        actor.userId,
        actor.userName,
      );

      setRecords((prev) => prev.filter((item) => String(item.id) !== String(record.id)));
      toast('근무형태 변경 이력을 삭제했습니다.', 'success');
    } catch (error) {
      console.error('근무형태 변경 삭제 실패:', error);
      toast('근무형태 변경 이력을 삭제하지 못했습니다.', 'error');
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-5" data-testid="attendance-analysis-worktype-history">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">근무형태이력</h2>
          <p className="text-xs text-[var(--toss-gray-3)]">
            직원별 근무형태 변경 원장을 조회하고 최신 상태를 함께 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm((prev) => !prev);
          }}
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          {showForm ? '입력 닫기' : '+ 변경 이력 추가'}
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--foreground)]">현재 근무형태 현황</h3>
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">
            {filteredStaffs.length}명
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {filteredStaffs.map((staff) => {
            const latestRecord = latestByStaff.get(String(staff.id));
            const currentType = latestRecord?.new_type || getCurrentWorkType(staff) || '미설정';
            return (
              <div
                key={staff.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2"
              >
                <span className="text-xs font-bold text-[var(--foreground)]">{staff.name}</span>
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[10px] font-black ${
                    TYPE_STYLES[currentType] || 'bg-[var(--tab-bg)] text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  {currentType}
                </span>
              </div>
            );
          })}
          {filteredStaffs.length === 0 && (
            <p className="text-xs text-[var(--toss-gray-3)]">표시할 직원이 없습니다.</p>
          )}
        </div>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-[var(--accent)]/20 bg-blue-50/50 p-4 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-[var(--accent)]">근무형태 변경 등록</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)]">
              변경일 기준으로 이력을 남기고 직원 최신 근무형태도 함께 갱신합니다.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">직원</span>
              <select
                value={form.staff_id}
                onChange={(event) => handleStaffSelect(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="">직원을 선택하세요</option>
                {filteredStaffs.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.department || '부서 미지정'})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">변경일</span>
              <SmartDatePicker
                value={form.changed_date}
                onChange={(value) => setForm((prev) => ({ ...prev, changed_date: value }))}
                inputClassName="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">이전 근무형태</span>
              <input
                value={form.prev_type}
                onChange={(event) => setForm((prev) => ({ ...prev, prev_type: event.target.value }))}
                placeholder="기존 근무형태"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">변경 근무형태</span>
              <select
                value={form.new_type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, new_type: event.target.value as WorkType }))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                {WORK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 md:col-span-2 xl:col-span-1">
              <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">승인자</span>
              <input
                value={form.approver}
                onChange={(event) => setForm((prev) => ({ ...prev, approver: event.target.value }))}
                placeholder="승인자 이름"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">변경 사유</span>
            <textarea
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
              rows={3}
              placeholder="예: 계약 전환, 부서 운영 변경, 근무 조정"
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-xs font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--tab-bg)]"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <input
          value={searchName}
          onChange={(event) => setSearchName(event.target.value)}
          placeholder="직원명 검색"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 md:max-w-xs"
        />
        <button
          type="button"
          onClick={fetchRecords}
          disabled={loading}
          className="w-fit rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--tab-bg)] disabled:opacity-50"
        >
          {loading ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--muted)]">
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-widest text-[var(--toss-gray-4)]">
                <th className="px-4 py-3 font-bold">변경일</th>
                <th className="px-4 py-3 font-bold">직원</th>
                <th className="px-4 py-3 font-bold">이전</th>
                <th className="px-4 py-3 font-bold">변경 후</th>
                <th className="px-4 py-3 font-bold">승인자</th>
                <th className="px-4 py-3 font-bold">사유</th>
                <th className="px-4 py-3 font-bold text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
                    표시할 근무형태 변경 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={`${record.id}-${record.staff_id}`} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-semibold text-[var(--foreground)]">{record.changed_date}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[var(--foreground)]">{record.staff_name}</div>
                      <div className="text-[11px] text-[var(--toss-gray-3)]">{record.company}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{record.prev_type || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-lg border px-2 py-1 text-[11px] font-black ${
                          TYPE_STYLES[record.new_type] || 'bg-[var(--tab-bg)] text-[var(--foreground)] border-[var(--border)]'
                        }`}
                      >
                        {record.new_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{record.approver || '-'}</td>
                    <td className="px-4 py-3 text-[var(--toss-gray-4)]">{record.reason || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(record)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
