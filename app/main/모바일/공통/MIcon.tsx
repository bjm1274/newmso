'use client';

/**
 * MIcon — 모바일 아이콘 래퍼.
 * handoff/m-components.jsx의 MIcon 이름 ↔ 프로젝트 LucideIcon 이름 매핑.
 * JM: 단일 책임 (alias map + 위임), ~80줄
 */

import { memo } from 'react';
import { LucideIcon } from '../../기능부품/조직도서브/조직도측면창';

const M_ICON_ALIAS: Record<string, string> = {
  bell: 'Bell',
  qr: 'QrCode',
  clock: 'Clock',
  check: 'Check',
  checkCircle: 'CheckCircle',
  checkSquare: 'CheckSquare',
  calendar: 'Calendar',
  won: 'CircleDollarSign',
  fileText: 'FileText',
  badge: 'BadgeCheck',
  star: 'Star',
  alertTri: 'AlertTriangle',
  approval: 'FileCheck',
  chat: 'MessageSquare',
  board: 'Layout',
  user: 'User',
  users: 'Users',
  search: 'Search',
  edit: 'edit',
  plus: 'Plus',
  send: 'Send',
  smile: 'Smile',
  pin: 'Pin',
  filter: 'Filter',
  moreV: 'MoreVertical',
  moreH: 'MoreHorizontal',
  chevL: 'ChevronLeft',
  chevR: 'ChevronRight',
  chevD: 'ChevronDown',
  chevU: 'ChevronUp',
  arrowL: 'ArrowLeft',
  arrowR: 'ArrowRight',
  mapPin: 'MapPin',
  paperclip: 'Paperclip',
  download: 'Download',
  upload: 'Upload',
  bookmark: 'Bookmark',
  share: 'Share2',
  home: 'Home',
  more: 'MoreHorizontal',
  out: 'LogOut',
  refresh: 'RefreshCw',
  camera: 'Camera',
  trash: 'Trash2',
  settings: 'Settings',
  shield: 'Shield',
  building: 'Building2',
  zap: 'Zap',
  layers: 'Layers',
  box: 'Box',
  receipt: 'Receipt',
  list: 'list',
  grid: 'LayoutGrid',
  info: 'Info',
  x: 'X',
  eye: 'Eye',
  stop: 'StopCircle',
  cameraOff: 'CameraOff',
  fileWarning: 'FileWarning',
  bot: 'Bot',
  heart: 'Heart',
  image: 'ImageIcon',
  reply: 'Reply',
  copy: 'Copy' };

export type MIconProps = {
  name: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
};

function MIconBase({ name, size = 16, strokeWidth = 2, color, className }: MIconProps) {
  const resolved = M_ICON_ALIAS[name] ?? name;
  return (
    <LucideIcon
      name={resolved}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={color ? { color } : undefined}
    />
  );
}

const MIcon = memo(MIconBase);
export default MIcon;
