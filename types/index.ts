/**
 * MSO ERP 공통 타입 정의
 * Supabase DB 스키마 기반
 */

// ─────────────────────────────────────────────
// 공통 기반 타입
// ─────────────────────────────────────────────

export interface StaffPermissions {
  mso?: boolean;
  menu_관리자?: boolean;
  menu_인사관리?: boolean;
  menu_재고관리?: boolean;
  menu_전자결재?: boolean;
  menu_게시판?: boolean;
  menu_메신저?: boolean;
  profile_photo_path?: string | null;
  profile_photo_updated_at?: string | null;
  profile_photo_url?: string | null;
  avatar_path?: string | null;
  extension?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  [key: string]: unknown;
}

export interface StaffMember {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company: string;
  company_id?: string | null;
  department?: string | null;
  position?: string | null;
  role?: string | null;
  status?: string | null;
  employee_no?: string | null;
  hire_date?: string | null;
  resign_date?: string | null;
  birth_date?: string | null;
  address?: string | null;
  gender?: string | null;
  annual_days?: number | null;
  annual_used?: number | null;
  salary?: number | null;
  presence_status?: 'online' | 'away' | 'offline' | null;
  permissions?: StaffPermissions | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  profile_photo_path?: string | null;
  profile_photo_updated_at?: string | null;
  extension?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// 로그인 유저 (localStorage erp_user 기반)
// ─────────────────────────────────────────────

export interface ErpUser extends StaffMember {
  token?: string | null;
  login_at?: string | null;
}

// ─────────────────────────────────────────────
// 게시판 포스트
// ─────────────────────────────────────────────

export interface BoardPost {
  id: string;
  board_id: string;
  title: string;
  content?: string | null;
  author_id?: string | null;
  author_name?: string | null;
  company?: string | null;
  company_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  likes_count?: number | null;
  status?: string | null;
  tags?: string[] | null;
  attachments?: AttachmentItem[] | null;
  scheduled_publish_at?: string | null;
  schedule_date?: string | null;
  schedule_time?: string | null;
  schedule_room?: string | null;
  patient_name?: string | null;
  surgery_fasting?: boolean | null;
  surgery_inpatient?: boolean | null;
  surgery_guardian?: boolean | null;
  surgery_caregiver?: boolean | null;
  surgery_transfusion?: boolean | null;
  mri_contrast_required?: boolean | null;
  [key: string]: unknown;
}

export interface AttachmentItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

// ─────────────────────────────────────────────
// 할 일(Task)
// ─────────────────────────────────────────────

export interface TaskItem {
  id: string;
  title: string;
  content?: string | null;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  company?: string | null;
  company_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// 수술/MRI 일정
// ─────────────────────────────────────────────

export interface ScheduleItem {
  id: string;
  patient_name?: string | null;
  surgery_type?: string | null;
  schedule_date?: string | null;
  schedule_time?: string | null;
  schedule_room?: string | null;
  doctor?: string | null;
  status?: string | null;
  company?: string | null;
  company_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// ERP 전체 데이터 컨텍스트
// ─────────────────────────────────────────────

export interface ERPData {
  staffs: StaffMember[];
  depts: string[];
  posts: BoardPost[];
  tasks: TaskItem[];
  surgeries: ScheduleItem[];
  mris: ScheduleItem[];
}

// ─────────────────────────────────────────────
// 전자결재
// ─────────────────────────────────────────────

export interface ApprovalStep {
  approver_id: string;
  approver_name?: string | null;
  order: number;
  status?: 'pending' | 'approved' | 'rejected' | 'skipped' | null;
  comment?: string | null;
  decided_at?: string | null;
}

export interface ApprovalDocument {
  id: string;
  title: string;
  form_type?: string | null;
  content?: Record<string, unknown> | null;
  status?: 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
  requester_id?: string | null;
  requester_name?: string | null;
  company?: string | null;
  company_id?: string | null;
  steps?: ApprovalStep[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// 메신저 채팅
// ─────────────────────────────────────────────

export interface ChatRoom {
  id: string;
  name?: string | null;
  type?: 'direct' | 'group' | 'notice' | null;
  company?: string | null;
  company_id?: string | null;
  member_ids?: string[] | null;
  last_message?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  unread_count?: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id?: string | null;
  sender_name?: string | null;
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  message_type?: 'text' | 'image' | 'file' | 'system' | null;
  created_at?: string | null;
  read_by?: string[] | null;
  reactions?: Record<string, string[]> | null;
  is_deleted?: boolean | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// 재고 관리
// ─────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  category?: string | null;
  code?: string | null;
  barcode?: string | null;
  serial_number?: string | null;
  unit?: string | null;
  quantity?: number | null;
  min_quantity?: number | null;
  price?: number | null;
  supplier_id?: string | null;
  location?: string | null;
  expiry_date?: string | null;
  company?: string | null;
  company_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface OpCheckItem {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
  checked?: boolean | null;
  source_label?: string | null;
  [key: string]: unknown;
}

export interface OpCheckTemplate {
  id: string;
  company_id?: string | null;
  company_name?: string | null;
  template_scope?: 'surgery' | 'anesthesia' | null;
  template_name?: string | null;
  surgery_template_id?: string | null;
  surgery_name?: string | null;
  anesthesia_type?: string | null;
  prep_items?: OpCheckItem[] | null;
  consumable_items?: OpCheckItem[] | null;
  notes?: string | null;
  is_active?: boolean | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface OpPatientCheck {
  id: string;
  schedule_post_id: string;
  company_id?: string | null;
  company_name?: string | null;
  patient_name?: string | null;
  chart_no?: string | null;
  surgery_name?: string | null;
  surgery_template_id?: string | null;
  anesthesia_type?: string | null;
  schedule_date?: string | null;
  schedule_time?: string | null;
  schedule_room?: string | null;
  prep_items?: OpCheckItem[] | null;
  consumable_items?: OpCheckItem[] | null;
  notes?: string | null;
  status?: string | null;
  applied_template_ids?: string[] | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  business_no?: string | null;
  company?: string | null;
  company_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// 급여
// ─────────────────────────────────────────────

export interface SalaryRecord {
  id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  year_month: string;
  base_salary?: number | null;
  total_pay?: number | null;
  total_deduction?: number | null;
  net_pay?: number | null;
  company?: string | null;
  company_id?: string | null;
  is_locked?: boolean | null;
  created_at?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// 유틸리티 타입
// ─────────────────────────────────────────────

/** Supabase 응답에서 사용하는 Record 타입 */
export type SupabaseRow = Record<string, unknown>;

/** 정렬 방향 */
export type SortDirection = 'asc' | 'desc';

/** 페이지네이션 */
export interface Pagination {
  page: number;
  pageSize: number;
  total?: number;
}
