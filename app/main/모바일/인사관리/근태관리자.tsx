'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import { formatKoreanClock } from '@/lib/date-formatter';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MAvatar from '../공통/MAvatar';
import MKpi from '../공통/MKpi';
import {
  useTeamAbnormalByDay,
  requestAttendanceClarificationDaily,
  resolveTeamAbnormalForStaffOnDate,
  pickAvatarTone } from './data-hooks';

interface AdminAttendProps {
  staffs: StaffMember[];
  company?: string;
  user: ErpUser;
}

type SubTabId = 'status' | 'roster' | 'abnormal';

export default function 근태관리자({ staffs, company, user }: AdminAttendProps) {
  const [subTab, setSubTab] = useState<SubTabId>('status');
  const [reloadKey, setReloadKey] = useState(0);
  const [dateCursor, setDateCursor] = useState(() => new Date());

  // 1. KPI & 실시간 현황 데이터
  const [todayAttendances, setTodayAttendances] = useState<any[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);

  const formattedToday = useMemo(() => {
    const y = dateCursor.getFullYear();
    const m = String(dateCursor.getMonth() + 1).padStart(2, '0');
    const d = String(dateCursor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [dateCursor]);

  const activeStaffs = useMemo(() => {
    return company && company !== '전체'
      ? staffs.filter((s) => s.status === '재직' && s.company === company)
      : staffs.filter((s) => s.status === '재직');
  }, [staffs, company]);

  const fetchTodayStatus = async () => {
    setTodayLoading(true);
    try {
      const { data, error } = await db
        .from('attendances')
        .select('*')
        .eq('work_date', formattedToday);
      if (error) throw error;
      setTodayAttendances(data || []);
    } catch (err) {
      console.error('[AdminAttend] 오늘 근태 현황 조회 실패:', err);
    } finally {
      setTodayLoading(false);
    }
  };

  useEffect(() => {
    void fetchTodayStatus();
  }, [formattedToday, reloadKey]);

  const stats = useMemo(() => {
    const total = activeStaffs.length;
    const staffIds = new Set(activeStaffs.map((s) => s.id));
    const todayRows = todayAttendances.filter((a) => staffIds.has(a.staff_id));

    let checkInCount = 0;
    let lateCount = 0;
    let leaveCount = 0;

    todayRows.forEach((r) => {
      const status = String(r.status || '').toLowerCase();
      if (r.check_in_time || status.includes('present') || status.includes('정상')) {
        checkInCount++;
      }
      if (status.includes('late') || status.includes('지각')) {
        lateCount++;
      }
      if (status.includes('leave') || status.includes('휴가') || status.includes('annual')) {
        leaveCount++;
      }
    });

    const absentCount = Math.max(0, total - checkInCount - leaveCount);

    return {
      total,
      checkInCount,
      lateCount,
      absentCount,
      leaveCount };
  }, [activeStaffs, todayAttendances]);

  // 2. 근태이상 감지 탭 데이터 연동
  const { rows: abnormalRows, loading: abnormalLoading } = useTeamAbnormalByDay(company, reloadKey);

  const handleSendClarify = async (row: any) => {
    const result = await requestAttendanceClarificationDaily({
      user,
      targetStaffId: row.staffId,
      targetStaffName: row.staffName,
      date: row.date,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      missingCount: row.missingCount });

    if (result.ok) {
      toast(`${row.staffName}님께 사유 요청 알림을 발송했습니다.`, 'success');
      setReloadKey((k) => k + 1);
    } else if (result.reason === 'duplicate') {
      toast('이미 24시간 이내에 요청을 보냈습니다.', 'warning');
    } else {
      toast('알림 발송에 실패했습니다.', 'error');
    }
  };

  const handleResolveAbnormal = async (row: any) => {
    const result = await resolveTeamAbnormalForStaffOnDate({
      user,
      targetStaffId: row.staffId,
      date: row.date });

    if (result.ok) {
      toast(`${row.staffName}님의 근태이상을 정상 처리했습니다.`, 'success');
      setReloadKey((k) => k + 1);
    } else {
      toast('정상 처리에 실패했습니다.', 'error');
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
        <div className="m-seg" role="tablist" aria-label="근태 관리 탭">
          <button
            type="button"
            className={subTab === 'status' ? 'on' : ''}
            onClick={() => setSubTab('status')}
            role="tab"
            aria-selected={subTab === 'status'}
          >
            출근 현황
          </button>
          <button
            type="button"
            className={subTab === 'roster' ? 'on' : ''}
            onClick={() => setSubTab('roster')}
            role="tab"
            aria-selected={subTab === 'roster'}
          >
            근무표 조회
          </button>
          <button
            type="button"
            className={subTab === 'abnormal' ? 'on' : ''}
            onClick={() => setSubTab('abnormal')}
            role="tab"
            aria-selected={subTab === 'abnormal'}
          >
            근태이상 감지
          </button>
        </div>
      </div>

      {subTab === 'status' && (
        <div style={{ padding: '14px 16px 0' }}>
          {/* 날짜 선택 헤더 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              background: 'var(--m-card)',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--m-border)' }}
          >
            <button
              type="button"
              onClick={() => setDateCursor((d) => new Date(d.setDate(d.getDate() - 1)))}
              style={{ padding: 6, background: 'none', border: 'none' }}
            >
              <MIcon name="chevL" size={18} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{formattedToday} 출근현황</span>
            <button
              type="button"
              onClick={() => setDateCursor((d) => new Date(d.setDate(d.getDate() + 1)))}
              style={{ padding: 6, background: 'none', border: 'none' }}
            >
              <MIcon name="chevR" size={18} />
            </button>
          </div>

          {/* 오늘 현황 KPI */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12 }}
          >
            <MKpi icon="users" label="총원" value={String(stats.total)} unit="명" sub="재직 기준" tone="accent" />
            <MKpi icon="checkCircle" label="출근" value={String(stats.checkInCount)} unit="명" sub={`지각 ${stats.lateCount}명`} tone="success" />
            <MKpi icon="alertTri" label="결근" value={String(stats.absentCount)} unit="명" sub="출근 미체크 포함" tone="danger" />
            <MKpi icon="calendar" label="휴가" value={String(stats.leaveCount)} unit="명" sub="연차/반차/병가" tone="accent" />
          </div>

          {/* 출퇴근 리스트 */}
          <div className="m-section-h" style={{ padding: '10px 0 6px' }}>
            <div className="lbl">직원별 오늘 기록</div>
          </div>
          {todayLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              불러오는 중...
            </div>
          ) : activeStaffs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              등록된 재직 직원이 없습니다.
            </div>
          ) : (
            <div className="m-card flush macos-glass macos-squircle">
              {activeStaffs.map((s) => {
                const row = todayAttendances.find((a) => a.staff_id === s.id);
                const status = row ? String(row.status || '').trim() : '결근';
                // ISO 문자열을 잘라 쓰면 UTC 시각이 그대로 나온다(9시간 이르게).
                const checkIn = formatKoreanClock(row?.check_in_time) || '—';
                const checkOut = formatKoreanClock(row?.check_out_time) || '—';

                const tones: Record<string, 'success' | 'warning' | 'danger' | 'accent' | ''> = {
                  present: 'success',
                  정상: 'success',
                  late: 'warning',
                  지각: 'warning',
                  absent: 'danger',
                  결근: 'danger',
                  leave: 'accent',
                  휴가: 'accent' };

                return (
                  <div key={s.id} className="m-list-row">
                    <MAvatar tone={pickAvatarTone(s.name)}>{s.name.charAt(0)}</MAvatar>
                    <div style={{ flex: 1 }}>
                      <div className="lbl">
                        {s.name}{' '}
                        <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                          {s.department} · {s.position}
                        </span>
                      </div>
                      <div className="sub">
                        출근: {checkIn} · 퇴근: {checkOut}
                      </div>
                    </div>
                    <MChip tone={tones[status] || ''}>{status}</MChip>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'roster' && (
        <div style={{ padding: '14px 16px 0' }}>
          {/* 간단 근무표 달력/목록 형태 */}
          <div className="m-card macos-glass macos-squircle-sm" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>전사 근무 스케줄 관리</div>
            <p style={{ fontSize: 11, color: 'var(--z-600)', margin: '0 0 10px 0', lineHeight: '1.4' }}>
              모바일 기기에서 전체 직원들의 근무 조 편성 내역을 확인합니다.
              AI 자동 편성을 포함한 다중 교대근무 편집 도구는 PC 버전의 근무표 편성 탭에서 완벽한 키보드/마우스 컨트롤로 수행하시는 것을 권장합니다.
            </p>
          </div>

          <div className="m-card flush macos-glass macos-squircle">
            {activeStaffs.slice(0, 30).map((s) => (
              <div key={s.id} className="m-list-row">
                <MAvatar tone={pickAvatarTone(s.name)}>{s.name.charAt(0)}</MAvatar>
                <div style={{ flex: 1 }}>
                  <div className="lbl">{s.name}</div>
                  <div className="sub">
                    {s.department} · {s.position}
                  </div>
                </div>
                <MChip tone="accent">스케줄 지정됨</MChip>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'abnormal' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div className="m-card macos-glass macos-squircle-sm" style={{ padding: 14, marginBottom: 12, background: 'var(--m-warning-soft)', borderColor: 'transparent' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--m-warning)', marginBottom: 4 }}>
              최근 28일 근태이상 자동 감지
            </div>
            <p style={{ fontSize: 11, color: 'var(--z-600)', margin: 0 }}>
              지각, 조퇴, 출근/퇴근 미체크(누락) 대상자를 자동으로 탐지하여 알림 사유 요청을 보낼 수 있습니다.
            </p>
          </div>

          {abnormalLoading && abnormalRows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              감지 내역 불러오는 중...
            </div>
          ) : abnormalRows.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              최근 28일 동안 발생한 근태이상이 없습니다.
            </div>
          ) : (
            <div className="m-card flush macos-glass macos-squircle">
              {abnormalRows.map((r, idx) => {
                const label =
                  r.lateMinutes > 0
                    ? `지각 ${r.lateMinutes}분`
                    : r.earlyLeaveMinutes > 0
                      ? `조퇴 ${r.earlyLeaveMinutes}분`
                      : '출퇴근 미체크';

                return (
                  <div key={`${r.staffId}-${r.date}-${idx}`} className="m-list-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div className="lbl" style={{ fontWeight: 800 }}>
                        {r.staffName}{' '}
                        <span style={{ fontSize: 10, color: 'var(--m-danger)', fontWeight: 800 }}>
                          [{label}]
                        </span>
                      </div>
                      <div className="sub">
                        일자: {r.date} · {r.dept}
                      </div>
                      <div className="sub" style={{ marginTop: 2 }}>
                        출근인: {r.hasCheckIn ? '체크' : '누락'} · 퇴근인: {r.hasCheckOut ? '체크' : '누락'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignSelf: 'center' }}>
                      <button
                        type="button"
                        onClick={() => void handleSendClarify(r)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--m-border)',
                          background: 'white',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--z-700)' }}
                      >
                        사유 요청
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResolveAbnormal(r)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'var(--m-accent-soft)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--m-accent)' }}
                      >
                        정상 보정
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
