'use client';

import React from 'react';
import { Package, AlertTriangle, Calendar, ShoppingBag, ArrowRight } from 'lucide-react';
import type { StockStatusRow } from '../재고관리워크센터/stock-types';

// ==========================================
// 1. InventoryRecordCard (모바일 전용 재고 카드)
// ==========================================
export interface InventoryRecordCardProps {
  row: StockStatusRow;
  onAction?: () => void;
}

export function InventoryRecordCard({ row, onAction }: InventoryRecordCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case '재고 0':
        return 'text-[var(--danger)] bg-[var(--danger-light)] dark:bg-red-950/30 border border-red-500/20';
      case '부족':
        return 'text-[var(--warning)] bg-[var(--warning-light)] dark:bg-amber-950/30 border border-red-500/20';
      case '유효기간':
        return 'text-amber-500 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/20';
      default:
        return 'text-[var(--success)] bg-[var(--success-light)] dark:bg-emerald-950/30 border border-emerald-500/20';
    }
  };

  return (
    <div className="macos-glass border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex flex-col gap-3 transition-transform active:scale-[0.99] shadow-[var(--shadow-xs)] bg-[var(--card)]/90 backdrop-blur-md">
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-wider">
            {row.cat}
          </span>
          <h4 className="text-[14.5px] font-bold text-[var(--foreground)] leading-snug">
            {row.name}
          </h4>
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${getStatusColor(row.status)}`}>
          {row.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 py-1 px-2.5 rounded-lg bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border border-[rgba(0,0,0,0.03)] dark:border-[rgba(255,255,255,0.03)] text-[12px]">
        <div className="flex flex-col">
          <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">현재 재고</span>
          <span className={`font-extrabold tabular-nums text-[13.5px] ${row.stock === 0 ? 'text-[var(--danger)]' : row.stock < row.min ? 'text-[var(--warning)]' : 'text-[var(--foreground)]'}`}>
            {row.stock} <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">{row.unit}</span>
          </span>
        </div>
        <div className="flex flex-col border-l border-[var(--border)] pl-2">
          <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">안전 최소</span>
          <span className="font-bold tabular-nums text-[13px] text-[var(--foreground)]">
            {row.min} <span className="text-[10px] text-[var(--toss-gray-4)]">{row.unit}</span>
          </span>
        </div>
        <div className="flex flex-col border-l border-[var(--border)] pl-2">
          <span className="text-[10px] text-[var(--toss-gray-4)] font-medium">보관 위치</span>
          <span className="font-semibold text-[var(--toss-gray-5)] truncate">
            {row.loc || '-'}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center gap-4 text-[11px] pt-1">
        <div className="flex items-center gap-1 text-[var(--toss-gray-4)]">
          <Calendar className="w-3.5 h-3.5" />
          <span>유효기간:</span>
          <span className="font-semibold tabular-nums text-[var(--toss-gray-5)]">
            {row.expire || '-'}
          </span>
        </div>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="btn-premium-primary text-[11px] font-extrabold py-1 px-3 rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
          >
            <ShoppingBag className="w-3 h-3" />
            <span>발주</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 2. InventoryKpiCard (재고 지표 카드)
// ==========================================
export interface InventoryKpiCardProps {
  label: string;
  value: number | string;
  subValue?: string;
  iconType: 'total' | 'warn' | 'danger' | 'calendar';
  active?: boolean;
  onClick?: () => void;
}

export function InventoryKpiCard({ label, value, subValue, iconType, active = false, onClick }: InventoryKpiCardProps) {
  const getIcon = () => {
    switch (iconType) {
      case 'warn':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'danger':
        return <Package className="w-5 h-5 text-red-500" />;
      case 'calendar':
        return <Calendar className="w-5 h-5 text-blue-500" />;
      default:
        return <Package className="w-5 h-5 text-[var(--accent)]" />;
    }
  };

  const getBgTone = () => {
    if (active) return 'border-[var(--accent)] bg-[rgba(37,99,235,0.03)] dark:bg-[rgba(59,130,246,0.06)] shadow-md';
    return 'border-[var(--border)] hover:border-zinc-300 dark:hover:border-zinc-700 bg-[var(--card)] hover:bg-[var(--surface-subtle)]';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`app-card p-4 flex flex-col gap-2.5 text-left transition-all ${getBgTone()} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex justify-between items-center w-full">
        <span className="text-[12px] font-bold text-[var(--toss-gray-4)]">{label}</span>
        <div className="p-1.5 rounded-lg bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.03)]">
          {getIcon()}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[20px] font-extrabold tabular-nums text-[var(--foreground)] leading-none">
          {value}
        </span>
        {subValue && (
          <span className="text-[11px] font-medium text-[var(--toss-gray-3)] tabular-nums">
            {subValue}
          </span>
        )}
      </div>
    </button>
  );
}

// ==========================================
// 3. OrderStatusStepper (발주 진행 스테퍼)
// ==========================================
export interface OrderStatusStepperProps {
  currentStatus: '요청' | '검토' | '결재' | '발주' | '입고' | '완료';
}

const STEPS = ['요청', '검토', '결재', '발주', '입고', '완료'] as const;

