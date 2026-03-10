'use client';

import { useState } from 'react';
import { SYSTEM_MASTER_ACCOUNT_ID, isNamedSystemMasterAccount } from '@/lib/system-master';

type ManualGrantUpdate = {
  staffId: string;
  total: number;
  used: number;
};

async function saveManualGrant(updates: ManualGrantUpdate[]) {
  const response = await fetch('/api/admin/annual-leave/manual-grant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || '연차 수동 부여 저장에 실패했습니다.');
  }

  return payload as { message?: string };
}

// 기본 함수 이름을 영문 대문자로 시작하도록 변경해
// React ESLint 규칙을 만족시킵니다. default export 이므로
// 외부에서의 import 이름(연차수동부여)은 그대로 유지됩니다.
export default function AnnualLeaveManualGrant({
  user,
  staffs = [],
  onRefresh,
}: {
  user?: any;
  staffs?: any[];
  onRefresh?: () => void;
}) {
  const [companyFilter, setCompanyFilter] = useState<string>('전체');
  const [edits, setEdits] = useState<Record<string, { total: number; used: number }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const canManage = isNamedSystemMasterAccount(user);
  const list = Array.isArray(staffs) ? staffs : [];
  const companies = Array.from(new Set(list.map((staff: any) => staff.company).filter(Boolean))).sort();
  const filtered = companyFilter === '전체' ? list : list.filter((staff: any) => staff.company === companyFilter);

  const getTotal = (staff: any) => edits[staff.id]?.total ?? Number(staff.annual_leave_total) ?? 0;
  const getUsed = (staff: any) => edits[staff.id]?.used ?? Number(staff.annual_leave_used) ?? 0;

  const setTotal = (id: string, value: number) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], total: value } }));
  const setUsed = (id: string, value: number) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], used: value } }));

  const handleSaveOne = async (staff: any) => {
    if (!canManage) return;

    setSaving(true);
    setMessage('');

    try {
      const payload = await saveManualGrant([
        {
          staffId: String(staff.id),
          total: getTotal(staff),
          used: getUsed(staff),
        },
      ]);

      setMessage(payload.message || `${staff.name} 연차 저장 완료`);
      onRefresh?.();
    } catch (error: any) {
      setMessage(`저장 실패: ${error?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!canManage) return;

    setSaving(true);
    setMessage('');

    try {
      const payload = await saveManualGrant(
        filtered.map((staff: any) => ({
          staffId: String(staff.id),
          total: getTotal(staff),
          used: getUsed(staff),
        })),
      );

      setMessage(payload.message || `총 ${filtered.length}명 연차 반영 완료`);
      onRefresh?.();
    } catch (error: any) {
      setMessage(`저장 실패: ${error?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="max-w-5xl rounded-[16px] border border-[var(--toss-border)] bg-white p-8 shadow-xl">
        <h3 className="mb-2 text-xl font-semibold text-[var(--foreground)]">연차 개수 수동 부여</h3>
        <p className="text-sm text-[var(--toss-gray-3)]">
          <code className="rounded bg-[var(--toss-gray-1)] px-1.5 py-0.5 font-mono text-[11px]">{SYSTEM_MASTER_ACCOUNT_ID}</code>
          {' '}계정만 연차 수동 부여를 저장할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl rounded-[16px] border border-[var(--toss-border)] bg-white p-8 shadow-xl">
      <h3 className="mb-2 text-xl font-semibold text-[var(--foreground)]">연차 개수 수동 부여</h3>
      <p className="mb-6 text-[11px] font-bold text-[var(--toss-gray-3)]">
        신규입사자 포함 모든 직원의 연차 부여일·사용일을 직접 설정할 수 있습니다. 자동 부여 규칙과 무관하게 반영됩니다.
      </p>

      <div className="mb-6 flex items-center gap-4">
        <label className="text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">회사</label>
        <select
          value={companyFilter}
          onChange={(event) => setCompanyFilter(event.target.value)}
          className="rounded-[16px] border border-[var(--toss-border)] px-4 py-2 text-sm font-bold"
        >
          <option value="전체">전체</option>
          {companies.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-[16px] p-3 text-sm font-bold ${
            message.includes('실패') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--toss-border)]">
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">이름</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">회사/부서</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">입사일</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">부여 연차(일)</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">사용 연차(일)</th>
              <th className="pb-3 text-[11px] font-semibold uppercase text-[var(--toss-gray-3)]">동작</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((staff: any) => (
              <tr key={staff.id} className="border-b border-[var(--toss-border)]">
                <td className="py-3 font-bold text-[var(--foreground)]">{staff.name}</td>
                <td className="py-3 text-xs text-[var(--toss-gray-3)]">
                  {staff.company} / {staff.department || '-'}
                </td>
                <td className="py-3 text-xs text-[var(--toss-gray-4)]">{staff.join_date || staff.joined_at || '-'}</td>
                <td className="py-3">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={getTotal(staff)}
                    onChange={(event) => setTotal(staff.id, Number(event.target.value) || 0)}
                    className="w-20 rounded-[12px] border border-[var(--toss-border)] p-2 text-sm font-bold"
                  />
                </td>
                <td className="py-3">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={getUsed(staff)}
                    onChange={(event) => setUsed(staff.id, Number(event.target.value) || 0)}
                    className="w-20 rounded-[12px] border border-[var(--toss-border)] p-2 text-sm font-bold"
                  />
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => void handleSaveOne(staff)}
                    disabled={saving}
                    className="rounded-[12px] bg-[var(--toss-blue)] px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    저장
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center font-bold text-[var(--toss-gray-3)]">표시할 직원이 없습니다.</p>
      )}

      {filtered.length > 0 && (
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={saving}
          className="mt-6 w-full rounded-[12px] bg-teal-600 py-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : `위 ${filtered.length}명 일괄 저장`}
        </button>
      )}
    </div>
  );
}
