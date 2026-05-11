/**
 * app/components/v2 — Phase 4 공통 컴포넌트 barrel export
 *
 * 사용법: import { Button, Modal, Toast } from '@/app/components/v2'
 */

// ── 기본 UI ───────────────────────────────────────────────────────────────────
export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { default as Input } from './Input';
export type { InputProps, InputType } from './Input';

export { default as Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { default as Table } from './Table';
export type { TableProps, ColumnDef } from './Table';

export { default as Tabs, TabPanel } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { default as Card } from './Card';
export type { CardProps, CardVariant, CardPadding } from './Card';

export { default as Badge } from './Badge';
export type { BadgeProps, BadgeColor, BadgeSize } from './Badge';

// ── 피드백 ────────────────────────────────────────────────────────────────────
export { default as ToastCard, ToastProvider, useToast } from './Toast';
export type { ToastItem, ToastType } from './Toast';

export { default as Spinner, Skeleton, SkeletonCard } from './Loader';
export type { SpinnerProps, SkeletonProps, SpinnerSize } from './Loader';

export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAction } from './EmptyState';

// ── 폼 ───────────────────────────────────────────────────────────────────────
export { default as FormLayout, FormField, FormSection, FormActions } from './FormLayout';
export type { FormLayoutProps, FormFieldProps, FormSectionProps, FormActionsProps } from './FormLayout';

// ── 모바일 전용 ───────────────────────────────────────────────────────────────
export { default as Modal } from './Modal';
export type { ModalProps } from './Modal';

export { default as BottomSheet } from './BottomSheet';
export type { BottomSheetProps, SnapPoint } from './BottomSheet';

export { default as FullScreenModal } from './FullScreenModal';
export type { FullScreenModalProps } from './FullScreenModal';

export { default as SwipeAction } from './SwipeAction';
export type { SwipeActionProps, SwipeActionItem } from './SwipeAction';

export { default as PullToRefresh } from './PullToRefresh';
export type { PullToRefreshProps } from './PullToRefresh';
