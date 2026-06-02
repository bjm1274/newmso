// status 워크센터 — Supabase fetch 훅
//
// inventory 테이블 기반 KPI·표·우측 패널 데이터.
// inventory_logs 최근 사용 로그로 부서별 사용량 TOP 5 산출.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StockStatusRow, Tone } from './stock-types';
import { pickNumber, pickString, toMonthString, type Row } from './data-helpers';

function mapStatusRow(r: Row): StockStatusRow {
  const name = pickString(r, ['name', 'item_name'], '(미명칭)');
  const cat = pickString(r, ['category', 'category_name'], '미분류');
  const loc = pickString(r, ['location', 'department', 'company'], '미정');
  const stock = pickNumber(r, ['quantity', 'stock', 'current_quantity']);
  const min = pickNumber(r, ['min_quantity', 'min_stock', 'minimum_quantity']);
  const unit = pickString(r, ['unit'], 'EA');
  const expire = toMonthString(r['expiration_date'] ?? r['expiry_date']);

  let status: StockStatusRow['status'] = '정상';
  let tone: Tone = 'success';

  if (stock === 0) {
    status = '재고 0';
    tone = 'danger';
  } else if (min > 0 && stock < min) {
    status = '부족';
    tone = 'warn';
  }

  if (expire !== '-' && status === '정상') {
    const today = new Date();
    const exp = new Date(expire.length === 7 ? expire + '-01' : expire);
    const diff = (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0 || diff <= 30) {
      status = '유효기간';
      tone = 'danger';
    } else if (diff <= 90) {
      status = '유효기간';
      tone = 'warn';
    }
  }

  return { name, cat, loc, stock, min, unit, expire, status, tone };
}

export type StatusWorkcenterData = {
  rows: StockStatusRow[];
  total: number;
  lowCount: number;
  zeroCount: number;
  expireCount: number;
  myCount: number;
  deptUsageTop5: Array<{ dept: string; value: number }>;
  loading: boolean;
  error: string | null;
};

const EMPTY: StatusWorkcenterData = {
  rows: [],
  total: 0,
  lowCount: 0,
  zeroCount: 0,
  expireCount: 0,
  myCount: 0,
  deptUsageTop5: [],
  loading: true,
  error: null,
};

export function useStatusData(userCompany?: string): StatusWorkcenterData {
  const [state, setState] = useState<StatusWorkcenterData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const invQuery = supabase.from('inventory').select('*').limit(500);
        const [inv, logs] = await Promise.all([
          userCompany && userCompany !== '전체'
            ? invQuery.eq('company', userCompany)
            : invQuery,
          supabase
            .from('inventory_logs')
            .select('actor_name,department,quantity,change_type,created_at')
            .in('change_type', ['사용', '소모', '출고'])
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

        if (cancelled) return;

        const invRows: Row[] = Array.isArray(inv.data) ? (inv.data as Row[]) : [];
        const mapped = invRows.map(mapStatusRow);

        const zeroCount = mapped.filter((r) => r.status === '재고 0').length;
        const lowCount = mapped.filter((r) => r.status === '부족').length;
        const expireCount = mapped.filter((r) => r.status === '유효기간').length;
        const myCount = userCompany ? mapped.filter((r) => r.loc === userCompany).length : 0;

        const logRows: Row[] = Array.isArray(logs.data) ? (logs.data as Row[]) : [];
        const deptMap = new Map<string, number>();
        for (const r of logRows) {
          const dept = pickString(r, ['department', 'actor_name'], '미정');
          const amt = pickNumber(r, ['amount', 'qty', 'quantity'], 1);
          deptMap.set(dept, (deptMap.get(dept) ?? 0) + amt);
        }
        const deptUsageTop5 = Array.from(deptMap.entries())
          .map(([dept, value]) => ({ dept, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        setState({
          rows: mapped,
          total: mapped.length,
          lowCount,
          zeroCount,
          expireCount,
          myCount,
          deptUsageTop5,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '재고 데이터를 불러오지 못했습니다.';
        setState({ ...EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userCompany]);

  return state;
}
