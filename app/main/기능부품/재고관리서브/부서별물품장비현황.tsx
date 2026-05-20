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
import { DeptInventoryRow, type DeptInventoryMode } from './DeptInventoryRow';

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
  const [inventoryMode, setInventoryMode] = useState<DeptInventoryMode>('view');
  const [deptWeekSettings, setDeptWeekSettings] = useState<DeptWeekSettings>({});
  const { data: appData } = useAppData();

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
    return {
      total: deptItems.length,
      needOrder,
      normal,
      msoPending,
    };
  }, [deptItems, deptWeekSettings]);

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

      {!effectiveDept && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-lg)] text-sm text-amber-800 dark:text-amber-300">
          부서가 지정되지 않은 경우 위에서 조회 부서를 선택하면 해당 부서의 물품·장비를 볼 수 있습니다.
        </div>
      )}

      {/* 우리 부서 물품 — 주(week) 기반 최소재고 적용 */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            📦 {effectiveDept ? `[${effectiveDept}] 물품 재고` : '물품 재고 (부서 선택 시 필터)'}
          </h3>
          {inventoryMode === 'setting' && (
            <span className="text-[11px] text-[var(--toss-gray-3)]">
              최소재고 = 주간 소비량 × 보유 기준(주) · 부서별 자동 저장
            </span>
          )}
        </div>
        {loading ? (
          <p className="text-[var(--toss-gray-3)] text-sm">로딩 중...</p>
        ) : deptItems.length === 0 ? (
          <p className="text-[var(--toss-gray-3)] text-sm">해당 부서에 배정된 물품이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--toss-gray-3)]">
                  <th className="px-3 py-2 text-left font-semibold">품목명</th>
                  <th className="px-3 py-2 text-left font-semibold">분류</th>
                  <th className="px-3 py-2 text-right font-semibold">잔여</th>
                  {inventoryMode === 'setting' ? (
                    <>
                      <th className="px-3 py-2 text-right font-semibold">주간 소비</th>
                      <th className="px-3 py-2 text-left font-semibold">보유 기준 (주)</th>
                      <th className="px-3 py-2 text-right font-semibold">최소재고</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-right font-semibold">주간 소비</th>
                      <th className="px-3 py-2 text-right font-semibold">최소재고</th>
                      <th className="px-3 py-2 text-center font-semibold">상태</th>
                      <th className="px-3 py-2 text-center font-semibold">빠른 작업</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {deptItems.map((item) => {
                  const id = String(item.id);
                  const setting = getItemSetting(deptWeekSettings, id);
                  return (
                    <DeptInventoryRow
                      key={id}
                      item={{
                        id,
                        name: item.name ?? item.item_name ?? '-',
                        category: item.category ?? '-',
                        quantity: getItemQuantity(item as Parameters<typeof getItemQuantity>[0]),
                      }}
                      mode={inventoryMode}
                      setting={setting}
                      ordering={orderingItemId === id}
                      recommendedQty={getRecommendedOrderQuantity(item as Parameters<typeof getRecommendedOrderQuantity>[0])}
                      onChangeWeeks={handleChangeWeeks}
                      onChangeWeekly={handleChangeWeekly}
                      onQuickReorder={handleQuickReorderById}
                    />
                  );
                })}
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
