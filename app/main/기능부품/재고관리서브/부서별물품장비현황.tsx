'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { getRecommendedOrderQuantity, getItemQuantity, requestInventoryReorder } from '@/app/main/inventory-utils';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import { useAppData } from '@/app/main/contexts/AppDataContext';

// ---- 타입 정의 ----
interface InventoryItem {
  id: string;
  name?: string;
  item_name?: string;
  category?: string;
  stock?: number;
  quantity?: number;
  min_stock?: number;
  min_quantity?: number;
  department?: string;
  company?: string;
  [key: string]: unknown;
}

interface AssetLoan {
  id: string | number;
  asset_type: string;
  asset_name?: string;
  loaned_at: string;
  returned_at?: string | null;
  staff_id: string;
  staff?: { name?: string; department?: string; company?: string };
}

interface TransferRecord {
  id: string | number;
  item_name?: string;
  quantity?: number;
  from_company?: string;
  from_department?: string;
  to_company?: string;
  to_department?: string;
  transferred_by?: string;
  created_at?: string;
  status?: string;
}

// ESLint 규칙에 맞게 컴포넌트 이름을 영문 대문자로 시작하게 변경합니다.
// default export 이므로 외부에서의 import 이름(부서별물품장비현황)은 그대로 유지됩니다.
export default function DepartmentAssetOverview({ user, inventory: inventoryProp }: { user: { department?: string; company?: string } | null; inventory?: InventoryItem[] }) {
  const { dialog, openConfirm } = useActionDialog();
  const [assetLoans, setAssetLoans] = useState<AssetLoan[]>([]);
  const [inventoryFetched, setInventoryFetched] = useState<InventoryItem[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderingItemId, setOrderingItemId] = useState<string | null>(null);
  const [viewDept, setViewDept] = useState<string>('');
  const { data: appData } = useAppData();

  const inventory = (inventoryProp?.length ? inventoryProp : inventoryFetched) || [];

  const myDept = (user?.department || '').trim();
  const myCompany = (user?.company || '').trim();
  const effectiveDept = viewDept || myDept;

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!inventoryProp?.length) {
        const { data: inv } = await supabase.from('inventory').select('*').order('name');
        setInventoryFetched((inv as InventoryItem[]) || []);
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
      const list = (data as Omit<AssetLoan, 'staff'>[]) || [];
      setTransferHistory((transfers as TransferRecord[]) || []);
      if (list.length === 0) {
        setAssetLoans([]);
        setLoading(false);
        return;
      }
      const staffIds = new Set(list.map((r) => r.staff_id));
      // AppDataContext.staffs[]에서 client-side filter (별도 supabase 호출 제거)
      const staffMap: Record<string, { id: string; name?: string; department?: string; company?: string }> = {};
      appData.staffs
        .filter((s) => staffIds.has(s.id))
        .forEach((s) => {
          staffMap[s.id] = {
            id: s.id,
            name: s.name ?? undefined,
            department: s.department ?? undefined,
            company: s.company ?? undefined,
          };
        });
      setAssetLoans(list.map((r) => ({ ...r, staff: staffMap[r.staff_id] })));
      setLoading(false);
    })();
  }, [inventoryProp?.length]);

  // 우리 부서 물품: 회사 일치 + 부서 일치(또는 부서 미지정만 보려면 effectiveDept 있을 때만)
  const deptItems = inventory.filter((item) => {
    const coMatch = !myCompany || item.company === myCompany;
    const deptMatch = !effectiveDept || (item.department || '').trim() === effectiveDept;
    return coMatch && deptMatch;
  });

  // 우리 부서 장비: 미반납 대여 중 직원의 부서가 우리 부서인 것
  const deptAssets = assetLoans.filter((r) => (r.staff?.department || '').trim() === effectiveDept);
  const deptTransfers = transferHistory.filter((transfer) => {
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
    ...inventory.map((i) => (i.department || '').trim()).filter(Boolean),
    ...assetLoans.map((r) => (r.staff?.department || '').trim()).filter(Boolean)
  ])).sort();

  const handleQuickReorder = useCallback(async (item: InventoryItem) => {
    const orderQty = getRecommendedOrderQuantity(item);
    const confirmed = await openConfirm({
      title: '부서 재고 발주 신청',
      description: `${item.name || item.item_name} ${orderQty}개를 자동 발주 신청합니다.\n부서 보유 현황 기준으로 결재 요청이 생성됩니다.`,
      confirmText: '발주 신청',
      tone: 'accent',
    });
    if (!confirmed) return;

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
  }, [openConfirm, user, effectiveDept, myDept]);

  // ---- 컬럼 정의 ----
  const deptItemColumns = useMemo((): Column<InventoryItem>[] => [
    {
      key: 'name',
      label: '품목명',
      primary: true,
      render: (item) => item.name ?? item.item_name ?? '-',
    },
    {
      key: 'category',
      label: '분류',
      render: (item) => item.category ?? '-',
    },
    {
      key: 'stock',
      label: '잔여 수량',
      align: 'right',
      render: (item) => String(item.stock ?? item.quantity ?? 0),
    },
    {
      key: 'min_stock',
      label: '최소재고',
      align: 'right',
      showOnMobile: false,
      render: (item) => String(item.min_stock ?? item.min_quantity ?? '-'),
    },
    {
      key: 'status',
      label: '상태',
      align: 'center',
      render: (item) => {
        const qty = item.stock ?? item.quantity ?? 0;
        const minQty = item.min_stock ?? item.min_quantity ?? 0;
        return qty <= minQty ? (
          <span className="text-red-600 text-[11px] font-semibold">발주 필요</span>
        ) : (
          <span className="text-emerald-600 text-[11px] font-semibold">정상</span>
        );
      },
    },
    {
      key: 'action',
      label: '빠른 작업',
      align: 'center',
      showOnMobile: false,
      render: (item) => {
        const qty = item.stock ?? item.quantity ?? 0;
        const minQty = item.min_stock ?? item.min_quantity ?? 0;
        return qty <= minQty ? (
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
        );
      },
    },
  ], [orderingItemId, handleQuickReorder]);

  const assetColumns = useMemo((): Column<AssetLoan>[] => [
    { key: 'asset_type', label: '장비 종류', primary: true },
    { key: 'asset_name', label: '장비명', render: (r) => r.asset_name ?? '-' },
    { key: 'staff', label: '사용자', render: (r) => r.staff?.name ?? '-' },
    {
      key: 'loaned_at',
      label: '대여일',
      showOnMobile: false,
      render: (r) => r.loaned_at,
    },
  ], []);

  return (
    <div className="space-y-4">
      {dialog}
      {/* §4-4, §13.8, §13.15 부서별 재고: PageHeader 제목 + 컨텍스트 배너 삭제. 부서 셀렉터는 우상단 액션으로. */}
      {departments.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
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

      {!effectiveDept && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-lg)] text-sm text-amber-800 dark:text-amber-300">
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
        ) : (
          <ResponsiveTable<InventoryItem>
            columns={deptItemColumns}
            rows={deptItems}
            keyField="id"
            emptyMessage="해당 부서에 배정된 물품이 없습니다."
          />
        )}
      </div>

      {/* 우리 부서 장비 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          🖥️ {effectiveDept ? `[${effectiveDept}] 보유 장비 (미반납)` : '보유 장비 (부서 선택 시 필터)'}
        </h3>
        {loading ? (
          <p className="text-[var(--toss-gray-3)] text-sm">로딩 중...</p>
        ) : (
          <ResponsiveTable<AssetLoan>
            columns={assetColumns}
            rows={deptAssets}
            keyField="id"
            emptyMessage="해당 부서에서 사용 중인 장비가 없습니다."
          />
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
            {deptTransfers.map((transfer) => {
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
