'use client';
/**
 * DeptInventoryTable — 부서별 물품 재고 테이블 섹션
 *
 * 책임: 물품 재고 카드(헤더 + 테이블 렌더링). MSO/일반 부서 분기 행 액션 포함.
 * JM: 단일책임, 약 160줄
 * JM6: th scope, button type 명시
 */

import {
  type WeekBasis,
  type ItemWeekSetting,
  calcMinStock,
} from './dept-week-settings';
import { DeptInventoryRow, type DeptInventoryMode, type DeptInventoryRowItem } from './DeptInventoryRow';
import { type OrderDraftItem } from './PurchaseOrderModal';

interface InventoryDisplayItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  setting: ItemWeekSetting;
  recommendedQty: number;
}

interface Props {
  loading: boolean;
  effectiveDept: string;
  inventoryMode: DeptInventoryMode;
  displayItems: InventoryDisplayItem[];
  orderingItemId: string | null;
  isHq: boolean;
  orderDraft: OrderDraftItem[];
  onChangeWeeks: (itemId: string, weeks: WeekBasis) => void;
  onChangeWeekly: (itemId: string, weekly: number) => void;
  onQuickReorder: (itemId: string) => void;
  onAddToOrderDraft: (itemId: string) => void;
}

export default function DeptInventoryTable({
  loading,
  effectiveDept,
  inventoryMode,
  displayItems,
  orderingItemId,
  isHq,
  orderDraft,
  onChangeWeeks,
  onChangeWeekly,
  onQuickReorder,
  onAddToOrderDraft,
}: Props) {
  return (
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
      ) : displayItems.length === 0 ? (
        <p className="text-[var(--toss-gray-3)] text-sm">해당 부서에 배정된 물품이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--toss-gray-3)]">
                <th scope="col" className="px-3 py-2 text-left font-semibold">품목명</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">분류</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">잔여</th>
                {inventoryMode === 'setting' ? (
                  <>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">주간 소비</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">보유 기준 (주)</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">최소재고</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">주간 소비</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">최소재고</th>
                    <th scope="col" className="px-3 py-2 text-center font-semibold">상태</th>
                    <th scope="col" className="px-3 py-2 text-center font-semibold">빠른 작업</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {displayItems.map(({ id, name, category, quantity, setting, recommendedQty }) => {
                const min = calcMinStock(setting);
                const isDanger = quantity < min;
                const alreadyInDraft = orderDraft.some((d) => d.itemId === id);

                // §5-2: MSO 본사 + view 모드 + 발주 필요 행 → "발주서에 추가" 버튼
                if (inventoryMode === 'view' && isDanger && isHq) {
                  return (
                    <tr key={id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2 text-sm font-semibold text-[var(--foreground)]">{name}</td>
                      <td className="px-3 py-2 text-xs text-[var(--toss-gray-3)]">{category}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="text-sm font-bold text-[var(--danger)]">{quantity}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-[var(--toss-gray-4)] tabular-nums">
                        {setting.weekly > 0 ? `${setting.weekly}/주` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="text-sm font-semibold text-[var(--foreground)] tabular-nums">{min}</div>
                        <div className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">{setting.weeks}주 기준</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--danger)]">
                          발주 필요
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onAddToOrderDraft(id)}
                          disabled={alreadyInDraft}
                          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {alreadyInDraft ? '추가됨' : `발주서에 ${recommendedQty}개 추가`}
                        </button>
                      </td>
                    </tr>
                  );
                }

                // 일반 부서 또는 setting 모드 — DeptInventoryRow 위임
                const rowItem: DeptInventoryRowItem = { id, name, category, quantity };
                return (
                  <DeptInventoryRow
                    key={id}
                    item={rowItem}
                    mode={inventoryMode}
                    setting={setting}
                    ordering={orderingItemId === id}
                    recommendedQty={recommendedQty}
                    onChangeWeeks={onChangeWeeks}
                    onChangeWeekly={onChangeWeekly}
                    onQuickReorder={onQuickReorder}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
