/**
 * app/components/v2 — Phase 4 공통 컴포넌트 barrel export
 *
 * 사용법: import { Button, Card } from '@/app/components/v2'
 *
 * Note: 외부 사용 0인 컴포넌트(Toast/Modal/Input/Select/FormLayout/BottomSheet/
 * FullScreenModal/SwipeAction/PullToRefresh)는 dead로 제거됨.
 */

// ── 기본 UI ───────────────────────────────────────────────────────────────────
export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { default as Table } from './Table';
export type { TableProps, ColumnDef } from './Table';

export { default as Tabs, TabPanel } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { default as Card } from './Card';
export type { CardProps, CardVariant, CardPadding } from './Card';

export { default as Badge } from './Badge';
export type { BadgeProps, BadgeColor, BadgeSize } from './Badge';

// ── 피드백 ────────────────────────────────────────────────────────────────────
export { default as Spinner, Skeleton, SkeletonCard } from './Loader';
export type { SpinnerProps, SkeletonProps, SpinnerSize } from './Loader';

export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAction } from './EmptyState';
