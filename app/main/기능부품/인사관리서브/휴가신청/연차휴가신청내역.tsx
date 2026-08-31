'use client';
import { useEffect, useMemo, useState } from 'react';
import { isActiveStaff } from '@/lib/active-staff';
import { isAnnualLeaveType } from '@/lib/annual-leave-calculator';
import { normalizeLeaveType } from '@/lib/leave-type';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

type Leave = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: '대기' | '승인' | '반려';
  staff_members?: { name: string; company?: string; department?: string };
};

type StaffLite = {
  id: string;
  name?: string;
  company?: string;
  department?: string;
  annual_leave_total?: number | null;
  annual_leave_used?: number | null;
};

type LeaveGroup = {
  key: string;
  staffId: string;
  name: string;
  company: string;
  department: string;
  items: Leave[];
};

// 정본 isAnnualLeaveType 으로 통일 ('연차(이력)'·'연차(부여)'는 연차 통계에서 제외)
const isAnnualType = (t: string) => isAnnualLeaveType(t);

const LEAVE_TYPE_OPTIONS = ['연차', '반차', '병가', '경조', '특별휴가', '기타', '연차(이력)'];
const STATUS_OPTIONS: Array<'대기' | '승인' | '반려'> = ['대기', '승인', '반려'];

type EditForm = {
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: '대기' | '승인' | '반려';
};