export function OrderStatusStepper({ currentStatus }: OrderStatusStepperProps) {
  const currentIndex = STEPS.indexOf(currentStatus);

  return (
    <div className="w-full py-4 px-2 flex items-center justify-between gap-1 overflow-x-auto scrollbar-none">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isActive = idx === currentIndex;

        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-1.5 flex-1 min-w-[50px]">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold border transition-all ${
                  isCompleted
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                    : isActive
                      ? 'bg-[var(--card)] border-[var(--accent)] text-[var(--accent)] ring-2 ring-[var(--accent-light)]'
                      : 'bg-[var(--card)] border-[var(--border)] text-[var(--toss-gray-4)]'
                }`}
              >
                {isCompleted ? '✓' : idx + 1}
              </div>
              <span
                className={`text-[11px] font-bold transition-colors ${
                  isActive ? 'text-[var(--accent)] font-extrabold' : isCompleted ? 'text-[var(--foreground)]' : 'text-[var(--toss-gray-4)]'
                }`}
              >
                {step}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 rounded-full transition-colors ${
                  idx < currentIndex ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
                style={{ minWidth: '16px' }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ==========================================
// 4. StockChangePreview (수량 변동 결과 미리보기)
// ==========================================
export interface StockChangePreviewProps {
  itemName: string;
  beforeQty: number;
  afterQty: number;
  unit: string;
  type: '실사' | '이관' | '조정';
  extraInfo?: string;
}

export function StockChangePreview({ itemName, beforeQty, afterQty, unit, type, extraInfo }: StockChangePreviewProps) {
  const diff = afterQty - beforeQty;

  return (
    <div className="macos-glass border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-xs)] flex flex-col gap-3 bg-[var(--card)]/90 backdrop-blur-md">
      <div className="flex justify-between items-center">
        <h5 className="text-[13px] font-extrabold text-[var(--foreground)]">
          {type} 결과 미리보기
        </h5>
        {extraInfo && (
          <span className="text-[11px] text-[var(--toss-gray-4)] font-medium">
            {extraInfo}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-xl bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] border border-[rgba(0,0,0,0.03)] dark:border-[rgba(255,255,255,0.03)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--toss-gray-4)] font-semibold">대상 품목</span>
          <span className="text-[12.5px] font-bold text-[var(--foreground)] truncate max-w-[120px]">
            {itemName}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[13px]">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-[var(--toss-gray-4)]">변경 전</span>
            <span className="font-semibold tabular-nums text-[var(--toss-gray-5)]">
              {beforeQty} <span className="text-[10px] font-medium">{unit}</span>
            </span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-[var(--toss-gray-3)]" />

          <div className="flex flex-col items-start">
            <span className="text-[10px] text-[var(--toss-gray-4)]">변경 후</span>
            <span className="font-bold tabular-nums text-[var(--foreground)]">
              {afterQty} <span className="text-[10px] font-medium">{unit}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center text-[12px] pt-1">
        <span className="text-[var(--toss-gray-4)]">변동 수량</span>
        <span className={`font-extrabold tabular-nums ${diff > 0 ? 'text-[var(--success)]' : diff < 0 ? 'text-[var(--danger)]' : 'text-[var(--foreground)]'}`}>
          {diff > 0 ? `+${diff}` : diff} <span className="text-[10.5px] font-bold">{unit}</span>
        </span>
      </div>
    </div>
  );
}

// ==========================================
// 5. InventoryModeSegment (입출고 등록 세그먼트 컨트롤)
// ==========================================
export interface InventoryModeSegmentProps {
  modes: readonly string[];
  activeMode: string;
  onChange: (mode: any) => void;
}

export function InventoryModeSegment({ modes, activeMode, onChange }: InventoryModeSegmentProps) {
  return (
    <div className="flex p-0.5 rounded-xl bg-[var(--surface-muted)] dark:bg-zinc-800/50 border border-[var(--border)] select-none">
      {modes.map((mode) => {
        const isActive = activeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`flex-1 py-1.5 text-center text-[12.5px] font-extrabold rounded-lg transition-all ${
              isActive
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm font-black'
                : 'text-[var(--toss-gray-4)] hover:text-[var(--foreground)] hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.03)]'
            }`}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

// ==========================================
// 6. AffectedItemSummary (영향받는 품목 요약 패널)
// ==========================================
export interface AffectedItemSummaryProps {
  items: Array<{ name: string; qty?: number; extra?: string }>;
  title?: string;
}

export function AffectedItemSummary({ items, title = "선택된 대상 요약" }: AffectedItemSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div className="macos-glass border border-[var(--border)] rounded-[var(--radius-lg)] p-4 bg-[var(--card)]/90 backdrop-blur-md shadow-[var(--shadow-xs)] flex flex-col gap-2.5 animate-in fade-in duration-200">
      <div className="flex justify-between items-center">
        <span className="text-[12px] font-extrabold text-[var(--foreground)]">{title}</span>
        <span className="text-[11px] font-bold text-[var(--accent)] bg-[rgba(37,99,235,0.08)] px-2.5 py-0.5 rounded-full">
          총 {items.length}건
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div
            key={`${item.name}-${idx}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.04)] border border-[rgba(0,0,0,0.02)] text-[11px] font-semibold text-[var(--toss-gray-5)]"
          >
            <span className="truncate max-w-[100px]">{item.name}</span>
            {item.qty !== undefined && (
              <span className="font-extrabold text-[var(--accent)] tabular-nums">
                ({item.qty})
              </span>
            )}
            {item.extra && (
              <span className="text-[10px] text-[var(--toss-gray-3)]">
                | {item.extra}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
