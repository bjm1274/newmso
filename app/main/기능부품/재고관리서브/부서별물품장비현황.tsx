'use client';
import { useActionDialog } from '@/app/components/useActionDialog';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { getRecommendedOrderQuantity, getItemQuantity, requestInventoryReorder } from '@/app/main/inventory-utils';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import {
  type WeekBasis,
  type DeptWeekSettings,
  loadDeptWeekSettings,
  upsertItemSetting,
  getItemSetting,
  calcMinStock,
} from './dept-week-settings';
import { type DeptInventoryMode } from './DeptInventoryRow';
import PurchaseOrderModal, { type OrderDraftItem, type SupplierGroup } from './PurchaseOrderModal';
import DeptTransferHistory from './DeptTransferHistory';
import DeptInventoryTable from './DeptInventoryTable';

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
  supplier_name?: string;
  unit_price?: number;
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

interface Supplier {
  id: string;
  name: string;
}

// ---- MSO 본사 판별 헬퍼 ----
function isMsoHq(company: string, department: string): boolean {
  const co = company.toLowerCase();
  const dept = department.toLowerCase();
  return (
    co.includes('본사') || co.includes('sy') || co.includes('mso') ||
    dept.includes('본사') || dept.includes('mso')
  );
}

// ESLint 규칙에 맞게 컴포넌트 이름을 영문 대문자로 시작하게 변경합니다.
// default export 이므로 외부에서의 import 이름(부서별물품장비현황)은 그대로 유지됩니다.
export default function DepartmentAssetOverview({ user, inventory: inventoryProp }: { user: { department?: string; company?: string; id?: string } | null; inventory?: InventoryItem[] }) {
  const { dialog, openConfirm } = useActionDialog();
  const [assetLoans, setAssetLoans] = useState<AssetLoan[]>([]);
  const [inventoryFetched, setInventoryFetched] = useState<InventoryItem[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderingItemId, setOrderingItemId] = useState<string | null>(null);
  const [viewDept, setViewDept] = useState<string>('');
  const [inventoryMode, setInventoryMode] = useState<DeptInventoryMode>('view');
  const [deptWeekSettings, setDeptWeekSettings] = useState<DeptWeekSettings>({});
  const { data: appData } = useAppData();

  // ---- 발주서 모달 state (MSO 본사 전용) ----
  const [orderDraft, setOrderDraft] = useState<OrderDraftItem[]>([]);
  const [supplierGroups, setSupplierGroups] = useState<SupplierGroup[]>([]);
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [showOrderModal, setShowOrderModal] = useState(false);

  const inventory = (inventoryProp?.length ? inventoryProp : inventoryFetched) || [];

  const myDept = (user?.department || '').trim();
  const myCompany = (user?.company || '').trim();
  const effectiveDept = viewDept || myDept;

  // 부서가 바뀌면 해당 부서의 주(week) 설정을 LocalStorage에서 로드
  useEffect(() => {
    if (!effectiveDept) {
      setDeptWeekSettings({});
      return;
    }
    setDeptWeekSettings(loadDeptWeekSettings(effectiveDept));
  }, [effectiveDept]);

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

  // 부서·품목 단위 주(week) 설정 변경 핸들러
  const handleChangeWeeks = useCallback((itemId: string, weeks: WeekBasis) => {
    if (!effectiveDept) return;
    const updated = upsertItemSetting(effectiveDept, itemId, { weeks });
    setDeptWeekSettings(updated);
  }, [effectiveDept]);

  const handleChangeWeekly = useCallback((itemId: string, weekly: number) => {
    if (!effectiveDept) return;
    const updated = upsertItemSetting(effectiveDept, itemId, { weekly });
    setDeptWeekSettings(updated);
  }, [effectiveDept]);

  // KPI 계산: 주(week) 기반 최소재고 적용
  const inventoryStats = useMemo(() => {
    let needOrder = 0;
    let normal = 0;
    let msoPending = 0;
    for (const item of deptItems) {
      const qty = getItemQuantity(item as Parameters<typeof getItemQuantity>[0]);
      const setting = getItemSetting(deptWeekSettings, String(item.id));
      const min = calcMinStock(setting);
      if (qty < min) {
        needOrder += 1;
        // weekly가 설정돼 있고 부족 상태이면 'MSO 요청 대기' 후보로 카운트
        if (setting.weekly > 0) msoPending += 1;
      } else {
        normal += 1;
      }
    }
    return { total: deptItems.length, needOrder, normal, msoPending };
  }, [deptItems, deptWeekSettings]);

  // 우리 부서 장비: 미반납 대여 중 직원의 부서가 우리 부서인 것
  const deptAssets = assetLoans.filter((r) => (r.staff?.department || '').trim() === effectiveDept);
  const deptTransfers = transferHistory.filter((transfer) => {
    const fromDept = String(transfer.from_department || '').trim();
    const toDept = String(transfer.to_department || '').trim();
    const fromCompany = String(transfer.from_company || '').trim();
    const toCompany = String(transfer.to_company || '').trim();
    const companyMatches = !myCompany || fromCompany === myCompany || toCompany === myCompany;
    if (!companyMatches) return false;
    if (!effectiveDept) return true;
    return fromDept === effectiveDept || toDept === effectiveDept;
  }).slice(0, 12);

  const departments = Array.from(new Set([
    ...inventory.map((i) => (i.department || '').trim()).filter(Boolean),
    ...assetLoans.map((r) => (r.staff?.department || '').trim()).filter(Boolean)
  ])).sort();

  const handleQuickReorderByItem = useCallback(async (item: InventoryItem) => {
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

  // 행에서 호출하는 발주 핸들러 (itemId만 받음)
  const handleQuickReorderById = useCallback((itemId: string) => {
    const target = deptItems.find((it) => String(it.id) === itemId);
    if (!target) return;
    void handleQuickReorderByItem(target);
  }, [deptItems, handleQuickReorderByItem]);

  const assetColumns = useMemo((): Column<AssetLoan>[] => [
    { key: 'asset_type', label: '장비 종류', primary: true },
    { key: 'asset_name', label: '장비명', render: (r) => r.asset_name ?? '-' },
    { key: 'staff', label: '사용자', render: (r) => r.staff?.name ?? '-' },
    { key: 'loaned_at', label: '대여일', showOnMobile: false, render: (r) => r.loaned_at },
  ], []);

  // ---- 부족 품목 목록 (발주 대상) ----
  const shortfallItems = useMemo(() => deptItems.filter((item) => {
    const qty = getItemQuantity(item as Parameters<typeof getItemQuantity>[0]);
    const setting = getItemSetting(deptWeekSettings, String(item.id));
    return qty < calcMinStock(setting);
  }), [deptItems, deptWeekSettings]);

  // ---- MSO 본사 여부 ----
  const isHq = isMsoHq(myCompany, effectiveDept);

  // DeptInventoryTable에 전달할 정규화된 품목 목록
  const displayItems = useMemo(() => deptItems.map((item) => ({
    id: String(item.id),
    name: item.name ?? item.item_name ?? '-',
    category: item.category ?? '-',
    quantity: getItemQuantity(item as Parameters<typeof getItemQuantity>[0]),
    setting: getItemSetting(deptWeekSettings, String(item.id)),
    recommendedQty: getRecommendedOrderQuantity(item as Parameters<typeof getRecommendedOrderQuantity>[0]),
  })), [deptItems, deptWeekSettings]);

  // ---- 발주서 초안에 품목 추가 (MSO 본사 전용 행 액션) ----
  const handleAddToOrderDraft = useCallback((item: InventoryItem) => {
    const qty = getRecommendedOrderQuantity(item as Parameters<typeof getRecommendedOrderQuantity>[0]);
    const supplierName = String(item.supplier_name || '').trim() || '미지정';
    const unitPrice = Number(item.unit_price || 0);
    setOrderDraft((prev) => {
      const exists = prev.find((d) => d.itemId === String(item.id));
      if (exists) return prev.map((d) => d.itemId === String(item.id) ? { ...d, qty: d.qty + qty } : d);
      return [...prev, {
        itemId: String(item.id),
        name: item.name ?? item.item_name ?? '-',
        qty,
        unitPrice,
        currentStock: getItemQuantity(item as Parameters<typeof getItemQuantity>[0]),
        supplierName,
        supplierId: null,
      }];
    });
  }, []);

  // ---- 부족 품목 전체 발주서 초안 생성 (일괄 버튼) ----
  const handleBulkAddToOrderDraft = useCallback(async () => {
    if (shortfallItems.length === 0) {
      toast('발주가 필요한 품목이 없습니다.', 'warning');
      return;
    }
    let loadedSuppliers = supplierList;
    if (loadedSuppliers.length === 0) {
      const { data } = await supabase.from('suppliers').select('id, name').order('name');
      loadedSuppliers = (data as Supplier[]) || [];
      setSupplierList(loadedSuppliers);
    }
    const supplierMap = new Map(loadedSuppliers.map((s) => [s.name.toLowerCase(), s]));

    const draft: OrderDraftItem[] = shortfallItems.map((item) => {
      const qty = getRecommendedOrderQuantity(item as Parameters<typeof getRecommendedOrderQuantity>[0]);
      const rawSupplierName = String(item.supplier_name || '').trim();
      const matched = rawSupplierName ? supplierMap.get(rawSupplierName.toLowerCase()) : undefined;
      return {
        itemId: String(item.id),
        name: item.name ?? item.item_name ?? '-',
        qty,
        unitPrice: Number(item.unit_price || 0),
        currentStock: getItemQuantity(item as Parameters<typeof getItemQuantity>[0]),
        supplierName: (matched?.name ?? rawSupplierName) || '미지정',
        supplierId: matched?.id ?? null,
      };
    });

    // 거래처별 그룹핑
    const groupMap = new Map<string, SupplierGroup>();
    for (const d of draft) {
      const key = d.supplierId ?? d.supplierName;
      if (!groupMap.has(key)) {
        groupMap.set(key, { supplierId: d.supplierId, supplierName: d.supplierName, memo: '', items: [], selected: true, sending: false });
      }
      groupMap.get(key)!.items.push(d);
    }

    setOrderDraft(draft);
    setSupplierGroups(Array.from(groupMap.values()));
    setShowOrderModal(true);
  }, [shortfallItems, supplierList]);

  return (
    <div className="space-y-4">
      {dialog}
      {/* §4-4, §13.8, §13.15 부서별 재고: PageHeader 제목 + 컨텍스트 배너 삭제. 부서 셀렉터는 우상단 액션으로. */}
      {/* 우상단: 부서 셀렉터 + 재고/기준 segmented (결정 8번: 컨텍스트 배너 X) */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div
          role="tablist"
          aria-label="재고 보기 모드"
          className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inventoryMode === 'view'}
            onClick={() => setInventoryMode('view')}
            className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] transition ${
              inventoryMode === 'view'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
            }`}
          >
            재고 보기
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inventoryMode === 'setting'}
            onClick={() => setInventoryMode('setting')}
            className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] transition ${
              inventoryMode === 'setting'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)]'
            }`}
          >
            기준 설정 (주)
          </button>
        </div>
        {departments.length > 0 && (
          <>
            <label htmlFor="dept-view-select" className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">조회 부서</label>
            <select
              id="dept-view-select"
              value={viewDept}
              onChange={e => setViewDept(e.target.value)}
              className="border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-bold bg-[var(--card)]"
            >
              <option value="">내 부서 ({myDept || '미지정'})</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </>
        )}
        {/* §5-2: MSO 본사 — 자동 발주 일괄 → 발주서 생성 버튼 */}
        {isHq && inventoryMode === 'view' && shortfallItems.length > 0 && (
          <button
            type="button"
            onClick={() => { void handleBulkAddToOrderDraft(); }}
            className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] shadow-sm hover:opacity-90 transition"
          >
            자동 발주 일괄 → 발주서 생성 ({shortfallItems.length})
          </button>
        )}
        {/* §5-2: 일반 부서 — MSO 일괄 발주 요청 버튼 */}
        {!isHq && inventoryMode === 'view' && shortfallItems.length > 0 && (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                for (const item of shortfallItems) {
                  await handleQuickReorderByItem(item);
                }
              })();
            }}
            className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] shadow-sm hover:opacity-90 transition"
          >
            MSO 일괄 발주 요청 ({shortfallItems.length})
          </button>
        )}
      </div>

      {/* KPI 4종 */}
      {effectiveDept && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">전체 품목</div>
            <div className="mt-1 text-xl font-extrabold text-[var(--foreground)] tabular-nums">{inventoryStats.total}<span className="ml-1 text-xs font-semibold text-[var(--toss-gray-3)]">종</span></div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">발주 필요</div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-[var(--danger)]">{inventoryStats.needOrder}<span className="ml-1 text-xs font-semibold text-[var(--toss-gray-3)]">종</span></div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">정상</div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-emerald-600">{inventoryStats.normal}<span className="ml-1 text-xs font-semibold text-[var(--toss-gray-3)]">종</span></div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-[11px] font-semibold text-[var(--toss-gray-3)]">MSO 요청 대기</div>
            <div className="mt-1 text-xl font-extrabold text-[var(--accent)] tabular-nums">{inventoryStats.msoPending}<span className="ml-1 text-xs font-semibold text-[var(--toss-gray-3)]">건</span></div>
          </div>
        </div>
      )}

      {/* §5-1: amber 배너 제거 → 조용한 빈 상태 */}
      {!effectiveDept && (
        <p className="text-sm text-[var(--toss-gray-3)] text-center py-6">
          위에서 조회 부서를 선택하면 해당 부서의 물품·장비를 볼 수 있습니다.
        </p>
      )}

      {/* 우리 부서 물품 — 주(week) 기반 최소재고 적용 */}
      <DeptInventoryTable
        loading={loading}
        effectiveDept={effectiveDept}
        inventoryMode={inventoryMode}
        displayItems={displayItems}
        orderingItemId={orderingItemId}
        isHq={isHq}
        orderDraft={orderDraft}
        onChangeWeeks={handleChangeWeeks}
        onChangeWeekly={handleChangeWeekly}
        onQuickReorder={handleQuickReorderById}
        onAddToOrderDraft={(itemId) => {
          const target = deptItems.find((it) => String(it.id) === itemId);
          if (target) handleAddToOrderDraft(target);
        }}
      />

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

      <DeptTransferHistory
        transfers={deptTransfers}
        loading={loading}
        effectiveDept={effectiveDept}
      />

      {/* §5-3: 발주서 모달 (MSO 본사 전용) */}
      {showOrderModal && (
        <PurchaseOrderModal
          supplierGroups={supplierGroups}
          onGroupsChange={setSupplierGroups}
          onDraftChange={setOrderDraft}
          onClose={() => setShowOrderModal(false)}
          userId={user?.id}
          effectiveDept={effectiveDept || myDept}
        />
      )}
    </div>
  );
}