export default function LeaveRequestList({
  leaves,
  staffList,
  onStatusUpdate,
  onShowPending,
  canManage,
  onEdit,
  onDelete }: {
  leaves: Leave[];
  staffList: StaffLite[];
  onStatusUpdate: (id: string, status: '승인' | '반려') => void;
  onShowPending: () => void;
  canManage: boolean;
  onEdit: (id: string, patch: Partial<Leave>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Leave | null>(null);
  const [form, setForm] = useState<EditForm>({
    leave_type: '연차',
    start_date: '',
    end_date: '',
    reason: '',
    status: '대기' });
  const [saving, setSaving] = useState(false);

  const openEdit = (l: Leave) => {
    setEditing(l);
    setForm({
      leave_type: l.leave_type || '연차',
      start_date: l.start_date || '',
      end_date: l.end_date || l.start_date || '',
      reason: l.reason || '',
      status: l.status });
  };

  const submitEdit = async () => {
    if (!editing || !form.start_date || saving) return;
    setSaving(true);
    try {
      await onEdit(editing.id, {
        leave_type: normalizeLeaveType(form.leave_type),
        start_date: form.start_date,
        end_date: form.end_date || form.start_date,
        reason: form.reason,
        status: form.status });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  // 직원별 그룹핑 — 한 번의 순회로 Map 구성 (JM2)
  const groups = useMemo<LeaveGroup[]>(() => {
    const map = new Map<string, LeaveGroup>();
    for (const l of leaves) {
      const staff = staffList.find((s) => s.id === l.staff_id);
      const name = staff?.name ?? l.staff_members?.name ?? '-';
      const company = staff?.company ?? l.staff_members?.company ?? '';
      const department = staff?.department ?? l.staff_members?.department ?? '';
      const key = l.staff_id || `_${name}`;
      let g = map.get(key);
      if (!g) {
        g = { key, staffId: l.staff_id, name, company, department, items: [] };
        map.set(key, g);
      }
      g.items.push(l);
    }
    for (const g of map.values()) {
      g.items.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [leaves, staffList]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return groups;
    return groups.filter(
      (g) => g.name.includes(q) || g.company.includes(q) || g.department.includes(q),
    );
  }, [groups, search]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pendingCount = leaves.filter((l) => l.status === '대기').length;

  // 휴가 내역 테이블 컬럼 (직원 그룹 펼침 시 표시)
  const leaveColumns = useMemo<Column<Leave>[]>(
    () => [
      {
        key: 'leave_type',
        label: '구분',
        primary: true,
        render: (l) => (
          <span
            className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
              isAnnualType(l.leave_type)
                ? 'bg-[var(--toss-blue-light)] text-[var(--accent)]'
                : l.leave_type === '병가'
                  ? 'bg-red-500/20 text-red-600'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
            }`}
          >
            {l.leave_type}
          </span>
        ) },
      {
        key: 'period',
        label: '기간',
        render: (l) => (
          <span className="text-[var(--toss-gray-3)] whitespace-nowrap">
            {l.start_date}
            {l.end_date && l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}
          </span>
        ) },
      {
        key: 'reason',
        label: '사유',
        render: (l) => (
          <span className="text-[var(--toss-gray-3)] block max-w-xs truncate">
            {l.reason || '—'}
          </span>
        ) },
      {
        key: 'status',
        label: '상태',
        render: (l) => (
          <span
            className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
              l.status === '승인'
                ? 'bg-green-500/20 text-green-600'
                : l.status === '반려'
                  ? 'bg-red-500/20 text-red-600'
                  : 'bg-orange-500/20 text-orange-600'
            }`}
          >
            {l.status}
          </span>
        ) },
      {
        key: 'actions',
        label: '관리',
        align: 'right',
        render: (l) => (
          <div className="flex justify-end gap-2 flex-wrap">
            {l.status === '대기' && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusUpdate(l.id, '승인');
                  }}
                  className="px-3 py-1.5 min-h-[32px] bg-[var(--accent)] text-white text-[10px] font-semibold rounded-[var(--radius-md)] shadow-sm hover:scale-[0.98] transition-all"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusUpdate(l.id, '반려');
                  }}
                  className="px-3 py-1.5 min-h-[32px] bg-red-500/10 border border-red-500/20 text-[10px] font-semibold text-red-600 rounded-[var(--radius-md)] hover:bg-red-500/20 transition-all"
                >
                  반려
                </button>
              </>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(l);
                  }}
                  className="px-3 py-1.5 min-h-[32px] bg-[var(--muted)] border border-[var(--border)] text-[10px] font-semibold text-[var(--toss-gray-4)] rounded-[var(--radius-md)] hover:bg-[var(--card)] transition-all"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(l.id);
                  }}
                  className="px-3 py-1.5 min-h-[32px] bg-red-500/10 border border-red-500/20 text-[10px] font-semibold text-red-600 rounded-[var(--radius-md)] hover:bg-red-500/20 transition-all"
                >
                  삭제
                </button>
              </>
            )}
          </div>
        ) },
    ],
    [canManage, onStatusUpdate, onDelete],
  );

  return (
    <div className="space-y-5">
      {/* 법적 기준 안내 */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-100 rounded-[var(--radius-lg)] p-4 md:p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-4 flex items-center gap-2">
          ⚖️ 근로기준법 기준 연차·휴가 안내
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <p className="font-semibold text-blue-800">제60조 (연차 유급휴가)</p>
            <ul className="text-blue-700 font-bold space-y-1 list-disc list-inside">
              <li>1년 미만: 1개월마다 1일 (최대 11일)</li>
              <li>1년 이상: 15일</li>
              <li>최초 1년 초과 후 매 2년마다 1일 가산 (최대 25일)</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-blue-800">제61조 (연차 사용 촉진)</p>
            <ul className="text-blue-700 font-bold space-y-1 list-disc list-inside">
              <li>1차 촉진: 발생일+1년 전 6개월 시점 10일 이내 서면 통보</li>
              <li>2차 촉진: 사용촉진 후 5일 이내 사용 시도</li>
            </ul>
          </div>
          <div className="md:col-span-2 p-4 bg-[var(--card)]/60 rounded-[var(--radius-lg)] border border-blue-100">
            <p className="font-semibold text-[var(--foreground)]">
              휴가 종류: 연차 · 반차 · 병가 · 경조 · 특별휴가 · 기타
            </p>
          </div>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={onShowPending}
          className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center cursor-pointer hover:shadow-md transition-all group"
        >
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase group-hover:text-[var(--accent)] transition-colors">
            승인 대기
          </p>
          <p className="text-2xl font-semibold text-orange-500 mt-1">{pendingCount}</p>
        </button>
        <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">잔여 연차 (직원별)</p>
          <p className="text-2xl font-semibold text-[var(--accent)] mt-1">
            {staffList.filter((s) => {
              if (!isActiveStaff(s)) return false;
              const total = typeof s.annual_leave_total === 'number' ? s.annual_leave_total : 0;
              const used = s.annual_leave_used ?? 0;
              return total - used > 0;
            }).length}
            명
          </p>
          <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">입사일·사용이력 기반</p>
        </div>
        <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">연차 사용</p>
          <p className="text-2xl font-semibold text-[var(--accent)] mt-1">
            {leaves.filter((l) => isAnnualType(l.leave_type) && l.status === '승인').length}
          </p>
        </div>
        <div className="p-4 bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] text-center">
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">기타 휴가</p>
          <p className="text-2xl font-semibold text-purple-600 mt-1">
            {leaves.filter((l) => !isAnnualType(l.leave_type) && l.status === '승인').length}
          </p>
        </div>
      </div>

      {/* 직원 검색 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="직원 이름·회사·부서 검색"
          aria-label="직원 검색"
          className="w-full md:w-72 px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
        />
        <span className="text-[11px] text-[var(--toss-gray-3)] font-semibold whitespace-nowrap">
          {filtered.length}명 / 총 {leaves.length}건
        </span>
      </div>

      {/* 직원별 그룹 — 클릭 시 사용내역 펼침 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm divide-y divide-[var(--border)]">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[var(--toss-gray-3)] font-bold text-sm">
            표시할 직원이 없습니다.
          </div>
        ) : (
          filtered.map((g) => {
            const isOpen = expanded.has(g.key);
            const cntPending = g.items.filter((l) => l.status === '대기').length;
            const cntAnnual = g.items.filter((l) => isAnnualType(l.leave_type)).length;
            return (
              <div key={g.key}>
                {/* 직원 행 (토글 버튼) */}
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--muted)]/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-[var(--toss-gray-3)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      aria-hidden="true"
                    >
                      ▶
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-[var(--foreground)] truncate">{g.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] truncate">
                        {g.company}
                        {g.department ? ` / ${g.department}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cntPending > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/15 text-orange-600">
                        대기 {cntPending}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--toss-blue-light)] text-[var(--accent)]">
                      연차 {cntAnnual}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--muted)] text-[var(--toss-gray-4)]">
                      총 {g.items.length}건
                    </span>
                  </div>
                </button>

                {/* 펼침: 해당 직원 사용내역 */}
                {isOpen && (
                  <div className="bg-[var(--muted)]/30 px-3 pb-3 pt-2">
                    <ResponsiveTable<Leave>
                      columns={leaveColumns}
                      rows={g.items}
                      keyField="id"
                      emptyMessage="휴가 내역이 없습니다."
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-1"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 수정 모달 — 시스템마스터 전용 */}
      {canManage && editing && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="bg-[var(--card)] w-full max-w-md rounded-2xl overflow-hidden shadow-sm flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
              <h3 className="text-base font-bold text-[var(--foreground)]">휴가 신청내역 수정</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl font-bold p-1 transition-colors disabled:opacity-40"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label htmlFor="edit-leave-type" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  구분
                </label>
                <select
                  id="edit-leave-type"
                  value={form.leave_type}
                  onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                >
                  {(LEAVE_TYPE_OPTIONS.includes(form.leave_type)
                    ? LEAVE_TYPE_OPTIONS
                    : [form.leave_type, ...LEAVE_TYPE_OPTIONS]
                  ).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-start" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                    시작일
                  </label>
                  <input
                    id="edit-start"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                  />
                </div>
                <div>
                  <label htmlFor="edit-end" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                    종료일
                  </label>
                  <input
                    id="edit-end"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-status" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  상태
                </label>
                <select
                  id="edit-status"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EditForm['status'] }))}
                  className="w-full px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-reason" className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">
                  사유
                </label>
                <input
                  id="edit-reason"
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
                />
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-all disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={saving || !form.start_date}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-[11px] font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-40"
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
