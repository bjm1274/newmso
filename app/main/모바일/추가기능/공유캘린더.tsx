'use client';

/**
 * 모바일 공유캘린더 — PC SharedCalendar 핵심(근무표 year_month) 조회.
 * 세부 권한: calendar_근무표조회 / calendar_전체직원근무표
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { canAccessCalendarFeature, canAccessMainMenu } from '@/lib/access-control';
import type { ErpUser } from '@/types';
import MobileHeader from '../셸/MobileHeader';
import MChip from '../공통/MChip';
import MIcon from '../공통/MIcon';

type ShiftRow = {
  staff_id?: string | null;
  staff_name?: string | null;
  day?: number | null;
  shift_code?: string | null;
};

export default function 공유캘린더({
  onBack,
  user,
}: {
  onBack: () => void;
  user?: ErpUser | null;
}) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canMenu = canAccessMainMenu(user as never, '공유캘린더');
  const canViewShifts = canAccessCalendarFeature(user as never, '근무표조회');
  const canViewAll = canAccessCalendarFeature(user as never, '전체직원근무표');
  const selfId = String((user as { id?: string } | null | undefined)?.id ?? '').trim();

  const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const load = useCallback(async () => {
    if (!canMenu) {
      setRows([]);
      setError('공유캘린더 메뉴 권한이 없습니다.');
      setLoading(false);
      return;
    }
    if (!canViewShifts) {
      setRows([]);
      setError('근무표 일정 조회 권한이 없습니다. 관리자 권한 설정을 확인하세요.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = db
        .from('nurse_schedules')
        .select('staff_id,staff_name,day,shift_code')
        .eq('year_month', ym)
        .limit(2000);
      if (!canViewAll && selfId) {
        query = query.eq('staff_id', selfId);
      }
      const res = await query;
      if (res.error) {
        const msg = String((res.error as { message?: string })?.message || res.error);
        setRows([]);
        setError(
          /no such table|not allowed|does not exist/i.test(msg)
            ? '근무표 테이블이 없거나 권한이 없습니다. PC 근무표 편성 후 확인하세요.'
            : msg,
        );
        return;
      }
      setRows(Array.isArray(res.data) ? (res.data as ShiftRow[]) : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : '일정 로드 실패');
      toast('공유캘린더를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [ym, canMenu, canViewShifts, canViewAll, selfId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<number, ShiftRow[]>();
    for (const r of rows) {
      const d = Number(r.day);
      if (!Number.isFinite(d) || d < 1) continue;
      const list = map.get(d) ?? [];
      list.push(r);
      map.set(d, list);
    }
    return map;
  }, [rows]);

  return (
    <div className="m-screen">
      <MobileHeader title="공유캘린더" back={onBack} />
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          className="m-btn ghost"
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
          }
          aria-label="이전 달"
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
        </div>
        <button
          type="button"
          className="m-btn ghost"
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
          }
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="m-scroll">
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--z-500)', padding: 24 }}>불러오는 중…</p>
        ) : error ? (
          <div className="m-card" style={{ margin: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <MIcon name="calendar" size={18} />
              <strong>일정을 표시할 수 없습니다</strong>
            </div>
            <p style={{ fontSize: 13, color: 'var(--z-500)', margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div style={{ padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const list = byDay.get(day) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={day} className="m-card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
                    {cursor.getMonth() + 1}/{day}
                    <span style={{ marginLeft: 8, color: 'var(--z-500)', fontWeight: 600 }}>
                      {list.length}건
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {list.slice(0, 12).map((r, idx) => (
                      <MChip key={`${day}-${idx}`} tone="accent">
                        {String(r.staff_name || r.staff_id || '직원').slice(0, 8)} ·{' '}
                        {String(r.shift_code || '-')}
                      </MChip>
                    ))}
                    {list.length > 12 && (
                      <MChip tone="">+{list.length - 12}</MChip>
                    )}
                  </div>
                </div>
              );
            })}
            {byDay.size === 0 && (
              <div className="m-card" style={{ padding: 20, textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--z-500)', fontWeight: 600 }}>
                  이번 달 등록된 근무표가 없습니다.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
