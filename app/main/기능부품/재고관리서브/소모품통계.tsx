'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

type LogRow = {
  id: string;
  item_id: string;
  type: string;
  change_type: string;
  quantity: number;
  company: string;
  actor_name: string;
  created_at: string;
  inventory?: { item_name?: string; category?: string };
};

export default function ConsumableStats({ user, selectedCo }: { user: any; selectedCo: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7일' | '30일' | '90일' | '전체'>('30일');
  const [groupBy, setGroupBy] = useState<'item' | 'category' | 'company' | 'actor'>('item');

  const periodDays: Record<string, number | null> = { '7일': 7, '30일': 30, '90일': 90, '전체': null };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('inventory_logs').select('*, inventory:item_id(item_name, category)').order('created_at', { ascending: false });
    if (selectedCo !== '전체') query = query.eq('company', selectedCo);
    const days = periodDays[period];
    if (days) {
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', from);
    }
    const { data } = await query.limit(1000);
    setLogs(data || []);
    setLoading(false);
  }, [selectedCo, period]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const outLogs = logs.filter(l => ['출고', '이관출고', '사용'].includes(l.change_type || l.type));

  const grouped = useMemo(() => {
    const map: Record<string, { label: string; count: number; qty: number }> = {};
    outLogs.forEach(l => {
      let key = '';
      if (groupBy === 'item') key = l.inventory?.item_name || l.item_id || '미분류';
      else if (groupBy === 'category') key = l.inventory?.category || '미분류';
      else if (groupBy === 'company') key = l.company || '미지정';
      else if (groupBy === 'actor') key = l.actor_name || '미지정';
      if (!map[key]) map[key] = { label: key, count: 0, qty: 0 };
      map[key].count++;
      map[key].qty += l.quantity || 0;
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [outLogs, groupBy]);

  const totalQty = outLogs.reduce((sum, l) => sum + (l.quantity || 0), 0);
  const totalItems = new Set(outLogs.map(l => l.item_id)).size;
  const maxQty = grouped[0]?.qty || 1;

  const inLogs = logs.filter(l => ['입고'].includes(l.change_type || l.type));
  const totalInQty = inLogs.reduce((sum, l) => sum + (l.quantity || 0), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">소모품 사용 통계 대시보드</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">기간별 소모품 출고·사용 현황을 분석합니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['7일', '30일', '90일', '전체'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold ${period === p ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{p}</button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '총 출고 건수', value: outLogs.length + '건', color: 'text-[var(--accent)]' },
          { label: '총 출고 수량', value: totalQty.toLocaleString() + '개', color: 'text-orange-600' },
          { label: '총 입고 수량', value: totalInQty.toLocaleString() + '개', color: 'text-green-600' },
          { label: '관련 품목 수', value: totalItems + '종', color: 'text-purple-600' },
        ].map(c => (
          <div key={c.label} className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] text-center">
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-[var(--toss-gray-3)] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 그룹 선택 */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs font-bold text-[var(--toss-gray-3)]">분류:</span>
        {([
          { key: 'item', label: '품목별' },
          { key: 'category', label: '카테고리별' },
          { key: 'company', label: '법인별' },
          { key: 'actor', label: '담당자별' },
        ] as const).map(g => (
          <button key={g.key} onClick={() => setGroupBy(g.key)}
            className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold ${groupBy === g.key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{g.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">데이터 불러오는 중...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">해당 기간에 출고 데이터가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {grouped.slice(0, 30).map((g, i) => (
            <div key={g.label} className="flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)]">
              <span className="text-[10px] font-bold text-[var(--toss-gray-3)] w-6 text-center">{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-[var(--foreground)]">{g.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[var(--toss-gray-3)]">{g.count}건</span>
                    <span className="text-sm font-bold text-[var(--accent)]">{g.qty.toLocaleString()}개</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${Math.min(100, (g.qty / maxQty) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
          {grouped.length > 30 && <p className="text-center text-xs text-[var(--toss-gray-3)]">상위 30개 표시 중 (전체 {grouped.length}개)</p>}
        </div>
      )}
    </div>
  );
}
