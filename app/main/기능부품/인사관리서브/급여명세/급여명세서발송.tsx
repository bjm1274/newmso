'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type SendSummary = {
  notifications: number;
  emails: number;
  failures: number;
  emailFallback: boolean;
};

function isMissingSchemaError(error: any) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return code.startsWith('PGRST') || message.includes('schema cache') || message.includes('Could not find the table');
}

export default function PayrollEmailSender({ staffs = [], yearMonth }: any) {
  const [loading, setLoading] = useState(false);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  const staffMap = useMemo(
    () => new Map((staffs || []).map((staff: any) => [String(staff.id), staff])),
    [staffs]
  );

  useEffect(() => {
    let active = true;

    (async () => {
      if (!staffs?.length) {
        setEligibleCount(0);
        setLoadError('');
        return;
      }

      const staffIds = staffs.map((staff: any) => staff.id);
      const { data, error } = await supabase
        .from('payroll_records')
        .select('staff_id')
        .eq('year_month', yearMonth)
        .in('staff_id', staffIds)
        .eq('status', '확정')
        .neq('record_type', 'interim');

      if (!active) return;

      if (error) {
        console.error('payroll email sender load failed:', error);
        setEligibleCount(0);
        setLoadError('정산 완료된 급여명세서를 불러오지 못했습니다.');
        return;
      }

      setLoadError('');
      setEligibleCount(new Set((data || []).map((row: any) => String(row.staff_id))).size);
    })();

    return () => {
      active = false;
    };
  }, [staffs, yearMonth]);

  const handleSendAll = async () => {
    if (!staffs?.length) {
      alert('발송 가능한 직원이 없습니다.');
      return;
    }

    const staffIds = staffs.map((staff: any) => staff.id);
    const { data: records, error } = await supabase
      .from('payroll_records')
      .select('staff_id, year_month, net_pay, status, record_type')
      .eq('year_month', yearMonth)
      .in('staff_id', staffIds)
      .eq('status', '확정')
      .neq('record_type', 'interim');

    if (error) {
      console.error('payroll email sender fetch failed:', error);
      alert(`정산 완료 급여명세서를 조회하지 못했습니다: ${error.message}`);
      return;
    }

    const targetRecords = records || [];
    if (targetRecords.length === 0) {
      alert('해당 월에 정산이 확정된 급여명세서가 없습니다.');
      return;
    }

    if (!confirm(`${targetRecords.length}명에게 ${yearMonth} 급여명세서를 발송할까요?`)) return;

    setLoading(true);
    setSummary(null);

    let notificationCount = 0;
    let emailCount = 0;
    let failureCount = 0;
    let emailFallback = false;
    let emailQueueAvailable: boolean | null = null;

    try {
      for (const record of targetRecords) {
        const staff = staffMap.get(String(record.staff_id)) as any;
        if (!staff) {
          failureCount += 1;
          continue;
        }

        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: record.staff_id,
          type: '급여명세',
          title: `[${yearMonth}] 급여명세서가 도착했습니다`,
          body: `${yearMonth} 급여명세서가 등록되었습니다. 내정보 > 급여·증명서에서 확인해 주세요.`,
          read_at: null,
        });

        if (notificationError) {
          console.error('payroll notification send failed:', notificationError);
          failureCount += 1;
          continue;
        }

        notificationCount += 1;

        const staffEmail = staff.email || staff.staff_email;
        if (!staffEmail || emailQueueAvailable === false) continue;

        const { error: emailError } = await supabase.from('email_queue').insert([
          {
            recipient: staffEmail,
            subject: `[${yearMonth}] 급여명세서 안내`,
            body: `${staff.name || '직원'}님, ${yearMonth} 급여명세서가 등록되었습니다. ERP 내 급여·증명서 메뉴에서 확인해 주세요.`,
            type: 'payroll_payslip',
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ]);

        if (!emailError) {
          emailQueueAvailable = true;
          emailCount += 1;
          continue;
        }

        if (isMissingSchemaError(emailError)) {
          emailQueueAvailable = false;
          emailFallback = true;
          console.warn('email_queue table is not configured. Falling back to notifications only.');
          continue;
        }

        console.error('payroll email queue failed:', emailError);
        failureCount += 1;
      }

      const nextSummary = {
        notifications: notificationCount,
        emails: emailCount,
        failures: failureCount,
        emailFallback,
      };
      setSummary(nextSummary);

      const fallbackMessage = emailFallback
        ? '\n이메일 큐가 설정되지 않아 사내 알림만 발송했습니다.'
        : '';
      alert(
        `급여명세서 발송을 마쳤습니다.\n사내 알림 ${notificationCount}건\n이메일 큐 ${emailCount}건\n실패 ${failureCount}건${fallbackMessage}`
      );
    } catch (sendError) {
      console.error('payroll email sender failed:', sendError);
      alert('급여명세서 발송 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm">
      <div className="pb-2 border-b border-[var(--border)] mb-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">급여명세서 발송</h3>
        <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">
          정산 확정자에게 사내 알림을 보내고, 이메일 큐가 있으면 메일까지 예약합니다.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--page-bg)] px-3 py-2 mb-3">
        <span className="text-xs font-medium text-[var(--toss-gray-3)]">{yearMonth} 확정 명세서</span>
        <span className="text-sm font-bold text-[var(--foreground)]" data-testid="payroll-email-eligible-count">
          {eligibleCount}명
        </span>
      </div>

      {loadError && (
        <p className="mb-3 rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          {loadError}
        </p>
      )}

      {summary && (
        <div
          data-testid="payroll-email-send-summary"
          className="mb-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-3 text-xs text-[var(--foreground)]"
        >
          <p className="font-semibold">사내 알림 {summary.notifications}건 · 이메일 큐 {summary.emails}건 · 실패 {summary.failures}건</p>
          {summary.emailFallback && (
            <p className="mt-1 font-medium text-amber-700">이메일 큐 미설정으로 사내 알림만 발송했습니다.</p>
          )}
        </div>
      )}

      <button
        type="button"
        data-testid="payroll-email-send-all-button"
        onClick={handleSendAll}
        disabled={loading || eligibleCount === 0}
        className="w-full py-3 bg-[var(--accent)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
      >
        {loading ? '발송 중...' : `확정 명세서 발송 (${eligibleCount}명)`}
      </button>
    </div>
  );
}
