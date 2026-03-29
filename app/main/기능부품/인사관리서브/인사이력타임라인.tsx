'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchHrHistoryLedger, type HrLedgerEvent } from '@/lib/hr-history-ledger';

type Props = {
  staffId: string | number;
  staffName: string;
};

function formatOccurredAt(value: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function StaffHistoryTimeline({ staffId, staffName }: Props) {
  const [events, setEvents] = useState<HrLedgerEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const targetId = String(staffId || '').trim();
    if (!targetId) {
      setEvents([]);
      return;
    }

    const run = async () => {
      setLoading(true);
      const nextEvents = await fetchHrHistoryLedger(targetId);
      if (!active) return;
      setEvents(nextEvents.slice(0, 18));
      setLoading(false);
    };

    void run();
    return () => {
      active = false;
    };
  }, [staffId]);

  const summary = useMemo(() => {
    return {
      appointments: events.filter((event) => event.type === 'appointment').length,
      contracts: events.filter((event) => event.type === 'contract').length,
      salary: events.filter((event) => event.type === 'salary').length,
    };
  }, [events]);

  return (
    <section className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm min-w-[320px] flex-1">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">{staffName} 인사 이력 원장</h3>
          <p className="text-xs text-[var(--toss-gray-3)] mt-1">
            인사발령, 계약, 급여 조건, 근무형태, 휴가 이력을 한 번에 확인합니다.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold">
            발령 {summary.appointments}
          </span>
          <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold">
            계약 {summary.contracts}
          </span>
          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
            급여 {summary.salary}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
          이력을 불러오는 중입니다.
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--toss-gray-3)]">
          표시할 인사 이력이 없습니다.
        </div>
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-3"
            >
              <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border ${event.accentClass}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--toss-gray-4)]">
                    {formatOccurredAt(event.occurredAt)}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${event.accentClass}`}>
                    {event.badge}
                  </span>
                  {event.status ? (
                    <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                      {event.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)] break-words">{event.title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--toss-gray-4)] break-words">
                  {event.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
