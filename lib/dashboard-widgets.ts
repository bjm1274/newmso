/**
 * 커스텀 대시보드 위젯 정의 및 데이터 fetch
 */

export type WidgetType =
  | 'staff_count'
  | 'pending_approvals'
  | 'low_stock'
  | 'attendance_rate'
  | 'monthly_revenue'
  | 'leave_usage'
  | 'recent_notifications';

export type WidgetSize = 'sm' | 'md' | 'lg';

export type WidgetConfig = {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: number;
};

export type DashboardLayout = {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  widgets: WidgetConfig[];
  is_default: boolean;
};

export const WIDGET_DEFINITIONS: Record<WidgetType, { label: string; icon: string; defaultSize: WidgetSize; description: string }> = {
  staff_count: { label: '직원 현황', icon: '👥', defaultSize: 'sm', description: '재직/퇴직 인원 수' },
  pending_approvals: { label: '결재 대기', icon: '📋', defaultSize: 'sm', description: '미처리 결재 건수' },
  low_stock: { label: '재고 부족', icon: '📦', defaultSize: 'sm', description: '안전재고 미달 품목' },
  attendance_rate: { label: '출근율', icon: '🕐', defaultSize: 'sm', description: '오늘 출근률' },
  monthly_revenue: { label: '월 수익', icon: '💰', defaultSize: 'md', description: '이번 달 매출 요약' },
  leave_usage: { label: '연차 소진율', icon: '🏖️', defaultSize: 'sm', description: '전사 연차 사용률' },
  recent_notifications: { label: '최근 알림', icon: '🔔', defaultSize: 'lg', description: '최근 10개 알림' },
};

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'w1', type: 'staff_count', title: '직원 현황', size: 'sm', position: 0 },
  { id: 'w2', type: 'pending_approvals', title: '결재 대기', size: 'sm', position: 1 },
  { id: 'w3', type: 'low_stock', title: '재고 부족', size: 'sm', position: 2 },
  { id: 'w4', type: 'attendance_rate', title: '출근율', size: 'sm', position: 3 },
  { id: 'w5', type: 'leave_usage', title: '연차 소진율', size: 'sm', position: 4 },
  { id: 'w6', type: 'recent_notifications', title: '최근 알림', size: 'lg', position: 5 },
];
