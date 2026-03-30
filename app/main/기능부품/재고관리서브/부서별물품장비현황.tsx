'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { getRecommendedOrderQuantity, getItemQuantity, requestInventoryReorder } from '@/app/main/inventory-utils';

// ESLint 규칙에 맞게 컴포넌트 이름을 영문 대문자로 시작하게 변경합니다.
// default export 이므로 외부에서의 import 이름(부서별물품장비현황)은 그대로 유지됩니다.
export default function DepartmentAssetOverview({ user, inventory: inventoryProp }: { user: any; inventory?: any[] }) {
  const [assetLoans, setAssetLoans] = useState<any[]>([]);
  const [inventoryFetched, setInventoryFetched] = useState<any[]>([]);
  const [transferHistory, setTransferHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderingItemId, setOrderingItemId] = useState<string | null>(null);
  const [viewDept, setViewDept] = useState<string>('');

  const inventory = (inventoryProp?.length ? inventoryProp : inventoryFetched) || [];

  const myDept = (user?.department || '').trim();
  const myCompany = (user?.company || '').trim();
  const effectiveDept = viewDept || myDept;

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!inventoryProp?.length) {
        const { data: inv } = await supabase.from('inventory').select('*').order('name');
        setInventoryFetched(inv || []);
      }
      const { data } = await supabase
        .from('asset_loans')
        .select('id, asset_type, asset_name, loaned_at, returned_at, staff_id')
        .is('returned_at', null);
      const { data: transfers } = await supabase
        .from('inventory_transfers')
        .select('id, item_name, quantity, from_company, from_department, to_company, to_department, transferred_by, created_at, status')
        .order('created_at', { ascending: false })
        .limit(100);
      const list = data || [];
      setTransferHistory(transfers || []);
      if (list.length === 0) {
        setAssetLoans([]);
        setLoading(false);
        return;
      }
      const staffIds = [...new Set(list.map((r: any) => r.staff_id))];
      const { data: staffs } = await supabase.from('staff_members').select('id, name, department, company').in('id', staffIds);
      const staffMap: Record<string, any> = {};
      (staffs || []).forEach((s: any) => { staffMap[s.id] = s; });
      setAssetLoans(list.map((r: any) => ({ ...r, staff: staffMap[r.staff_id] })));
      setLoading(false);
    })();
  }, [inventoryProp?.length]);

  // 우리 부서 물품: 회사 일치 + 부서 일치(또는 부서 미지정만 보려면 effectiveDept 있을 때만)
  const deptItems = inventory.filter((item: any) => {
    const coMatch = !myCompany || item.company === myCompany;
    const deptMatch = !effectiveDept || (item.department || '').trim() === effectiveDept;
    return coMatch && deptMatch;
  });

  // 우리 부서 장비: 미반납 대여 중 직원의 부서가 우리 부서인 것
  const deptAssets = assetLoans.filter((r: any) => (r.staff?.department || '').trim() === effectiveDept);
  const deptTransfers = transferHistory.filter((transfer: any) => {
    const fromDept = String(transfer.from_department || '').trim();
    const toDept = String(transfer.to_department || '').trim();
    const fromCompany = String(transfer.from_company || '').trim();
    const toCompany = String(transfer.to_company || '').trim();
    const companyMatches =
      !myCompany || fromCompany === myCompany || toCompany === myCompany;

    if (!companyMatches) return false;
    if (!effectiveDept) return true;

    return fromDept === effectiveDept || toDept === effectiveDept;
  }).slice(0, 12);

  const departments = Array.from(new Set([
    ...inventory.map((i: any) => (i.department || '').trim()).filter(Boolean),
    ...assetLoans.map((r: any) => (r.staff?.department || '').trim()).filter(Boolean)
  ])).sort();

  const handleQuickReorder = async (item: any) => {
    const orderQty = getRecommendedOrderQuantity(item);
    if (!confirm(`${item.name || item.item_name} ${orderQty}개를 자동 발주 신청하시겠습니까?`)) {
      return;
    }

    setOrderingItemId(String(item.id));
    try {
      const { error } = await requestInventoryReorder({
        item,
        user,
        quantity: orderQty,
        reason: `${effectiveDept || myDept || '미지정 부서'} 화면에서 발주 필요 품목으로 확인되어 자동 발주 신청되었습니다. 현재 재고: ${getItemQuantity(item)}개 / 권장 발주량: ${orderQty}개`,
      });
      if (error) throw error;
      toast('자동 발주 신청이 완료되었습니다.', 'success');
    } catch {
      toast('자동 발주 신청에 실패했습니다.', 'error');
    } finally {
      setOrderingItemId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-bold text-[var(--foreground)]">부서별 물품·장비 현황</h2>
        {departments.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">조회 부서</label>
            <select
              value={viewDept}
              onChange={e => setViewDept(e.target.value)}
              className="border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-bold bg-[var(--card)]"
            >
              <option value="">내 부서 ({myDept || '미지정'})</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!effectiveDept && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-[var(--radius-lg)] text-sm text-amber-800">
          부서가 지정되지 않은 경우 위에서 조회 부서를 선택하면 해당 부서의 물품·장비를 볼 수 있습니다.
        </div>
      )}

      {/* 우리 부서 물품 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          📦 {effectiveDept ? `[${effectiveDept}] 물품 재고` : '물품 재고 (부서 선택 시 필터)'}
        </h3>
        {loading ? (
          <p className="text-[var(--toss-gray-3)] text-sm">로딩 중...</p>
        ) : deptItems.length === 0 ? (
          <p className="text-[var(--toss-gray-3)] text-sm">해당 부서에 배정된 물품이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
                  <th className="pb-2 pr-4">품목명</th>
                  <th className="pb-2 pr-4">분류</th>
                  <th className="pb-2 pr-4">잔여 수량</th>
                  <th className="pb-2 pr-4">최소재고</th>
                  <th className="pb-2 pr-4">상태</th>
                  <th className="pb-2 pr-4">빠른 작업</th>
                </tr>
              </thead>
              <tbody>
                {deptItems.map((item: any) => (
                  <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 pr-4 font-bold text-[var(--foreground)]">{item.name || item.item_name}</td>
                    <td className="py-3 pr-4 text-[var(--toss-gray-3)]">{item.category || '-'}</td>
                    <td className="py-3 pr-4 font-semibold text-[var(--foreground)]">{item.stock ?? item.quantity ?? 0}</td>
                    <td className="py-3 pr-4 text-[var(--toss-gray-3)]">{item.min_stock ?? item.min_quantity ?? '-'}</td>
                    <td className="py-3 pr-4">
                      {(item.stock ?? item.quantity ?? 0) <= (item.min_stock ?? item.min_quantity ?? 0) ? (
                        <span className="text-red-600 text-[11px] font-semibold">발주 필요</span>
                      ) : (
                        <span className="text-emerald-600 text-[11px] font-semibold">정상</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {(item.stock ?? item.quantity ?? 0) <= (item.min_stock ?? item.min_quantity ?? 0) ? (
                        <button
                          type="button"
                          onClick={() => void handleQuickReorder(item)}
                          disabled={orderingItemId === String(item.id)}
                          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {orderingItemId === String(item.id) ? '신청 중...' : `자동 발주 ${getRecommendedOrderQuantity(item)}개`}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[var(--toss-gray-3)]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 우리 부서 장비 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          🖥️ {effectiveDept ? `[${effectiveDept}] 보유 장비 (미반납)` : '보유 장비 (부서 선택 시 필터)'}
        </h3>
        {loading ? (
          <p className="text-[var(--toss-gray-3)] text-sm">로딩 중...</p>
        ) : deptAssets.length === 0 ? (
          <p className="text-[var(--toss-gray-3)] text-sm">해당 부서에서 사용 중인 장비가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
                  <th className="pb-2 pr-4">장비 종류</th>
                  <th className="pb-2 pr-4">장비명</th>
                  <th className="pb-2 pr-4">사용자</th>
                  <th className="pb-2 pr-4">대여일</th>
                </tr>
              </thead>
              <tbody>
                {deptAssets.map((r: any) => (
                  <tr key={r.id} className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 pr-4 font-bold text-[var(--foreground)]">{r.asset_type}</td>
                    <td className="py-3 pr-4 text-[var(--toss-gray-4)]">{r.asset_name || '-'}</td>
                    <td className="py-3 pr-4 text-[var(--foreground)]">{r.staff?.name ?? '-'}</td>
                    <td className="py-3 pr-4 text-[var(--toss-gray-3)]">{r.loaned_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          🔄 {effectiveDept ? `[${effectiveDept}] 최근 부서 이동 이력` : '최근 부서 이동 이력'}
        </h3>
        {loading ? (
          <p className="text-[var(--toss-gray-3)] text-sm">로딩 중...</p>
        ) : deptTransfers.length === 0 ? (
          <p className="text-[var(--toss-gray-3)] text-sm">표시할 이동 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {deptTransfers.map((transfer: any) => {
              const fromLabel = [transfer.from_company, transfer.from_department].filter(Boolean).join(' · ') || '-';
              const toLabel = [transfer.to_company, transfer.to_department].filter(Boolean).join(' · ') || '-';
              return (
                <div
                  key={transfer.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--page-bg)] px-4 py-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">{transfer.item_name || '이동 품목'}</p>
                      <p className="mt-1 text-xs text-[var(--toss-gray-3)]">
                        {fromLabel} → {toLabel}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--toss-gray-3)]">
                      <span className="font-semibold text-[var(--foreground)]">{transfer.quantity || 0}개</span>
                      <span>{transfer.transferred_by || '담당자 미기록'}</span>
                      <span>{transfer.created_at ? new Date(transfer.created_at).toLocaleString('ko-KR') : '-'}</span>
                      <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--toss-gray-4)]">
                        {transfer.status || '완료'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
