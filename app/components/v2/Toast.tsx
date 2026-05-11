'use client';

/**
 * Toast.tsx — Phase 4 토스트 알림
 *
 * info | success | warning | error
 * 자동 dismiss (duration ms, 0 = 무한)
 * portal 렌더링 (document.body)
 *
 * JM6: role="alert" / role="status", aria-live
 * JM2: 타이머는 useEffect 내 단일 setTimeout
 */

import React, { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

// ── 스타일 ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ToastType, {
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean; className?: string }>;
  iconClass: string;
  borderClass: string;
  role: 'alert' | 'status';
}> = {
  info:    { icon: Info,          iconClass: 'text-[var(--accent)]',   borderClass: 'border-l-[var(--accent)]',   role: 'status' },
  success: { icon: CheckCircle,   iconClass: 'text-[var(--success)]',  borderClass: 'border-l-[var(--success)]',  role: 'status' },
  warning: { icon: AlertTriangle, iconClass: 'text-[var(--warning)]',  borderClass: 'border-l-[var(--warning)]',  role: 'alert'  },
  error:   { icon: AlertCircle,   iconClass: 'text-[var(--danger)]',   borderClass: 'border-l-[var(--danger)]',   role: 'alert'  },
};

// ── 개별 Toast 아이템 ─────────────────────────────────────────────────────────

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(true);
  const { icon: Icon, iconClass, borderClass, role } = TYPE_CONFIG[item.type];
  const duration = item.duration ?? 4000;

  useEffect(() => {
    if (duration === 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [item.id, duration, onDismiss]);

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={[
        'flex items-start gap-3 bg-[var(--card)] border border-[var(--border)] border-l-4 rounded-[var(--radius-lg)]',
        'shadow-[var(--shadow-lg)] px-4 py-3 w-full max-w-sm',
        'transition-all duration-200',
        borderClass,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
    >
      <Icon size={18} aria-hidden={true} className={`shrink-0 mt-0.5 ${iconClass}`} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
        {item.description && (
          <p className="text-xs text-[var(--toss-gray-4)] mt-0.5">{item.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(item.id), 200); }}
        aria-label="알림 닫기"
        className="shrink-0 p-1 rounded-[var(--radius-sm)] hover:bg-[var(--muted)] text-[var(--toss-gray-4)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Context / Provider ────────────────────────────────────────────────────────

interface ToastContextValue {
  toast: (item: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const div = document.createElement('div');
    div.id = 'toast-root';
    div.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column-reverse;gap:0.5rem;pointer-events:none;';
    document.body.appendChild(div);
    containerRef.current = div;
    return () => { document.body.removeChild(div); };
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = `toast-${++counter}`;
    setItems((prev) => [...prev, { ...item, id }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted && containerRef.current &&
        createPortal(
          <div style={{ pointerEvents: 'auto' }}>
            {items.map((item) => (
              <ToastCard key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </div>,
          containerRef.current,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast는 <ToastProvider> 내부에서 사용해야 합니다.');
  return ctx;
}

export default ToastCard;
