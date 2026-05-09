'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canAccessMainMenu } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import type { ChatRoom } from '@/types';
import { fetchChatUnreadCountsByRoom } from '@/app/main/기능부품/메신저데이터유틸';
import { ADMIN_SIDEBAR_ITEMS } from '../../admin-menu-config';
import { CHAT_ACTIVE_ROOM_KEY } from '@/app/main/navigation-state';
import NotificationCenter from '../알림센터';
import { prefetchMenuModule } from './조직도본문';

import {
  getConversationRoomIdSet,
  getRoomPrefsStorageKey,
  NOTICE_ROOM_ID,
} from '@/app/main/기능부품/메신저유틸';

const MYPAGE_TAB_KEY = 'erp_mypage_tab';

type SubMenuItem = {
  id: string;
  label: string;
  group?: string;
  icon?: string;
  hidden?: boolean;
};

export const SUB_MENUS: Record<string, SubMenuItem[]> = {
  재고관리: [
    { id: '현황', label: '재고현황', group: '운영', icon: 'inventory-status' },
    { id: '등록', label: '입출고관리', group: '운영', icon: 'inventory-flow' },
    { id: '발주', label: '구매/발주', group: '기준', icon: 'purchase' },
    { id: '자산', label: '품목/자산', group: '기준', icon: 'asset' },
    { id: '월마감', label: '분석/마감', group: '마감', icon: 'analytics' },
    { id: '이력', label: '이력', group: '운영', icon: 'history', hidden: true },
    { id: '수요예측', label: '수요예측', group: '운영', icon: 'analytics', hidden: true },
    { id: '스캔', label: '스캔', group: '운영', icon: 'scan', hidden: true },
    { id: '재고실사', label: '재고실사', group: '운영', icon: 'search', hidden: true },
    { id: '이관', label: '이관', group: '운영', icon: 'transfer', hidden: true },
    { id: '납품확인서', label: '납품확인서', group: '기준', icon: 'document', hidden: true },
    { id: 'UDI', label: 'UDI', group: '기준', icon: 'tag', hidden: true },
    { id: '비품대여설정', label: '비품대여 설정', group: '기준', icon: 'briefcase', hidden: true },
    { id: '거래처', label: '거래처 / 명세서', group: '기준', icon: 'supplier', hidden: true },
    { id: '카테고리', label: '카테고리', group: '기준', icon: 'folder', hidden: true },
    { id: 'AS반품', label: 'AS반품', group: '기준', icon: 'return', hidden: true },
    { id: '소모품통계', label: '소모품통계', group: '마감', icon: 'analytics', hidden: true },
    { id: '내부서재고', label: '내 부서 재고', group: '운영', icon: 'inventory-status', hidden: true },
  ],
  게시판: [
    { id: '공지사항', label: '공지사항', icon: 'bell' },
    { id: '자유게시판', label: '자유게시판', icon: 'document' },
    { id: '경조사', label: '경조사 소식', icon: 'tag' },
    { id: '수술일정', label: '수술일정', icon: 'calendar' },
    { id: 'MRI일정', label: 'MRI일정', icon: 'scan' },
    { id: '업무가이드', label: '업무공유', icon: 'folder' },
  ],
  전자결재: [
    { id: '기안함', label: '기안함', icon: 'document' },
    { id: '결재함', label: '결재함', icon: 'check' },
    { id: '참조 문서함', label: '참조 문서함', icon: 'paperclip' },
    { id: '작성하기', label: '작성하기', icon: 'edit' },
  ],
  인사관리: [
    { id: '구성원', label: '구성원', group: '인력관리', icon: 'users' },
    { id: '인사변동', label: '인사변동', group: '인력관리', icon: 'briefcase' },
    { id: '입퇴사·교육센터', label: '입퇴사·교육센터', group: '인력관리', icon: 'compass' },
    { id: '근태', label: '근태', group: '근태/급여', icon: 'history' },
    { id: '급여', label: '급여', group: '근태/급여', icon: 'calculator' },
    { id: '경조사', label: '경조사', group: '복무/복지', icon: 'bell' },
    { id: '자격·안전센터', label: '자격·안전센터', group: '복무/복지', icon: 'admin' },
    { id: '계약', label: '계약', group: '문서/기타', icon: 'document' },
    { id: '문서센터', label: '문서센터', group: '문서/기타', icon: 'folder' },
  ],
  관리자: ADMIN_SIDEBAR_ITEMS,
};

