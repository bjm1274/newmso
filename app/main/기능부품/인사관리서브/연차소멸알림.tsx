'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { toast } from '@/lib/toast';

import { useEffect, useMemo, useState } from 'react';
import { db, d1 } from '@/lib/db-client';
import { formatKoreanDateKey } from '@/lib/seoul-time';
// 잔여 집계는 PC 워크센터·/api/annual-leave/summary 와 **같은 함수**를 쓴다.
import {
  aggregateLedgerEntries,
  getLeaveCycle,
  resolveHireDateKey,
  type LedgerRowLike,
} from '@/lib/leave-cycle';

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
  const { dialog, openConfirm } = useActionDialog();
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

        const [{ data: leaveBalances }, { data: leaveLedgers }, { data: hireRows }] = await Promise.all([
          db.from('leave_balances').select('*').in('staff_id', staffIds),
          db
            .from('leave_ledger')
            .select('id, staff_id, entry_type, days, occurred_on, period_key, source_id, note')
            .in('staff_id', staffIds),
          // 주기 판정에 입사일이 필요하다. staffs prop 에 입사일이 실려 오지 않는
          // 호출부가 있어 원본에서 직접 읽는다(PC 워크센터와 동일).
          db.from('staff_members').select('id, hire_date, join_date, joined_at').in('id', staffIds),
        ]);

        // 원장(leave_ledger)은 **생애 전체** 기록이고 잔여는 **현재 주기**(입사기념일
        // 단위) 값이어야 한다. 예전에는 `select('staff_id, days')` 로 주기 정보 없이
        // 전 이력을 더했다 — 직전 주기의 auto_annual(+15)과 expire(-15)가 함께 남아
        // 재직자 다수의 잔여가 최대 31일까지 부풀었고, 그 값이 아래 알림 본문
        // ("보유 연차 N일이 ...에 소멸 예정")과 예상 손실액에 그대로 실려 나갔다.
        // 주기 판정·집계는 다시 짜지 않고 워크센터·서버 요약과 같은 함수를 쓴다.
        const todayKey = formatKoreanDateKey(new Date());
        const hireKeyByStaff = new Map<string, string>();
        for (const raw of (hireRows as any[]) || []) {
          if (!raw || typeof raw !== 'object') continue;
          const sId = String(raw.id ?? '').trim();
          const hireKey = resolveHireDateKey(raw);
          if (sId && hireKey) hireKeyByStaff.set(sId, hireKey);
        }

        const ledgerRowsByStaff = new Map<string, LedgerRowLike[]>();
        for (const raw of (leaveLedgers as any[]) || []) {
          if (!raw || typeof raw !== 'object') continue;
          const sId = String(raw.staff_id || '').trim();
          if (!sId) continue;
          const entry: LedgerRowLike = {
            id: raw.id,
            entry_type: raw.entry_type,
            days: raw.days,
            occurred_on: typeof raw.occurred_on === 'string' ? raw.occurred_on : null,
            period_key: raw.period_key,
            source_id: typeof raw.source_id === 'string' ? raw.source_id : null,
            note: typeof raw.note === 'string' ? raw.note : null };
          const list = ledgerRowsByStaff.get(sId);
          if (list) list.push(entry);
          else ledgerRowsByStaff.set(sId, [entry]);
        }

        const ledgerRemainingMap = new Map<string, number>();
        for (const [sId, rows] of ledgerRowsByStaff) {
          const hireKey = hireKeyByStaff.get(sId);
          const cycle = hireKey ? getLeaveCycle(hireKey, todayKey) : null;
          // 입사일이 없어 주기를 못 잡는 직원은 원장 합산을 포기하고
          // 아래 leave_balances 미러 값으로 내려간다(전 이력 합산보다 낫다).
          if (!cycle) continue;
          ledgerRemainingMap.set(sId, aggregateLedgerEntries(rows, cycle).remaining);
        }

        const now = new Date();
        const result: LeaveInfo[] = filteredStaffs.map((staff: any) => {
          const sId = String(staff.id);
          const balance = (leaveBalances || []).find((row: any) => String(row.staff_id) === sId);
          const remaining = ledgerRemainingMap.has(sId)
            ? Math.max(0, ledgerRemainingMap.get(sId)!)
            : Number(balance?.remaining_days ?? 0);

          const expiryDate = balance?.expiry_date
            ? new Date(balance.expiry_date)
            : new Date(now.getFullYear(), 11, 31);
          const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
          const baseSalary = Number(staff.base_salary) || 0;
          const dailyWage = baseSalary > 0 ? baseSalary / 30 : 0;

          return {
            staff,
            remaining,
            expiryDate,
            daysLeft,
            estimatedLoss: Math.round(remaining * dailyWage) };
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
    const confirmed = await openConfirm({
      title: '연차 소멸 예정 알림',
      description: `${info.staff.name}님에게 연차 소멸 예정 알림을 발송합니다.\n남은 연차 ${info.remaining}일 기준으로 안내됩니다.`,
      confirmText: '발송',
      tone: 'accent' });
    if (!confirmed) return;
    setSendingId(String(info.staff.id));

    try {
      await d1.from('notifications').insert({
        user_id: info.staff.id,
        title: '연차 소멸 예정 알림',
        body: `보유 연차 ${info.remaining}일이 ${info.expiryDate.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}에 소멸 예정입니다. 사용 계획을 확인해 주세요.`,
        type: 'attendance',
        read_at: null,
        created_at: new Date().toISOString() });

      toast('알림을 발송했습니다.', 'success');
    } catch (error) {
      console.error('연차 소멸 알림 발송 실패:', error);
      toast('알림 발송에 실패했습니다.', 'error');
    } finally {
      setSendingId(null);
    }
  };

  const cardColor = (item: LeaveInfo) => {
    if (item.daysLeft <= 0) return 'border-red-300 bg-red-500/10';
    if (item.daysLeft <= 7) return 'border-red-500/20 bg-red-500/10/60';
    if (item.daysLeft <= 30) return 'border-amber-200 bg-amber-50/60';
    return 'border-[var(--border)] bg-[var(--card)]';
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-4" data-testid="attendance-analysis-leave-expiry">
      {dialog}

      <div role="group" aria-label="연차 소멸 필터" className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
            className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold transition-all ${
              filter === option
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] py-8 text-center">
          <p className="text-sm font-bold text-[var(--toss-gray-4)]">조건에 맞는 소멸 예정 연차가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleItems.map((info) => (
            <div key={info.staff.id} className={`rounded-[var(--radius-md)] border p-4 ${cardColor(info)}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">{info.staff.name}</p>
                  <p className="mt-1 text-[11px] text-[var(--toss-gray-4)]">
                    {info.staff.company} / {info.staff.department}
                  </p>
                </div>
                <span className="rounded-[var(--radius-md)] bg-[var(--card)]/80 px-2 py-0.5 text-[10px] font-black text-[var(--foreground)]">
                  {info.daysLeft <= 0 ? '소멸' : `D-${info.daysLeft}`}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">잔여</p>
                  <p className="text-sm font-bold">{info.remaining}일</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">만료일</p>
                  <p className="text-sm font-bold">
                    {info.expiryDate.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' })}
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
                className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
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
