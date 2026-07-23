'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { calculateLeaveDays } from '@/lib/annual-leave-ledger';
import { logAudit, readClientAuditActor } from '@/lib/audit';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MAvatar from '../공통/MAvatar';
import MKpi from '../공통/MKpi';
import { pickAvatarTone } from './data-hooks';

interface AdminLeaveProps {
  staffs: StaffMember[];
  company?: string;
  user: ErpUser;
}

type LeaveRequestRow = {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days?: number;
  status: '대기' | '승인' | '반려';
  reason?: string | null;
  created_at?: string | null;
};

type ExpiryItem = {
  staff: StaffMember;
  remaining: number;
  expiring: number;
};

export default function 연차관리자({ staffs, company, user }: AdminLeaveProps) {
  const [subTab, setSubTab] = useState<'ledger' | 'approval' | 'expiry'>('ledger');
  const [reloadKey, setReloadKey] = useState(0);

  // 전사 연차 리스트 & 대기 결재건 & 소멸대상
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  /** staff_id → 당해 leave_balances (SSOT) */
  const [balancesByStaff, setBalancesByStaff] = useState<
    Record<string, { total: number; used: number; remaining: number; expired: number; compensated: number }>
  >({});
  const [loading, setLoading] = useState(false);

  // 수동 연차 부여 폼 상태
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [leaveType, setLeaveType] = useState('연차(부여)');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const activeStaffs = useMemo(() => {
    return company && company !== '전체'
      ? staffs.filter((s) => s.status === '재직' && s.company === company)
      : staffs.filter((s) => s.status === '재직');
  }, [staffs, company]);

  const fetchLeaveData = useCallback(async () => {
    setLoading(true);
    // KST 기준 연도 — 직원 화면 useAnnualLeaveSummary 와 동일 (로컬 TZ 어긋남 방지)
    const year = Number(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }),
    ) || new Date().getFullYear();
    try {
      const [reqRes, balRes, legRes] = await Promise.all([
        db.from('leave_requests').select('*').order('start_date', { ascending: false }),
        db
          .from('leave_balances')
          .select('staff_id, total_days, used_days, remaining_days, expired_days, compensated_days')
          .eq('year', year),
        db
          .from('leave_ledger')
          .select('staff_id, entry_type, days'),
      ]);
      if (reqRes.error) throw reqRes.error;
      if (balRes.error) throw balRes.error;
      setRequests((reqRes.data || []) as LeaveRequestRow[]);
      const map: typeof balancesByStaff = {};

      if (legRes.data && legRes.data.length > 0) {
        for (const row of legRes.data) {
          const sid = String((row as { staff_id?: string }).staff_id ?? '');
          if (!sid) continue;
          const entryType = String((row as { entry_type?: string }).entry_type ?? '');
          const days = Number((row as { days?: number }).days) || 0;

          if (!map[sid]) {
            map[sid] = { total: 0, used: 0, remaining: 0, expired: 0, compensated: 0 };
          }
          const current = map[sid];
          current.remaining += days;
          if (entryType === 'use' || entryType === 'manual_used_adjustment') {
            current.used += -days;
          } else if (entryType === 'expire' || entryType === 'manual_expire_adjustment') {
            current.expired += -days;
          } else if (entryType === 'compensate' || entryType === 'manual_compensate_adjustment') {
            current.compensated += -days;
          } else {
            current.total += days;
          }
        }
      } else {
        for (const row of balRes.data || []) {
          const sid = String((row as { staff_id?: string }).staff_id ?? '');
          if (!sid) continue;
          const total = Number((row as { total_days?: number }).total_days) || 0;
          const used = Number((row as { used_days?: number }).used_days) || 0;
          const expired = Number((row as { expired_days?: number }).expired_days) || 0;
          const compensated = Number((row as { compensated_days?: number }).compensated_days) || 0;
          const remainingRaw = (row as { remaining_days?: number }).remaining_days;
          const remaining =
            remainingRaw != null && !Number.isNaN(Number(remainingRaw))
              ? Math.max(0, Number(remainingRaw))
              : Math.max(0, total - used - expired - compensated);
          map[sid] = { total, used, remaining, expired, compensated };
        }
      }
      setBalancesByStaff(map);
    } catch (err) {
      console.error('[AdminLeave] 연차 정보 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaveData();
  }, [fetchLeaveData, reloadKey]);

  // 대장 탭 — leave_balances 우선 (staff_members 다년도 누적 필드 미사용)
  const staffLedger = useMemo(() => {
    return activeStaffs.map((s) => {
      const bal = balancesByStaff[String(s.id)];
      const total = bal?.total ?? Number(s.annual_leave_total ?? 0);
      const used = bal?.used ?? 0;
      const remaining =
        bal?.remaining ?? Math.max(0, total - used);
      return {
        staff: s,
        total,
        used,
        remaining };
    });
  }, [activeStaffs, balancesByStaff]);

  // 소멸 예정자 계산
  const expiryItems = useMemo<ExpiryItem[]>(() => {
    return staffLedger
      .filter((row) => row.remaining > 0)
      .map((row) => ({
        staff: row.staff,
        remaining: row.remaining,
        expiring: row.remaining, // 연말 소멸 기준
      }));
  }, [staffLedger]);

  // KPI 계산
  const kpis = useMemo(() => {
    const totalRemaining = staffLedger.reduce((sum, r) => sum + r.remaining, 0);
    const pendingCount = requests.filter((r) => r.status === '대기').length;
    return {
      totalRemaining,
      pendingCount,
      expiringCount: expiryItems.length };
  }, [staffLedger, requests, expiryItems]);

  // 수동 연차 부여 처리
  const handleQuickSubmit = async () => {
    if (!selectedStaffId) {
      toast('직원을 선택하세요.', 'warning');
      return;
    }
    if (!startDate) {
      toast('시작일자를 입력하세요.', 'warning');
      return;
    }

    setSubmitting(true);
    const finalEnd = endDate || startDate;
    const finalDays = leaveType === '연차(부여)' ? days : calculateLeaveDays(startDate, finalEnd);

    try {
      const payload = {
        staff_id: selectedStaffId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: finalEnd,
        days: finalDays,
        status: '승인',
        reason: reason.trim() || '관리자 수동 처리',
        created_at: new Date().toISOString() };

      const { error: insErr } = await db.from('leave_requests').insert([payload]);
      if (insErr) throw insErr;

      // staff_members.annual_leave_total 직접 쓰기 금지 — leave_balances SSOT 동기화
      await fetch('/api/admin/annual-leave/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: selectedStaffId }) }).catch((e) => console.error('동기화 API 실패:', e));

      toast('수동 연차가 부여되었습니다.', 'success');
      setSelectedStaffId('');
      setStartDate('');
      setEndDate('');
      setReason('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error('[AdminLeave] 수동 부여 실패:', err);
      toast('처리에 실패했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 연차 승인/반려 결재 처리
  const handleStatusUpdate = async (req: LeaveRequestRow, status: '승인' | '반려') => {
    try {
      const { error } = await db
        .from('leave_requests')
        .update({
          status,
          approved_at: status === '승인' ? new Date().toISOString() : null })
        .eq('id', req.id);

      if (error) throw error;

      // staff_members.annual_leave_total 직접 쓰기 금지 — leave_balances SSOT 동기화
      await fetch('/api/admin/annual-leave/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: req.staff_id }) }).catch((e) => console.error(e));

      // 감사 로그
      const actor = readClientAuditActor();
      await logAudit(
        'leave_request_status_updated',
        'leave_request',
        req.id,
        { staff_id: req.staff_id, before_status: req.status, after_status: status },
        actor.userId,
        actor.userName
      );

      toast(`요청을 ${status} 처리했습니다.`, 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error('[AdminLeave] 결재 처리 실패:', err);
      toast('결재 처리에 실패했습니다.', 'error');
    }
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* 서브 세그먼트 */}
      <div
        style={{
          padding: '10px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)' }}
      >
        <div className="m-seg" role="tablist" aria-label="연차 관리 탭">
          <button
            type="button"
            className={subTab === 'ledger' ? 'on' : ''}
            onClick={() => setSubTab('ledger')}
            role="tab"
            aria-selected={subTab === 'ledger'}
          >
            연차 대장
          </button>
          <button
            type="button"
            className={subTab === 'approval' ? 'on' : ''}
            onClick={() => setSubTab('approval')}
            role="tab"
            aria-selected={subTab === 'approval'}
          >
            결재 승인 ({kpis.pendingCount}건)
          </button>
          <button
            type="button"
            className={subTab === 'expiry' ? 'on' : ''}
            onClick={() => setSubTab('expiry')}
            role="tab"
            aria-selected={subTab === 'expiry'}
          >
            소멸 예정자
          </button>
        </div>
      </div>

      {subTab === 'ledger' && (
        <div style={{ padding: '14px 16px 0' }}>
          {/* 수동 연차 부여 폼 */}
          <div className="m-card macos-glass macos-squircle-sm" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>수동 연차 부여 및 차감</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13,
                  background: 'white' }}
              >
                <option value="">대상 직원을 선택하세요</option>
                {activeStaffs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.department} · {s.position})
                  </option>
                ))}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    background: 'white' }}
                >
                  <option value="연차(부여)">연차 부여 (+)</option>
                  <option value="연차(과거사용)">연차 차감 (-)</option>
                  <option value="경조">경조휴가</option>
                  <option value="병가">공가/병가</option>
                </select>

                {leaveType === '연차(부여)' ? (
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    placeholder="부여 일수 (예: 15)"
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13 }}
                  />
                ) : (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13 }}
                  />
                )}
              </div>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13 }}
              />

              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="부여/차감 사유 입력"
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13 }}
              />

              <MBtn variant="primary" block disabled={submitting} onClick={handleQuickSubmit}>
                {submitting ? '처리 중...' : '적용하기'}
              </MBtn>
            </div>
          </div>

          {/* 전사 연차 대장 목록 */}
          <div className="m-section-h" style={{ padding: '8px 0 6px' }}>
            <div className="lbl">임직원 연차 목록</div>
          </div>
          <div className="m-card flush macos-glass macos-squircle">
            {staffLedger.map((row) => (
              <div key={row.staff.id} className="m-list-row">
                <MAvatar tone={pickAvatarTone(row.staff.name)}>{row.staff.name.charAt(0)}</MAvatar>
                <div style={{ flex: 1 }}>
                  <div className="lbl">
                    {row.staff.name}{' '}
                    <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                      {row.staff.department}
                    </span>
                  </div>
                  <div className="sub">
                    총 부여: {row.total}일 · 사용: {row.used}일
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--m-accent)' }}>
                    {row.remaining}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginLeft: 2 }}>
                    일 잔여
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'approval' && (
        <div style={{ padding: '14px 16px 0' }}>
          {/* 승인 대기 목록 */}
          <div className="m-section-h" style={{ padding: '0 0 6px' }}>
            <div className="lbl">승인 대기 건</div>
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              불러오는 중...
            </div>
          ) : requests.filter((r) => r.status === '대기').length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              결재 대기 중인 연차/휴가 요청이 없습니다.
            </div>
          ) : (
            <div className="m-card flush macos-glass macos-squircle">
              {requests
                .filter((r) => r.status === '대기')
                .map((req) => {
                  const staff = staffs.find((s) => String(s.id) === String(req.staff_id));
                  const calcDays = calculateLeaveDays(req.start_date, req.end_date);
                  return (
                    <div
                      key={req.id}
                      className="m-list-row"
                      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MAvatar tone={pickAvatarTone(staff?.name || '')}>
                            {(staff?.name || '?').charAt(0)}
                          </MAvatar>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 800 }}>{staff?.name}</span>
                            <span style={{ fontSize: 10, color: 'var(--z-500)', marginLeft: 4 }}>
                              ({staff?.department})
                            </span>
                          </div>
                        </div>
                        <MChip tone="warning">{req.leave_type}</MChip>
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--z-700)', paddingLeft: 38 }}>
                        <p style={{ margin: '2px 0' }}>
                          📅 {req.start_date} ~ {req.end_date} ({calcDays}일간)
                        </p>
                        {req.reason && <p style={{ margin: '4px 0', fontStyle: 'italic' }}>&quot;{req.reason}&quot;</p>}
                      </div>

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => void handleStatusUpdate(req, '반려')}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--m-danger)',
                            background: 'white',
                            color: 'var(--m-danger)',
                            fontSize: 11,
                            fontWeight: 700 }}
                        >
                          반려
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusUpdate(req, '승인')}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'var(--m-accent)',
                            color: 'white',
                            fontSize: 11,
                            fontWeight: 700 }}
                        >
                          승인
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {subTab === 'expiry' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-card macos-glass macos-squircle-sm" style={{ padding: 14, marginBottom: 12, background: 'var(--m-warning-soft)', borderColor: 'transparent' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-warning)', marginBottom: 4 }}>
              연간 소멸 대상자 안내
            </div>
            <p style={{ fontSize: 11, color: 'var(--z-600)', margin: 0 }}>
              올해 말에 소멸 예정인 잔여 연차가 존재하는 직원 명단입니다.
            </p>
          </div>

          <div className="m-card flush macos-glass macos-squircle">
            {expiryItems.map((item) => (
              <div key={item.staff.id} className="m-list-row">
                <MAvatar tone={pickAvatarTone(item.staff.name)}>{item.staff.name.charAt(0)}</MAvatar>
                <div style={{ flex: 1 }}>
                  <div className="lbl">{item.staff.name}</div>
                  <div className="sub">
                    {item.staff.department} · {item.staff.position}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-warning)' }}>
                    소멸예정 {item.expiring}일
                  </span>
                  <button
                    type="button"
                    title="연차 사용 촉진 발송은 PC 인사관리에서 지원합니다."
                    onClick={() => {
                      toast('연차 사용 촉진 발송은 PC 인사관리에서 지원합니다.', 'warning');
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--m-accent-soft)',
                      color: 'var(--m-accent)',
                      fontSize: 11,
                      fontWeight: 700 }}
                  >
                    권고 발송
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
