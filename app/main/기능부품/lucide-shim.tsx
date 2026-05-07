'use client';

import type { SVGProps } from 'react';
import { LucideIcon } from './조직도서브/조직도측면창';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  size?: number | string;
  strokeWidth?: number | string;
};

function createIcon(name: string) {
  const Icon = ({ size = 24, strokeWidth = 2, ...props }: IconProps) => (
    <LucideIcon name={name} size={size} strokeWidth={strokeWidth} {...props} />
  );
  Icon.displayName = name;
  return Icon;
}

export const Bell = createIcon('Bell');
export const Bookmark = createIcon('Bookmark');
export const CalendarDays = createIcon('CalendarDays');
export const ChevronLeft = createIcon('ChevronLeft');
export const ClipboardList = createIcon('ClipboardList');
export const Copy = createIcon('Copy');
export const Eye = createIcon('Eye');
export const Forward = createIcon('Forward');
export const Megaphone = createIcon('Megaphone');
export const Menu = createIcon('Menu');
export const MessageSquare = createIcon('MessageSquare');
export const MessageSquareReply = createIcon('MessageSquareReply');
export const MoreHorizontal = createIcon('MoreHorizontal');
export const Paperclip = createIcon('Paperclip');
export const Search = createIcon('Search');
export const Send = createIcon('Send');
export const SmilePlus = createIcon('SmilePlus');
export const Trash2 = createIcon('Trash2');
export const Video = createIcon('Video');
export const X = createIcon('X');