const MAIN_MENUS = [
  { id: '내정보', icon: 'user', label: '내정보', testId: 'sidebar-menu-home' },
  { id: '추가기능', icon: 'plus', label: '추가기능', testId: 'sidebar-menu-extra' },
  { id: '채팅', icon: 'chat', label: '채팅', testId: 'sidebar-menu-chat' },
  { id: '게시판', icon: 'board', label: '게시판', testId: 'sidebar-menu-board' },
  { id: '전자결재', icon: 'approval', label: '전자결재', testId: 'sidebar-menu-approval' },
  { id: '인사관리', icon: 'hr', label: '인사관리', testId: 'sidebar-menu-hr' },
  { id: '재고관리', icon: 'inventory', label: '재고관리', testId: 'sidebar-menu-inventory' },
  { id: '관리자', icon: 'admin', label: '관리자', testId: 'sidebar-menu-admin' },
];

const ICON_PATHS: Record<string, React.ReactNode> = {
  user: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21a6 6 0 0 0-12 0" />
      <circle cx="10" cy="8" r="4" />
      <path d="M22 21a5 5 0 0 0-5-5" />
      <path d="M17 4a4 4 0 0 1 0 8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
  board: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
  approval: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="m9 15 2 2 4-5" />
    </>
  ),
  hr: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2.4" />
      <path d="M6.5 16c1.2-2 3.8-2 5 0" />
      <path d="M14 10h4" />
      <path d="M14 14h3" />
    </>
  ),
  inventory: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3 19 6v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6z" />
      <path d="M9.5 12.5 11 14l3.5-4" />
    </>
  ),
  settings: (
    <>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21.3a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.08H2.9a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.6 8.64a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.27 2.4V2.34a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.08h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 5-5 2 2-5z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  'inventory-status': (
    <>
      <path d="M4 20V8" />
      <path d="M10 20V4" />
      <path d="M16 20v-9" />
      <path d="M3 20h18" />
    </>
  ),
  'inventory-flow': (
    <>
      <path d="M7 7h11l-3-3" />
      <path d="M17 17H6l3 3" />
      <path d="M18 7 15 10" />
      <path d="M6 17l3-3" />
    </>
  ),
  purchase: (
    <>
      <path d="M7 8h14l-2 8H8z" />
      <path d="M7 8 6 4H3" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  asset: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
    </>
  ),
  banknote: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M7 12h.01M17 12h.01" />
    </>
  ),
  building2: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v8" />
      <path d="M18 9h2a2 2 0 0 1 2 2v11" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </>
  ),
  'circle-parking': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </>
  ),
  hospital: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <path d="M9 21v-6h6v6" />
      <path d="M12 7v4M10 9h4" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 22h18" />
      <path d="M6 18V10" />
      <path d="M10 18V10" />
      <path d="M14 18V10" />
      <path d="M18 18V10" />
      <path d="M4 10h16" />
      <path d="m12 2 8 4H4Z" />
    </>
  ),
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </>
  ),
  'square-pen': (
    <>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M4.8 2.3v4.2a4 4 0 0 0 8 0V2.3" />
      <path d="M8.8 10.5v3.7a4.8 4.8 0 0 0 9.6 0v-1.1" />
      <circle cx="18.4" cy="10.4" r="2.2" />
      <path d="M3 2h3" />
      <path d="M11.6 2h3" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 4-4 3 3 5-7" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  scan: (
    <>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M7 12h10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  transfer: (
    <>
      <path d="M16 3h5v5" />
      <path d="M21 3 14 10" />
      <path d="M8 21H3v-5" />
      <path d="m3 21 7-7" />
    </>
  ),
  document: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h5" />
    </>
  ),
  tag: (
    <>
      <path d="M20 13 13 20 4 11V4h7z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
  briefcase: (
    <>
      <path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1" />
      <rect x="4" y="6" width="16" height="13" rx="2" />
      <path d="M4 11h16" />
    </>
  ),
  supplier: (
    <>
      <path d="M4 20V8l5 3V8l5 3V6h6v14z" />
      <path d="M7 16h2M12 16h2M17 16h1" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  return: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 1 1 0 12h-2" />
    </>
  ),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  check: <path d="m20 6-11 11-5-5" />,
  'arrow-left': (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12A9 9 0 0 1 18.5 5.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  loader: <path d="M21 12a9 9 0 1 1-6.2-8.56" />,
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </>
  ),
  'calendar-clock': (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M12 14v3l2 1" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="m5.5 5.1-3.3 12A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.9-2.9l-3.3-12A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.1Z" />
    </>
  ),
  alert: (
    <>
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
    </>
  ),
  moon: <path d="M12 3a6 6 0 1 0 9 9 9 9 0 1 1-9-9Z" />,
  wand: (
    <>
      <path d="m15 4 5 5" />
      <path d="M13 6 3 16l5 5L18 11" />
      <path d="M6 2v4M4 4h4M20 16v4M18 18h4" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4-4 11-11a2.8 2.8 0 0 1 4 0l3 3a2.8 2.8 0 0 1 0 4l-8 8Z" />
      <path d="M22 21H7" />
      <path d="m5 15 5 5" />
    </>
  ),
  calculator: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M8 12h8M8 16h5" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  more: <path d="M12 12h.01M19 12h.01M5 12h.01" />,
  paperclip: <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l8.1-8.1" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  video: (
    <>
      <path d="M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
};

