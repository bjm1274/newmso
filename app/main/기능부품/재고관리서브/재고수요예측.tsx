'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getItemName, getItemQuantity, getRecommendedOrderQuantity, requestInventoryReorder } from '@/app/main/inventory-utils';

interface Props {
  user: any;
  inventory: any[];
  selectedCo: string;
}

interface ItemForecast {
  item: any;
  avgDailyUsage: number;
  daysLeft: number;
  safetyStock: number;
  orderQty: number;
  status: '정상' | '주의' | '긴급' | '초과재고';
  recentUsage: number[];
}

export default function InventoryDemandForecast({ user, inventory, selectedCo }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'전체' | '긴급' | '주의'>('전체');
  const [safetyDays, setSafetyDays] = useState(7);
  const [ordering, setOrdering] = useState<string | null>(null);

  const filteredInventory = selectedCo === '전체' ? inventory : inventory.filter((i: any) => (i.company || '').trim() === selectedCo);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 90);
        const { data } = await supabase
          .from('inventory_logs')
          .select('*')
          .gte('created_at', since.toISOString());
        const outboundLogs = (data || []).filter((log: any) => ['출고', 'out'].includes(String(log.change_type || log.type || '').trim()));
        setLogs(outboundLogs);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const forecasts: ItemForecast[] = filteredInventory.map((item: any) => {
    const itemLogs = logs.filter((l: any) => String(l.item_id || l.inventory_id) === String(item.id));
    const totalOut = itemLogs.reduce((s: number, l: any) => s + (l.quantity || l.amount || 0), 0);
    const avgDailyUsage = totalOut / 90;
    const currentStock = getItemQuantity(item);
    const daysLeft = avgDailyUsage > 0 ? Math.round(currentStock / avgDailyUsage) : 9999;
    const safetyStock = Math.round(avgDailyUsage * safetyDays);
    const orderQty = Math.max(getRecommendedOrderQuantity(item), safetyStock * 2 - currentStock, 0);

    const status: ItemForecast['status'] =
      daysLeft > 90 ? '초과재고' :
      daysLeft > 14 ? '정상' :
      daysLeft > 7 ? '주의' :
      '긴급';

    // 최근 30일 일별 사용량 (7일 단위 합계)
    const recentUsage = [0, 7, 14, 21].map(offset => {
      const start = new Date();
      start.setDate(start.getDate() - offset - 7);
      const end = new Date();
      end.setDate(end.getDate() - offset);
      return itemLogs
        .filter((l: any) => {
          const d = new Date(l.created_at);
          return d >= start && d < end;
        })
        .reduce((s: number, l: any) => s + (l.quantity || l.amount || 0), 0);
    }).reverse();

    return { item, avgDailyUsage, daysLeft, safetyStock, orderQty, status, recentUsage };
  });

  const displayData = filterStatus === '전체'
    ? forecasts
    : forecasts.filter(f => f.status === filterStatus);

  const statusColor = (s: string) =>
    s === '긴급' ? 'text-red-600 bg-red-50 border-red-200' :
    s === '주의' ? 'text-amber-600 bg-amber-50 border-amber-200' :
    s === '초과재고' ? 'text-purple-600 bg-purple-50 border-purple-200' :
    'text-green-600 bg-green-50 border-green-200';

  const handleAutoOrder = async (fc: ItemForecast) => {
    if (!confirm(`${getItemName(fc.item)} ${fc.orderQty}개 발주를 자동 신청하시겠습니까?`)) return;
    setOrdering(String(fc.item.id));
    try {
      const { error } = await requestInventoryReorder({
        item: fc.item,
        user,
        quantity: fc.orderQty,
        reason: `현재 재고: ${getItemQuantity(fc.item)}개, 일평균 소비: ${fc.avgDailyUsage.toFixed(1)}개, 예상 소진: ${fc.daysLeft}일, 발주 권장량: ${fc.orderQty}개`,
      });
      if (error) throw error;
      toast('자동발주 신청이 완료되었습니다.', 'success');
    } catch {
      toast('신청에 실패했습니다.', 'error');
    } finally {
      setOrdering(null);
    }
  };

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  return (
    <div className="p-4 md:p-4 space-y-4 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">재고 수요 예측</h2>
        <p className="text-xs text-[var(--toss-gray-3)] mt-1">최근 90일 출고 이력 기반 품목별 소진일수 예측</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {(['전체', '긴급', '주의'] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)} className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] ${filterStatus === f ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{f}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-[var(--toss-gray-4)]">안전재고 기준일:</label>
          <input
            type="number"
            value={safetyDays}
            onChange={e => setSafetyDays(Number(e.target.value))}
            min={1}
            max={30}
            className="w-16 p-1.5 text-xs font-bold border border-[var(--border)] rounded-md bg-[var(--card)] text-center"
          />
          <span className="text-xs text-[var(--toss-gray-3)]">일</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--toss-gray-3)]">분석 중...</div>
      ) : displayData.length === 0 ? (
        <div className="text-center py-8 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)]">
          <p className="text-sm font-bold text-[var(--toss-gray-4)]">표시할 품목이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayData.map((fc, i) => {
            const maxUsage = Math.max(...fc.recentUsage, 1);
            return (
              <div key={i} className={`p-4 rounded-[var(--radius-md)] border ${statusColor(fc.status)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{getItemName(fc.item)}</p>
                    <p className="text-[11px] text-[var(--toss-gray-4)]">{fc.item.category} · {fc.item.company}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(fc.status)}`}>{fc.status}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-center">
                  <div className="bg-[var(--card)]/60 rounded-[var(--radius-md)] p-2">
                    <p className="text-[10px] text-[var(--toss-gray-3)]">현재 재고</p>
                    <p className="text-sm font-bold">{fmt(getItemQuantity(fc.item))}</p>
                  </div>
                  <div className="bg-[var(--card)]/60 rounded-[var(--radius-md)] p-2">
                    <p className="text-[10px] text-[var(--toss-gray-3)]">일평균 소비</p>
                    <p className="text-sm font-bold">{fc.avgDailyUsage.toFixed(2)}</p>
                  </div>
                  <div className="bg-[var(--card)]/60 rounded-[var(--radius-md)] p-2">
                    <p className="text-[10px] text-[var(--toss-gray-3)]">예상 소진일</p>
                    <p className={`text-sm font-bold ${fc.daysLeft < 7 ? 'text-red-600' : ''}`}>{fc.daysLeft >= 9999 ? '∞' : `${fc.daysLeft}일`}</p>
                  </div>
                  <div className="bg-[var(--card)]/60 rounded-[var(--radius-md)] p-2">
                    <p className="text-[10px] text-[var(--toss-gray-3)]">발주 권장량</p>
                    <p className="text-sm font-bold">{fmt(fc.orderQty)}</p>
                  </div>
                </div>
                {/* 최근 4주 소비 미니 바 차트 */}
                <div className="flex items-end gap-1 h-10 mb-3">
                  {fc.recentUsage.map((u, wi) => (
                    <div key={wi} className="flex flex-col items-center flex-1">
                      <div className="w-full rounded-t-[2px] bg-[var(--accent)]/40" style={{ height: `${(u / maxUsage) * 100}%`, minHeight: u > 0 ? '2px' : '0' }} />
                    </div>
                  ))}
                </div>
                <div className="text-[9px] text-[var(--toss-gray-3)] text-center mb-2">최근 4주 소비량 (좌=오래됨, 우=최근)</div>
                {fc.status === '긴급' || fc.status === '주의' ? (
                  <button
                    onClick={() => handleAutoOrder(fc)}
                    disabled={ordering === String(fc.item.id)}
                    className="w-full py-1.5 text-xs font-bold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                  >
                    {ordering === String(fc.item.id) ? '신청 중...' : '자동발주 신청'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



