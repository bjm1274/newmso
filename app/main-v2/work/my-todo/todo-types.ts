/**
 * todo-types.ts — 할 일 타입 및 상수
 *
 * JM4: any 금지, 명시적 타입
 * JM: 단일 책임 — 타입·상수만
 */

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type TodoPriority = 'high' | 'medium' | 'low';
export type FilterTab = 'all' | 'active' | 'done' | 'high';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority: TodoPriority;
  dueDate: string | null; // YYYY-MM-DD
  category: string;
}

// ── 우선순위 설정 ─────────────────────────────────────────────────────────────

export const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string; bg: string }> = {
  high:   { label: '높음', color: '#EF4444', bg: '#FEF2F2' },
  medium: { label: '보통', color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: '낮음', color: '#10B981', bg: '#F0FDF4' },
};

// ── 필터 탭 설정 ──────────────────────────────────────────────────────────────

export const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',    label: '전체'        },
  { id: 'active', label: '진행 중'     },
  { id: 'done',   label: '완료'        },
  { id: 'high',   label: '높은 우선순위' },
];

// ── 더미 데이터 ───────────────────────────────────────────────────────────────

export const INITIAL_TODOS: Todo[] = [
  { id: 't1', text: '4월 근무확인서 제출', done: true,  priority: 'high',   dueDate: '2026-05-11', category: '서류' },
  { id: 't2', text: '병동 인수인계 노트 작성', done: false, priority: 'high',   dueDate: '2026-05-11', category: '업무' },
  { id: 't3', text: '복지포인트 신청 확인', done: true,  priority: 'medium', dueDate: '2026-05-15', category: '복지' },
  { id: 't4', text: '감염관리 교육 수강', done: false, priority: 'medium', dueDate: '2026-05-20', category: '교육' },
  { id: 't5', text: '5월 연차 계획 제출', done: false, priority: 'low',    dueDate: '2026-05-31', category: '근태' },
];