export function MenuIcon({ name, className = 'h-5 w-5' }: { name?: string; className?: string }) {
  if (!name || !ICON_PATHS[name]) {
    return <span className={className}>{name || '·'}</span>;
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

type LucideIconProps = Omit<React.SVGProps<SVGSVGElement>, 'name'> & {
  name: string;
  size?: number | string;
  strokeWidth?: number | string;
};

const LUCIDE_ICON_ALIASES: Record<string, string> = {
  AlertTriangle: 'alert',
  ArrowLeft: 'arrow-left',
  ArrowRight: 'arrow-right',
  Banknote: 'banknote',
  Bell: 'bell',
  Bookmark: 'tag',
  BookOpen: 'document',
  Box: 'inventory',
  Building2: 'building2',
  Calculator: 'calculator',
  Calendar: 'calendar',
  CalendarClock: 'calendar-clock',
  CalendarDays: 'calendar',
  Check: 'check',
  CheckSquare: 'check',
  ChevronLeft: 'arrow-left',
  CircleParking: 'circle-parking',
  ClipboardCheck: 'clipboard',
  ClipboardList: 'clipboard',
  Clock: 'history',
  Clock3: 'history',
  Copy: 'document',
  Download: 'download',
  Eraser: 'eraser',
  Eye: 'search',
  FileBarChart: 'analytics',
  FileCheck2: 'document',
  FileClock: 'document',
  FilePenLine: 'document',
  FileText: 'document',
  FileWarning: 'alert',
  FolderOpen: 'folder',
  Forward: 'arrow-right',
  History: 'history',
  Hospital: 'hospital',
  Hourglass: 'loader',
  Inbox: 'inbox',
  LoaderCircle: 'loader',
  Landmark: 'landmark',
  Lock: 'admin',
  LockKeyhole: 'admin',
  LogOut: 'return',
  Megaphone: 'bell',
  Menu: 'menu',
  MessageSquare: 'chat',
  MessageSquareReply: 'chat',
  Mic: 'mic',
  Moon: 'moon',
  MoreHorizontal: 'more',
  Package: 'inventory',
  Paperclip: 'paperclip',
  Pin: 'tag',
  Plus: 'plus',
  Printer: 'printer',
  Receipt: 'document',
  RefreshCw: 'refresh',
  Save: 'save',
  Search: 'search',
  Send: 'send',
  Server: 'server',
  Settings: 'admin',
  ShieldCheck: 'admin',
  SmilePlus: 'plus',
  SquarePen: 'square-pen',
  Star: 'tag',
  Stethoscope: 'stethoscope',
  Tag: 'tag',
  Tags: 'tag',
  Trash2: 'trash',
  TriangleAlert: 'alert',
  User: 'user',
  Users: 'users',
  Upload: 'send',
  Video: 'video',
  Wand2: 'wand',
  X: 'x',
};

export function LucideIcon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
  ...props
}: LucideIconProps) {
  const iconName = LUCIDE_ICON_ALIASES[name] || name;
  const iconPath = ICON_PATHS[iconName] || (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h6v6H9z" />
    </>
  );

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPath}
    </svg>
  );
}

type SidebarUser = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  company?: string | null;
  permissions?: Record<string, unknown> | null;
  department?: string | null;
  [key: string]: unknown;
};

