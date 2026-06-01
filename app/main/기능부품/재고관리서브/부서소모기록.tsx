'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { StaffMember, InventoryItem } from '@/types';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { toast } from '@/lib/toast';
import { getItemQuantity, getItemMinQuantity, getItemName } from '@/app/main/inventory-utils';

type ConsumptionLog = {
  id: string;
  item_id: string;
  quantity: number;
  actor_name: string;
  created_at: string;
  notes?: string;
};

type ConsumeModalState = {
  item: InventoryItem;
} | null;

export default function DepartmentConsumption({
  user,
  inventory,
  fetchInventory,
}: {
  user?: StaffMember;
  inventory: InventoryItem[];
  fetchInventory: () => void | Promise<void>;
}) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [logs, setLogs] = useState<ConsumptionLog[]>([]);
  const [consumeModal, setConsumeModal] = useState<ConsumeModalState>(null);
  const [consumeAmount, setConsumeAmount] = useState(1);
  const [consumeNote, setConsumeNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const userCompany = user?.company || '';
  const userDept = user?.department || '';

  // 자기 부서 재고만 필터
  const deptInventory = useMemo(() => {
    let list = inventory.filter((item) => {
      const itemCompany = (item.company || '').trim();
      const itemDept = ((item as Record<string, unknown>).department as string || '').trim();
      return itemCompany === userCompany.trim() && itemDept === userDept.trim();
    });
    if (searchKeyword.trim()) {
      const k = searchKeyword.toLowerCase();
      list = list.filter((i) =>
        getItemName(i).toLowerCase().includes(k) ||
        (i.category || '').toLowerCase().includes(k),
      );
    }
    return list;
  }, [inventory, userCompany, userDept, searchKeyword]);

  const lowStockCount = useMemo(
    () => deptInventory.filter((i) => getItemQuantity(i) <= getItemMinQuantity(i)).length,
    [deptInventory],
  );

  // inventory_logs에 item_name 컬럼이 없으므로 item_id → 품목명 맵을 prop에서 구성
  const itemNameMap = useMemo(
    () => new Map(inventory.map((item) => [item.id, getItemName(item)])),
    [inventory],
  );

  // 소모 이력 조회
  const fetchConsumptionLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .eq('company', userCompany)
        .in('change_type', ['사용', '소모'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      // 부서 필터 (actor_name에 부서 정보가 포함된 경우)
      const filtered = (data || []).filter((log: Record<string, unknown>) => {
        const actor = String(log.actor_name || '');
        return actor.includes(userDept) || !userDept;
      });
      setLogs(filtered as ConsumptionLog[]);
    } catch {
      setLogs([]);
    }
  }, [userCompany, userDept]);

  useEffect(() => { fetchConsumptionLogs(); }, [fetchConsumptionLogs]);

  // 소모 기록 처리
  const handleConsume = useCallback(async () => {
    if (!consumeModal || consumeAmount <= 0) return;
    const item = consumeModal.item;
    const currentQty = getItemQuantity(item);
    if (consumeAmount > currentQty) {
      toast('소모 수량이 현재 재고보다 많습니다.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // 서버사이드 트랜잭션 API 호출 (수량 차감 + 로그 기록 원자적 처리)
      const res = await fetch('/api/inventory/stock-consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          consumeAmount,
          company: userCompany,
          companyId: user?.company_id ?? null,
          department: userDept,
          notes: consumeNote || `${getItemName(item)} ${consumeAmount}개 사용`,
        }),
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      toast(`${getItemName(item)} ${consumeAmount}개 소모 기록 완료`, 'success');
      setConsumeModal(null);
      setConsumeAmount(1);
      setConsumeNote('');
      await Promise.all([fetchInventory(), fetchConsumptionLogs()]);
    } catch (err) {
      console.error('소모 기록 실패:', err);
      toast('소모 기록 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [consumeAmount, consumeModal, consumeNote, fetchConsumptionLogs, fetchInventory, user?.name, userCompany, userDept]);

  if (!userCompany || !userDept) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-bold text-[var(--toss-gray-3)]">소속 회사/부서 정보가 없습니다.</p>
        <p className="text-xs text-[var(--toss-gray-3)] mt-1">관리자에게 부서 배정을 요청하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--toss-gray-3)]">내 부서 재고</p>
            <p className="text-sm font-bold text-[var(--foreground)] mt-0.5">{userCompany} · {userDept}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--foreground)]">{deptInventory.length}개 품목</span>
            {lowStockCount > 0 && (
              <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full">부족 {lowStockCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--toss-gray-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
        </svg>
        <input
          type="text"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="품목명, 분류 검색..."
          className="w-full pl-9 pr-3 py-2.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)]"
        />
      </div>

      {/* 품목 목록 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <span className="text-xs font-bold text-[var(--foreground)]">부서 재고 목록</span>
        </div>
        {deptInventory.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-[var(--toss-gray-3)]">할당된 재고가 없습니다</p>
            <p className="text-xs text-[var(--toss-gray-3)] mt-1">물품신청을 통해 재고를 요청하세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {deptInventory.map((item) => {
              const q = getItemQuantity(item);
              const mq = getItemMinQuantity(item);
              const isLow = q <= mq;
              const isOos = q === 0;
              return (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--muted)]/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-1 h-8 rounded-full shrink-0 ${isOos ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--foreground)] truncate">{getItemName(item)}</p>
                      <p className="text-[10px] text-[var(--toss-gray-3)]">{item.category || '미분류'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-black tabular-nums ${isOos ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-[var(--foreground)]'}`}>{q}</p>
                      <p className="text-[9px] text-[var(--toss-gray-3)]">안전 {mq}</p>
                    </div>
                    <button
                      onClick={() => { setConsumeModal({ item }); setConsumeAmount(1); setConsumeNote(''); }}
                      disabled={isOos}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      소모 기록
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 최근 소모 이력 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <span className="text-xs font-bold text-[var(--foreground)]">최근 소모 이력</span>
          <button onClick={fetchConsumptionLogs} className="text-[10px] font-bold text-[var(--toss-gray-4)] hover:text-[var(--foreground)] transition-colors">새로고침</button>
        </div>
        {logs.length === 0 ? (
          <div className="py-10 text-center text-xs font-semibold text-[var(--toss-gray-3)]">소모 기록이 없습니다.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {itemNameMap.get(log.item_id) ?? '(품목 미상)'} <span className="text-[var(--accent)] font-bold">{log.quantity}개</span> 사용
                  </p>
                  <p className="text-[10px] text-[var(--toss-gray-3)]">{log.actor_name}{log.notes ? ` · ${log.notes}` : ''}</p>
                </div>
                <span className="text-[10px] text-[var(--toss-gray-3)] shrink-0 ml-2">
                  {log.created_at ? new Date(log.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 소모 기록 모달 */}
      {consumeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setConsumeModal(null)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm p-5 max-w-sm w-full overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">소모 기록</h3>
            <p className="text-xs font-bold text-[var(--toss-gray-3)] mb-1">{getItemName(consumeModal.item)}</p>
            <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">현재고: {getItemQuantity(consumeModal.item)}개</p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">사용 수량 *</label>
                <input
                  type="number"
                  min={1}
                  max={getItemQuantity(consumeModal.item)}
                  value={consumeAmount}
                  onChange={(e) => setConsumeAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1 block">사용 메모 (선택)</label>
                <input
                  type="text"
                  value={consumeNote}
                  onChange={(e) => setConsumeNote(e.target.value)}
                  placeholder="예: 환자 처치, 검사 준비 등"
                  className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-[var(--border)] text-sm"
                />
              </div>
            </div>

            {consumeAmount > getItemQuantity(consumeModal.item) && (
              <div className="bg-red-500/5 border-l-4 border-red-500 px-3 py-2 rounded-[var(--radius-md)] mb-4">
                <p className="text-xs font-bold text-red-600">사용 수량이 현재 재고를 초과합니다.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setConsumeModal(null)} disabled={isProcessing} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm disabled:opacity-50">취소</button>
              <button
                onClick={handleConsume}
                disabled={isProcessing || consumeAmount > getItemQuantity(consumeModal.item) || consumeAmount <= 0}
                className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50"
              >
                {isProcessing ? '처리 중...' : `${consumeAmount}개 소모 기록`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
