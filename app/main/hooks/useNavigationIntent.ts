'use client';

import { useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface NavigationIntent {
  openChatRoom: string | null;
  openMessage: string | null;
  openMenu: string | null;
  openSubView: string | null;
  openMyPageTab: string | null;
  openPost: string | null;
  openBoard: string | null;
  openApprovalId: string | null;
  openInventoryView: string | null;
  openInventoryApproval: string | null;
  shareId: string | null;
  shareFileCount: number;
  shareText: string | null;
  shareUrl: string | null;
  shareTitle: string | null;
}

export function useNavigationIntent(): {
  navigationIntent: NavigationIntent;
  clearNavigationQuery: () => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigationIntent = useMemo<NavigationIntent>(
    () => ({
      openChatRoom: searchParams.get('open_chat_room')?.trim() || null,
      openMessage: searchParams.get('open_msg')?.trim() || null,
      openMenu: searchParams.get('open_menu')?.trim() || null,
      openSubView: searchParams.get('open_subview')?.trim() || null,
      openMyPageTab: searchParams.get('open_mypage_tab')?.trim() || null,
      openPost: searchParams.get('open_post')?.trim() || null,
      openBoard: searchParams.get('open_board')?.trim() || null,
      openApprovalId: searchParams.get('open_approval_id')?.trim() || null,
      openInventoryView: searchParams.get('open_inventory_view')?.trim() || null,
      openInventoryApproval: searchParams.get('open_inventory_approval')?.trim() || null,
      shareId: searchParams.get('share_id')?.trim() || null,
      shareFileCount: Number(searchParams.get('share_file_count') || '0'),
      shareText: searchParams.get('share_text')?.trim() || null,
      shareUrl: searchParams.get('share_url')?.trim() || null,
      shareTitle: searchParams.get('share_title')?.trim() || null,
    }),
    [searchParams]
  );

  const clearNavigationQuery = useCallback(() => {
    router.replace('/main', { scroll: false });
  }, [router]);

  return { navigationIntent, clearNavigationQuery };
}
