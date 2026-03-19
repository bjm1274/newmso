'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type DeptStat = { dept: string; company?: string; total: number; used: number; remain: number; expiring: number };

export default function LeaveDashboard({ staffs = [], selectedCo, currentUser }: Record<string, unknown>) {
  const _staffs = (staffs as Record<string, unknown>[]) ?? [];
  const [byDept, setByDept] = useState<DeptStat[]>([]);

  useEffect(() => {
    const filtered = selectedCo === '전체' ? _staffs : _staffs.filter((s: any) => s.company === selectedCo);
    const map: Record<string, { total: number; used: number; company?: string }> = {};
    filtered.forEach((s: any) => {
      const dept = s.department || '미지정';
      const company = s.company || '미지정';
      const key = selectedCo === '전체' ? `${company} - ${dept}` : dept;

      if (!map[key]) map[key] = { total: 0, used: 0, company };
      map[key].total += s.annual_leave_total ?? 0;
      map[key].used += s.annual_leave_used ?? 0;
    });
    setByDept(
      Object.entries(map).map(([key, v]) => ({
        dept: key,
        company: v.company,
        total: v.total,
        used: v.used,
        remain: Math.max(0, v.total - v.used),
        expiring: 0,
      }))
    );
  }, [_staffs, selectedCo]);

  const [viewMode, setViewMode] = useState<'dept' | 'personal'>('dept');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planDates, setPlanDates] = useState('');
  const [planReason, setPlanReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? _staffs : _staffs.filter((s: any) => s.company === selectedCo)),
    [_staffs, selectedCo]
  );

  const submitLeavePlan = async (staff: any, remain: number) => {
    if (!planDates.trim()) return alert('사용 예정일(계획)을 입력해주세요.');
    setSubmitting(true);
    try {
      await supabase.from('approvals').insert([{
        sender_id: staff.id,
        sender_name: staff.name,
        sender_company: staff.company || '미지정',
        type: '연차사용계획',
        title: `[제출] ${staff.name} 연차 사용 계획서`,
        content: `미사용 연차 ${remain}일에 대한 사용 계획서입니다.\n\n사용 예정일/계획:\n${planDates}\n\n비고:\n${planReason}`,
        status: '대기',
        meta_data: { type: 'annual_leave_plan', remaining: remain }
      }]);
      alert('연차 사용 계획서가 성공적으로 제출되었습니다. (전자결재 상신)');
      setShowPlanModal(false);
      setPlanDates('');
      setPlanReason('');
    } catch {
      alert('제출 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const personalList = useMemo(() => {
    // 팀장/관리자는 팀 전체, 일반 직원은 본인만 기본 표시
    const _cu = currentUser as Record<string, unknown> | undefined;
    const isManager = ['팀장', '실장', '부장', '원장', '병원장', '대표이사'].includes((_cu?.position as string) || '');
    if (isManager && _cu?.department) {
      return filteredStaffs.filter((s: any) => s.department === (_cu.department as string));
    }
    if (_cu?.id) {
      return filteredStaffs.filter((s: any) => s.id === (_cu.id as string));
    }
    return filteredStaffs;
  }, [filteredStaffs, currentUser]);

  return (
    <div className="border border-[var(--border)] p-4 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          연차 종합 대시보드
          {selectedCo !== '전체' && <span className="px-2 py-0.5 bg-blue-50 text-[var(--accent)] text-[10px] rounded-[var(--radius-md)]">{selectedCo as string}</span>}
        </h3>
        <div className="flex gap-0.5 bg-[var(--tab-bg)] rounded-[var(--radius-md)] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('dept')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'dept' ? 'bg-[var(--foreground)] text-white' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
              }`}
          >
            팀별
          </button>
          <button
            type="button"
            onClick={() => setViewMode('personal')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'personal' ? 'bg-[var(--foreground)] text-white' : 'text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'
              }`}
          >
            개인별
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: '인원', val: filteredStaffs.length, unit: '명', color: 'text-[var(--foreground)]' },
          { label: '총 연차', val: filteredStaffs.reduce((acc: number, s: any) => acc + (s.annual_leave_total ?? 0), 0), unit: '일', color: 'text-[var(--accent)]' },
          { label: '사용', val: filteredStaffs.reduce((acc: number, s: any) => acc + (s.annual_leave_used ?? 0), 0), unit: '일', color: 'text-amber-600' },
          { label: '잔여', val: filteredStaffs.reduce((acc: number, s: any) => acc + Math.max(0, (s.annual_leave_total ?? 0) - (s.annual_leave_used ?? 0)), 0), unit: '일', color: 'text-emerald-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-[var(--muted)]/50 p-2.5 rounded-[var(--radius-md)] border border-[var(--border)] text-center">
            <p className="text-[10px] font-bold text-[var(--toss-gray-3)] mb-0.5">{stat.label}</p>
            <p className={`text-sm font-bold ${stat.color}`}>{stat.val}{stat.unit}</p>
          </div>
        ))}
      </div>

      {viewMode === 'dept' ? (
        <div className="space-y-3">
          {byDept.map((x) => (
            <div key={x.dept} className="p-3 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
              <p className="text-sm font-semibold text-[var(--foreground)] mb-2">{x.dept}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-[var(--toss-gray-3)]">총</span>{' '}
                  <span className="font-semibold">{x.total}일</span>
                </div>
                <div>
                  <span className="text-[var(--toss-gray-3)]">사용</span>{' '}
                  <span className="font-semibold text-amber-600">{x.used}일</span>
                </div>
                <div>
                  <span className="text-[var(--toss-gray-3)]">잔여</span>{' '}
                  <span className="font-semibold text-emerald-600">{x.remain}일</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${x.total ? (x.remain / x.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
          {personalList.map((s: any) => {
            const total = s.annual_leave_total ?? 0;
            const used = s.annual_leave_used ?? 0;
            const remain = Math.max(0, total - used);
            return (
              <div
                key={s.id}
                className="p-4 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)] flex flex-col gap-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      {s.name}{' '}
                      <span className="text-[11px] text-[var(--toss-gray-3)] font-normal">
                        ({s.department || '미지정'})
                      </span>
                      {selectedCo === '전체' && (
                        <span className="px-1.5 py-0.5 bg-[var(--muted)] text-[var(--toss-gray-3)] text-[9px] rounded-md font-bold">
                          {s.company}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">
                      총 {total}일 · 사용 {used}일 · <span className="text-[var(--foreground)]">잔여 <span className="font-semibold text-emerald-600">{remain}일</span></span>
                    </p>
                  </div>
                  <div className="w-24 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${total ? (remain / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* 연차 사용 계획서 작성 모달 */}
                {showPlanModal && (
                  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden border border-[var(--border)] animate-in fade-in slide-in-from-bottom-4">
                      <div className="p-4 border-b border-[var(--border)]">
                        <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">연차 사용 계획서 제출</h3>
                        <p className="text-xs text-red-500 font-semibold mt-1">잔여 연차 {remain}일에 대한 사용 계획을 등록합니다.</p>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest">사용 목표 일정 (월/일)</label>
                          <textarea
                            value={planDates}
                            onChange={(e) => setPlanDates(e.target.value)}
                            placeholder="예: \n8월 15일, 16일 (2일)\n9월 추석 연휴 전후 (3일)\n11월 개인일정 (남은 일수)"
                            className="w-full h-24 p-3 text-sm font-medium border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none resize-none"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase tracking-widest">추가 메모 (선택)</label>
                          <input
                            type="text"
                            value={planReason}
                            onChange={(e) => setPlanReason(e.target.value)}
                            placeholder="업무 인수 인계 등 특이사항 기재"
                            className="w-full p-3 text-sm font-medium border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none"
                          />
                        </div>
                      </div>
                      <div className="p-4 bg-[var(--page-bg)] border-t border-[var(--border)] flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPlanModal(false)}
                          className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => submitLeavePlan(s, remain)}
                          disabled={submitting}
                          className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                        >
                          {submitting ? '제출 중...' : '계획서 제출 (전자결재)'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 연차 촉진 알림 연동 배너 (개인별 뷰에서 잔여 연차가 있을 때) */}
                {remain > 0 && s.id && (currentUser as Record<string, unknown> | undefined)?.id === (s.id as string) && (
                  <div className="px-4 py-3 bg-red-50/50 border-t border-red-100 flex items-center justify-between text-xs mt-3 rounded-[var(--radius-md)]">
                    <div>
                      <span className="font-semibold text-red-600">🚨 연차 사용 촉진 안내</span>
                      <p className="text-[11px] text-red-500 font-medium mt-0.5">미사용 연차 {remain}일에 대해 연차사용계획서를 의무 제출해야 합니다.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlanModal(true)}
                      className="px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg text-[11px] hover:bg-red-700 transition-colors shrink-0 shadow-sm"
                    >
                      계획서 제출
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
