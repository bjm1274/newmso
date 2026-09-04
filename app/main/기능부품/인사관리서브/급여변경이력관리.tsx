'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { logAudit, readClientAuditActor } from '@/lib/audit';
import type { StaffMember } from '@/types';
import type { SalaryChangeType } from '@/lib/db/schema';

interface SalaryChangeRow {
  id: string;
  staff_id: string;
  change_type: string;
  before_value: number | null;
  after_value: number | null;
  effective_date: string;
  reason: string | null;
  created_at: string | null;
}

const CHANGE_TYPE_OPTIONS: { value: SalaryChangeType; label: string }[] = [
  { value: 'base_salary', label: '기본급 (월)' },
  { value: 'meal_allowance', label: '식대 (비과세)' },
  { value: 'position_allowance', label: '직책수당 (과세)' },
  { value: 'overtime_allowance', label: '고정연장수당 (과세)' },
  { value: 'night_work_allowance', label: '고정야간수당 (과세)' },
  { value: 'holiday_work_allowance', label: '휴일수당 (과세)' },
  { value: 'annual_leave_pay', label: '연차수당 (과세)' },
  { value: 'night_duty_allowance', label: '야간/당직 (비과세)' },
  { value: 'vehicle_allowance', label: '자가운전 (비과세)' },
  { value: 'childcare_allowance', label: '보육수당 (비과세)' },
  { value: 'research_allowance', label: '연구비 (비과세)' },
  { value: 'other_taxfree', label: '기타비과세' },
];

function getChangeTypeLabel(type: string) {
  const match = CHANGE_TYPE_OPTIONS.find((opt) => opt.value === type);
  if (match) return match.label;
  if (type === 'meal') return '식대';
  if (type === 'vehicle') return '자가운전';
  if (type === 'childcare') return '보육수당';
  if (type === 'research') return '연구비';
  if (type === 'other') return '기타비과세';
  return type;
}

interface Props {
  open: boolean;
  onClose: () => void;
  staff: StaffMember | null;
  onRefresh?: () => void;
}

