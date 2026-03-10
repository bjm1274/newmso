'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
}

interface LeaveInfo {
  staff: any;
  remaining: number;
  expiryDate: Date;
  daysLeft: number;
  estimatedLoss: number;
}

const FILTER_OPTIONS = ['전체', '30일이내', '7일이내', '소멸'] as const;
type FilterType = (typeof FILTER_OPTIONS)[number];

export default function AnnualLeaveExpiryAlert({ staffs, selectedCo }: Props) {
  const [leaveData, setLeaveData] = useState<LeaveInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('전체');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const filteredStaffs = useMemo(
    () => (selectedCo === '전체' ? staffs : staffs.filter((staff: any) => staff.company === selectedCo)),
    [selectedCo, staffs],
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const staffIds = filteredStaffs.map((staff: any) => staff.id);
        if (staffIds.length === 0) {
          setLeaveData([]);
          return;
        }

        const { data: leaveBalances } = await supabase
          .from('leave_balances')
          .select('*')
          .in('staff_id', staffIds);

        const now = new Date();
        const result: LeaveInfo[] = filteredStaffs.map((staff: any) => {
          const balance = (leaveBalances || []).find((row: any) => String(row.staff_id) === String(staff.id));
          const remaining = Number(balance?.remaining_days ?? balance?.balance ?? 0);
          const expiryDate = balance?.expiry_date
            ? new Date(balance.expiry_date)
            : new Date(now.getFullYear(), 11, 31);
          const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
          const dailyWage = Number(staff.base_salary || staff.base || 2_000_000) / 30;

          return {
            staff,
            remaining,
            expiryDate,
            daysLeft,
            estimatedLoss: Math.round(remaining * dailyWage),
          };
        });

        setLeaveData(result.sort((a, b) => a.daysLeft - b.daysLeft));
      } catch (error) {
        console.error('연차 소멸 알림 데이터 조회 실패:', error);
        setLeaveData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filteredStaffs]);

  const visibleItems = leaveData
    .filter((item) => item.remaining > 0)
    .filter((item) => {
      if (filter === '30일이내') return item.daysLeft <= 30 && item.daysLeft > 0;
      if (filter === '7일이내') return item.daysLeft <= 7 && item.daysLeft > 0;
      if (filter === '소멸') return item.daysLeft <= 0;
      return true;
    });

  const handleSendAlert = async (info: LeaveInfo) => {
    if (!confirm(`${info.staff.name}님에게 연차 소멸 예정 알림을 보낼까요?`)) return;
    setSendingId(String(info.staff.id));

    try {
      await supabase.from('notifications').insert({
        user_id: info.staff.id,
        title: '연차 소멸 예정 알림',
        body: `보유 연차 ${info.remaining}일이 ${info.expiryDate.toLocaleDateString('ko-KR')}에 소멸 예정입니다. 사용 계획을 확인해 주세요.`,
        type: 'attendance',
        read_at: null,
        created_at: new Date().toISOString(),
      });

      alert('알림을 발송했습니다.');
    } catch (error) {
      console.error('연차 소멸 알림 발송 실패:', error);
      alert('알림 발송에 실패했습니다.');
    } finally {
      setSendingId(null);
    }
  };

  const cardColor = (item: LeaveInfo) => {
    if (item.daysLeft <= 0) return 'border-red-300 bg-red-50';
    if (item.daysLeft <= 7) return 'border-red-200 bg-red-50/60';
    if (item.daysLeft <= 30) return 'border-amber-200 bg-amber-50/60';
    return 'border-[var(--toss-border)] bg-[var(--toss-card)]';
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6" data-testid="attendance-analysis-leave-expiry">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">연차 소멸 예정 알림</h2>
        <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
          소멸이 임박한 연차를 확인하고 직원에게 바로 알림을 보냅니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`rounded-[8px] px-3 py-1.5 text-xs font-bold transition-all ${
              filter === option
                ? 'bg-[var(--toss-blue)] text-white'
                : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--toss-border)] bg-[var(--toss-card)] py-12 text-center">
          <p className="text-sm font-bold text-[var(--toss-gray-4)]">조건에 맞는 소멸 예정 연차가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleItems.map((info) => (
            <div key={info.staff.id} className={`rounded-[12px] border p-4 ${cardColor(info)}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">{info.staff.name}</p>
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
                    {info.staff.company} / {info.staff.department}
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-[var(--foreground)]">
                  {info.daysLeft <= 0 ? '소멸' : `D-${info.daysLeft}`}
                </span>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">잔여</p>
                  <p className="text-sm font-bold">{info.remaining}일</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">만료일</p>
                  <p className="text-sm font-bold">
                    {info.expiryDate.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">예상 손실</p>
                  <p className="text-sm font-bold text-red-600">{info.estimatedLoss.toLocaleString('ko-KR')}원</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSendAlert(info)}
                disabled={sendingId === String(info.staff.id)}
                className="w-full rounded-[8px] bg-[var(--toss-blue)] py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {sendingId === String(info.staff.id) ? '발송 중...' : '알림 발송'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