function Sidebar({ user, mainMenu, onMenuChange }: { user?: SidebarUser | null; mainMenu?: string; onMenuChange: (menuId: string) => void }) {
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const visibleChatRoomsRef = useRef<ChatRoom[]>([]);
  const unreadRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentNotificationKeysRef = useRef<Map<string, number>>(new Map());
  const normalizedUser = useMemo(
    () => normalizeStaffLike((user ?? {}) as Record<string, unknown>) as SidebarUser,
    [user]
  );
  const [resolvedUser, setResolvedUser] = useState<SidebarUser | null>(() => {
    const directId = getStaffLikeId(normalizedUser as Record<string, unknown>);
    return directId ? normalizedUser : null;
  });
  const effectiveUser = (resolvedUser || normalizedUser) as SidebarUser;
  const effectiveUserId = getStaffLikeId(effectiveUser as Record<string, unknown>);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const syncUserIdentity = async () => {
      const directId = getStaffLikeId(normalizedUser as Record<string, unknown>);
      if (directId) {
        setResolvedUser(normalizedUser);
        return;
      }

      if (!normalizedUser?.name && !normalizedUser?.employee_no && !normalizedUser?.auth_user_id) {
        setResolvedUser(normalizedUser);
        return;
      }

      const recoveredUser = await resolveStaffLike(normalizedUser as Record<string, unknown>);
      if (!cancelled) {
        setResolvedUser(recoveredUser as SidebarUser);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [normalizedUser?.id, normalizedUser?.name, normalizedUser?.employee_no, normalizedUser?.auth_user_id]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncViewport);
      return () => {
        mediaQuery.removeEventListener('change', syncViewport);
      };
    }

    mediaQuery.addListener(syncViewport);
    return () => {
      mediaQuery.removeListener(syncViewport);
    };
  }, []);

  const visibleMenus = useMemo(
    () => MAIN_MENUS.filter((menu) => canAccessMainMenu(effectiveUser, menu.id)),
    [effectiveUser]
  );

  const readHiddenRoomIds = useCallback(() => {
    if (typeof window === 'undefined') return new Set<string>();

    try {
      const raw = window.localStorage.getItem(getRoomPrefsStorageKey(effectiveUserId));
      if (!raw) return new Set<string>();

      const parsed = JSON.parse(raw) as Record<string, { hidden?: boolean } | null | undefined>;
      return new Set(
        Object.entries(parsed || {})
          .filter(([, value]) => value?.hidden === true)
          .map(([roomId]) => String(roomId))
          .filter(Boolean)
      );
    } catch {
      return new Set<string>();
    }
  }, [effectiveUserId]);

  const readOpenConversationRoomIds = useCallback((rooms: any[]) => {
    if (typeof window === 'undefined') return new Set<string>();

    try {
      const activeRoomId = window.sessionStorage.getItem(CHAT_ACTIVE_ROOM_KEY);
      if (!activeRoomId) return new Set<string>();
      return getConversationRoomIdSet(activeRoomId, rooms);
    } catch {
      return new Set<string>();
    }
  }, []);

  const clearScheduledUnreadRefresh = useCallback(() => {
    if (unreadRefreshTimerRef.current) {
      clearTimeout(unreadRefreshTimerRef.current);
      unreadRefreshTimerRef.current = null;
    }
  }, []);

  const fetchChatUnreadCount = useCallback(async () => {
    if (!effectiveUserId) {
      visibleChatRoomsRef.current = [];
      setChatUnreadCount(0);
      return;
    }

    try {
      const { data: rooms, error: roomsError } = await supabase
        .from('chat_rooms')
        .select('id, members');

      if (roomsError) throw roomsError;

      const myRooms = ((rooms || []) as ChatRoom[]).filter((room) => {
        if (room.id === NOTICE_ROOM_ID) return true;
        return Array.isArray(room.members) && room.members.some((id) => String(id) === effectiveUserId);
      });

      const hiddenRoomIds = readHiddenRoomIds();
      const visibleRooms = myRooms.filter((room) => !hiddenRoomIds.has(String(room.id)));
      visibleChatRoomsRef.current = visibleRooms;

      if (visibleRooms.length === 0) {
        setChatUnreadCount(0);
        return;
      }

      const activeRoomId =
        typeof window !== 'undefined'
          ? window.sessionStorage.getItem(CHAT_ACTIVE_ROOM_KEY)
          : null;
      const counts = await fetchChatUnreadCountsByRoom(supabase, {
        rooms: visibleRooms,
        userId: effectiveUserId,
        activeRoomId,
        chunkSize: 8,
      });
      const totalUnread = Object.values(counts).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0,
      );

      setChatUnreadCount(totalUnread);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      if (errorMessage.includes('Failed to fetch')) {
        setChatUnreadCount(0);
        return;
      }
      console.error('메인 메뉴 채팅 안읽음 계산 실패:', error);
      setChatUnreadCount(0);
    }
  }, [effectiveUserId, readHiddenRoomIds]);

  const scheduleUnreadRefresh = useCallback((delayMs = 0) => {
    clearScheduledUnreadRefresh();
    if (delayMs <= 0) {
      void fetchChatUnreadCount();
      return;
    }

    unreadRefreshTimerRef.current = setTimeout(() => {
      unreadRefreshTimerRef.current = null;
      void fetchChatUnreadCount();
    }, delayMs);
  }, [clearScheduledUnreadRefresh, fetchChatUnreadCount]);

  useEffect(() => {
    scheduleUnreadRefresh();
    return () => {
      clearScheduledUnreadRefresh();
    };
  }, [clearScheduledUnreadRefresh, scheduleUnreadRefresh]);

  useEffect(() => {
    if (!effectiveUserId) return;

    const handleChatSync = () => {
      scheduleUnreadRefresh();
    };

    const handleChatNotification = (event: Event) => {
      const detail = (event as CustomEvent<{
        room_id?: string;
        message_id?: string;
        body?: string;
        data?: Record<string, unknown>;
      }>).detail;
      const roomId = String(detail?.room_id || detail?.data?.room_id || '').trim();

      if (!roomId) {
        scheduleUnreadRefresh();
        return;
      }

      if (readHiddenRoomIds().has(roomId)) {
        scheduleUnreadRefresh(200);
        return;
      }

      const openConversationRoomIds = readOpenConversationRoomIds(visibleChatRoomsRef.current);
      if (openConversationRoomIds.has(roomId)) {
        scheduleUnreadRefresh(200);
        return;
      }

      const now = Date.now();
      recentNotificationKeysRef.current.forEach((timestamp, key) => {
        if (now - timestamp > 10_000) {
          recentNotificationKeysRef.current.delete(key);
        }
      });

      const optimisticKey = String(
        detail?.message_id ||
        detail?.data?.message_id ||
        detail?.data?.id ||
        `${roomId}:${String(detail?.body || '').trim()}`
      ).trim();

      if (optimisticKey && recentNotificationKeysRef.current.has(optimisticKey)) {
        scheduleUnreadRefresh(200);
        return;
      }

      if (optimisticKey) {
        recentNotificationKeysRef.current.set(optimisticKey, now);
      }

      setChatUnreadCount((prev) => Math.max(1, prev + 1));
      scheduleUnreadRefresh(400);
    };

    // realtime 채널 대신 60초 fallback polling으로 대체 (채팅 내부 구독과 이중 방지)
    const pollTimer = window.setInterval(() => {
      if (document.hidden) return; // 비활성 탭이면 폴링 스킵
      scheduleUnreadRefresh(0);
    }, 60_000);

    if (typeof window !== 'undefined') {
      window.addEventListener('erp-chat-sync', handleChatSync);
      window.addEventListener('erp-chat-notification', handleChatNotification as EventListener);
      document.addEventListener('visibilitychange', handleChatSync);
    }

    return () => {
      window.clearInterval(pollTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('erp-chat-sync', handleChatSync);
        window.removeEventListener('erp-chat-notification', handleChatNotification as EventListener);
        document.removeEventListener('visibilitychange', handleChatSync);
      }
    };
  }, [
    effectiveUserId,
    readHiddenRoomIds,
    readOpenConversationRoomIds,
    scheduleUnreadRefresh,
  ]);

  const handleMenuClick = useCallback((menuId: string) => {
    if (menuId === '내정보' && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(MYPAGE_TAB_KEY);
      } catch {
        // ignore localStorage failures
      }
    }

    onMenuChange(menuId);
  }, [onMenuChange]);

  const shouldRenderDesktopNotificationCenter = Boolean(effectiveUserId) && isDesktopViewport !== false;
  const shouldRenderMobileNotificationCenter = Boolean(effectiveUserId) && isDesktopViewport === false;
  const userInitial = String(effectiveUser?.name || normalizedUser?.name || 'SY').trim().slice(0, 1).toUpperCase() || 'S';

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside
        className="app-shell-sidebar sticky top-0 z-[240] hidden h-[100dvh] w-[var(--sidebar-width)] shrink-0 flex-col items-center py-3 md:flex"
        data-testid="desktop-sidebar"
      >
        <div className="flex w-full shrink-0 flex-col items-center px-2">
          <button
            type="button"
            onClick={() => handleMenuClick('내정보')}
            className="app-shell-logo mb-5 flex h-11 w-11 items-center justify-center text-sm font-black transition-transform active:scale-95"
            aria-label="내정보"
          >
            SY
          </button>
          {shouldRenderDesktopNotificationCenter && (
              <NotificationCenter user={effectiveUser} onOpenMenu={onMenuChange} />
            )}
          <div className="app-shell-divider my-4" />
        </div>

        <div className="no-scrollbar flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
          {visibleMenus.map((menu) => {
            const isActive = mainMenu === menu.id;
            return (
              <button
                key={menu.id}
                type="button"
                data-testid={menu.testId}
                onClick={() => handleMenuClick(menu.id)}
                onMouseEnter={() => prefetchMenuModule(menu.id)}
                onFocus={() => prefetchMenuModule(menu.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`app-shell-menu-item relative flex min-h-[58px] w-14 flex-col items-center justify-center px-1.5 py-2 ${
                  isActive ? 'is-active' : ''
                }`}
              >
                <span className="relative leading-none">
                  <MenuIcon name={menu.icon} className="h-[22px] w-[22px]" />
                  {menu.id === '채팅' && chatUnreadCount > 0 && (
                    <span
                      data-testid="sidebar-menu-chat-badge"
                      className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/100 text-white text-[9px] font-bold flex items-center justify-center leading-none"
                    >
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 text-[10px] font-semibold leading-none tracking-normal">{menu.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex w-full shrink-0 flex-col items-center px-2 pt-3">
          <div className="app-shell-divider mb-3" />
          <button
            type="button"
            onClick={() => handleMenuClick('내정보')}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-light)] text-[11px] font-black text-[var(--accent)] transition-colors hover:bg-[var(--nav-active-subtle)]"
            aria-label="내정보 바로가기"
            title={String(effectiveUser?.name || '내정보')}
          >
            {userInitial}
          </button>
        </div>
      </aside>

      {/* 모바일 하단 탭바 */}
      <div
        className="mobile-bottom-tabbar safe-area-pb fixed bottom-0 left-0 right-0 z-[100] border-t border-[var(--border)] bg-[var(--card)] px-1.5 py-1 md:hidden"
        style={{ boxShadow: '0 -1px 0 var(--border)' }}
      >
        <nav className="flex items-stretch gap-1" data-testid="mobile-tabbar">
          <div className="no-scrollbar flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto">
            {visibleMenus.map((menu) => {
              const isActive = mainMenu === menu.id;
              return (
                <button
                  key={menu.id}
                  type="button"
                  data-testid={`${menu.testId}-mobile`}
                  onClick={() => handleMenuClick(menu.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-[56px] min-w-[64px] flex-none touch-manipulation flex-col items-center justify-center rounded-[var(--radius-md)] px-1 py-1.5 transition-all duration-150 ${
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'
                  }`}
                >
                  <span className="relative leading-none">
                    <MenuIcon name={menu.icon} className="h-[22px] w-[22px]" />
                    {menu.id === '채팅' && chatUnreadCount > 0 && (
                      <span
                        data-testid="sidebar-menu-chat-badge-mobile"
                        className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500/100 text-white text-[9px] font-bold flex items-center justify-center leading-none"
                      >
                        {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 w-full truncate text-center text-[11px] font-bold">{menu.label}</span>
                </button>
              );
            })}
          </div>
          {shouldRenderMobileNotificationCenter && (
            <div className="flex min-h-[56px] w-[56px] flex-none items-center justify-center rounded-[var(--radius-md)]">
              <NotificationCenter user={effectiveUser} onOpenMenu={onMenuChange} />
            </div>
          )}
        </nav>
      </div>
    </>
  );
}

export default React.memo(Sidebar);