export default function SalaryChangeHistoryModal({
  open,
  onClose,
  staff,
  onRefresh,
}: Props) {
  const [historyList, setHistoryList] = useState<SalaryChangeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 등록/수정 폼 상태
  const [formChangeType, setFormChangeType] = useState<SalaryChangeType>('base_salary');
  const [formEffectiveDate, setFormEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [formBeforeValue, setFormBeforeValue] = useState<number | ''>('');
  const [formAfterValue, setFormAfterValue] = useState<number | ''>('');
  const [formReason, setFormReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchHistory = async () => {
    if (!staff?.id) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from('salary_change_history')
        .select('id, staff_id, change_type, before_value, after_value, effective_date, reason, created_at')
        .eq('staff_id', String(staff.id))
        .order('effective_date', { ascending: false });

      if (error) throw error;
      setHistoryList((data || []) as SalaryChangeRow[]);
    } catch (err) {
      console.error('급여 변경 이력 로드 실패:', err);
      toast('급여 변경 이력을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && staff?.id) {
      void fetchHistory();
      setIsAdding(false);
      setEditingId(null);
    }
  }, [open, staff?.id]);

  const handleStartAdd = () => {
    setEditingId(null);
    setFormChangeType('base_salary');
    setFormEffectiveDate(new Date().toISOString().slice(0, 10));
    setFormBeforeValue(Number(staff?.base_salary || 0));
    setFormAfterValue('');
    setFormReason('급여 조정');
    setIsAdding(true);
  };

  const handleStartEdit = (row: SalaryChangeRow) => {
    setIsAdding(false);
    setEditingId(row.id);
    setFormChangeType(row.change_type as SalaryChangeType);
    setFormEffectiveDate(row.effective_date ? row.effective_date.slice(0, 10) : '');
    setFormBeforeValue(row.before_value ?? '');
    setFormAfterValue(row.after_value ?? '');
    setFormReason(row.reason || '');
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!staff?.id) return;
    if (!formEffectiveDate) {
      toast('발효 일자를 입력해 주세요.', 'warning');
      return;
    }
    if (formAfterValue === '' || Number(formAfterValue) < 0) {
      toast('변경 후 금액을 올바르게 입력해 주세요.', 'warning');
      return;
    }

    setSaving(true);
    const actor = readClientAuditActor();

    try {
      const payload = {
        staff_id: String(staff.id),
        change_type: formChangeType,
        before_value: formBeforeValue === '' ? null : Number(formBeforeValue),
        after_value: Number(formAfterValue),
        effective_date: formEffectiveDate,
        reason: formReason.trim() || '관리자 수동 조정',
        created_by: actor.userId || null,
        previous_salary: formBeforeValue === '' ? null : Number(formBeforeValue),
      };

      if (editingId) {
        const { error } = await db
          .from('salary_change_history')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;

        await logAudit(
          '급여변경이력수정',
          'salary_change_history',
          editingId,
          {
            staff_name: staff.name,
            change_type: formChangeType,
            after_value: payload.after_value,
            effective_date: formEffectiveDate,
          },
          actor.userId,
          actor.userName
        );

        toast('급여 변경 이력이 수정되었습니다.', 'success');
      } else {
        const newId = crypto.randomUUID();
        const { error } = await db.from('salary_change_history').insert({
          id: newId,
          ...payload,
          created_at: new Date().toISOString(),
        });

        if (error) throw error;

        await logAudit(
          '급여변경이력등록',
          'salary_change_history',
          newId,
          {
            staff_name: staff.name,
            change_type: formChangeType,
            after_value: payload.after_value,
            effective_date: formEffectiveDate,
          },
          actor.userId,
          actor.userName
        );

        toast('급여 변경 이력이 새로 등록되었습니다.', 'success');
      }

      handleCancelForm();
      await fetchHistory();
      onRefresh?.();
    } catch (err) {
      console.error('급여 변경 이력 저장 실패:', err);
      toast('이력 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SalaryChangeRow) => {
    if (!confirm(`[${getChangeTypeLabel(row.change_type)}] ${row.effective_date} 이력을 삭제하시겠습니까?\n삭제 시 당월 급여정산의 일할 계산 고정이 해제됩니다.`)) {
      return;
    }

    const actor = readClientAuditActor();
    try {
      const { error } = await db
        .from('salary_change_history')
        .delete()
        .eq('id', row.id);

      if (error) throw error;

      await logAudit(
        '급여변경이력삭제',
        'salary_change_history',
        row.id,
        {
          staff_name: staff?.name,
          change_type: row.change_type,
          effective_date: row.effective_date,
          deleted_after_value: row.after_value,
        },
        actor.userId,
        actor.userName
      );

      toast('급여 변경 이력이 삭제되었습니다.', 'success');
      await fetchHistory();
      onRefresh?.();
    } catch (err) {
      console.error('이력 삭제 실패:', err);
      toast('이력 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  if (!open || !staff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[var(--toss-blue-light)] flex items-center justify-center text-sm font-bold text-[var(--accent)]">
              {staff.name[0]}
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>{staff.name}</span> 급여 변경 이력 관리
              </h3>
              <p className="text-xs text-[var(--toss-gray-3)]">
                현재 마스터 기본급: ₩{(staff.base_salary || 0).toLocaleString()} · 전자결재 및 수동 급여 변동 이력(일할 계산 기준)을 관리합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 바디 */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* 등록/수정 폼 */}
          {(isAdding || editingId) && (
            <div className="p-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--toss-blue-light)]/20 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-xs font-bold text-[var(--foreground)]">
                  {editingId ? '✏️ 급여 변경 이력 수정' : '➕ 신규 급여 변동 이력 등록'}
                </span>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-xs text-[var(--toss-gray-3)] hover:text-[var(--foreground)]"
                >
                  취소
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">변경 항목</label>
                  <select
                    value={formChangeType}
                    onChange={(e) => setFormChangeType(e.target.value as SalaryChangeType)}
                    className="w-full h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold outline-none"
                  >
                    {CHANGE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">발효 일자</label>
                  <input
                    type="date"
                    value={formEffectiveDate}
                    onChange={(e) => setFormEffectiveDate(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">변경 전 금액 (원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formBeforeValue === '' ? '' : Number(formBeforeValue).toLocaleString()}
                    onChange={(e) => {
                      const num = parseInt(e.target.value.replace(/,/g, ''), 10);
                      setFormBeforeValue(isNaN(num) ? '' : num);
                    }}
                    placeholder="0"
                    className="w-full h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">변경 후 금액 (원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formAfterValue === '' ? '' : Number(formAfterValue).toLocaleString()}
                    onChange={(e) => {
                      const num = parseInt(e.target.value.replace(/,/g, ''), 10);
                      setFormAfterValue(isNaN(num) ? '' : num);
                    }}
                    placeholder="예: 2,500,000"
                    className="w-full h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-4)] block mb-1">변경 사유</label>
                <input
                  type="text"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="예: 정기 연봉 인상, 승진, 직책 수당 조정 등"
                  className="w-full h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : editingId ? '수정 완료' : '등록'}
                </button>
              </div>
            </div>
          )}

          {/* 이력 테이블 상단 액션 */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--foreground)]">
              등록된 급여 변동 이력 ({historyList.length}건)
            </span>
            {!isAdding && !editingId && (
              <button
                type="button"
                onClick={handleStartAdd}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1 shadow-xs"
              >
                <span>➕</span> 이력 직접 등록
              </button>
            )}
          </div>

          {/* 이력 테이블 */}
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--toss-gray-3)] border border-dashed border-[var(--border)] rounded-xl">
              급여 변경 이력을 불러오는 중입니다...
            </div>
          ) : historyList.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--toss-gray-3)] border border-dashed border-[var(--border)] rounded-xl space-y-2">
              <p>등록된 급여 변경 이력이 없습니다.</p>
              <p className="text-[11px] text-[var(--toss-gray-4)]">
                전자결재로 급여인상이 승인되거나 수동으로 등록하면 이곳에 기록되어 급여정산 일할 계산에 자동 반영됩니다.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2.5 px-3">발효일자</th>
                    <th className="py-2.5 px-3">항목</th>
                    <th className="py-2.5 px-3 text-right">변경 전</th>
                    <th className="py-2.5 px-3 text-right">변경 후</th>
                    <th className="py-2.5 px-3">사유</th>
                    <th className="py-2.5 px-3 w-24 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {historyList.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-[var(--foreground)]">
                        {row.effective_date ? row.effective_date.slice(0, 10) : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200 text-[10px]">
                          {getChangeTypeLabel(row.change_type)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--toss-gray-3)]">
                        {row.before_value !== null ? `₩${Number(row.before_value).toLocaleString()}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-[var(--accent)]">
                        ₩{Number(row.after_value || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--toss-gray-4)] max-w-xs truncate" title={row.reason || ''}>
                        {row.reason || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(row)}
                          className="px-2 py-1 rounded bg-[var(--muted)] text-[var(--toss-gray-4)] text-[10px] font-bold hover:bg-[var(--border)]"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="px-2 py-1 rounded bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 풋터 */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4 bg-[var(--muted)]/20">
          <p className="text-[11px] text-[var(--toss-gray-3)]">
            💡 잘못 연동된 과거 이력을 삭제하면, 당월 급여정산에서 마스터 기본급 기준으로 정상 정산됩니다.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs font-bold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
