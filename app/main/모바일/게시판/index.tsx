'use client';

/**
 * 게시판 모바일 — 라우터.
 *   view 상태로 home → list ↔ detail ↔ write 전환.
 *   MobileShell이 tab === 'board' 일 때 마운트.
 *
 * Phase 6: 카테고리 홈('home') 뷰 추가 — 카테고리 목록에서 선택 후 필터된 리스트 진입.
 *
 * JM(단일 책임 — 분기·상태), JM2(필요한 시점에만 fetch), JM6(button 시맨틱)
 *
 * export default 함수명: 게시판
 */

import { useCallback, useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import { isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import SBoard from './게시판목록';
import SBoardDetail from './게시판상세';
import SFormPost from './글작성';
import {
  type BoardCatId,
  type BoardListPost,
  useBoardDetail,
  useBoardPosts,
} from './data-hooks';
import { useMyLikes } from './좋아요훅';

export type 게시판Props = {
  user: ErpUser;
  onBack: () => void;
};

type View = 'home' | 'list' | 'detail' | 'write';

export default function 게시판({ user, onBack }: 게시판Props) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const userName = typeof user.name === 'string' ? user.name : null;
  const userCompany = typeof user.company === 'string' ? user.company : null;
  const userCompanyId = typeof user.company_id === 'string' ? user.company_id : null;

  const [view, setView] = useState<View>('home');
  const [cat, setCat] = useState<BoardCatId>('all');
  const [postId, setPostId] = useState<string | null>(null);
  const [overridePosts, setOverridePosts] = useState<BoardListPost[] | null>(null);

  // 권한: 관리자 또는 시스템 마스터 → 고정·예약 옵션 노출
  const canAdmin = useMemo(() => isAdminUser(user) || isPrivilegedUser(user), [user]);

  const { posts: fetched, loading, refetch } = useBoardPosts(userId);
  const posts = overridePosts ?? fetched;

  const { likeSet, setLikeSet } = useMyLikes(userId);

  const detailUser = { id: userId, name: userName };
  const { post, comments, loading: detailLoading, addComment, refetchComments, patchPost } = useBoardDetail(
    view === 'detail' ? postId : null,
    detailUser,
  );

  const handleOpenCategory = useCallback((catId: BoardCatId) => {
    setCat(catId);
    setView('list');
  }, []);

  const handleOpen = useCallback((id: string) => {
    setPostId(id);
    setView('detail');
  }, []);

  const handleWrite = useCallback(() => {
    setView('write');
  }, []);

  const handleBackToHome = useCallback(() => {
    setView('home');
    setCat('all');
  }, []);

  const handleBackToList = useCallback(() => {
    setView('list');
    setPostId(null);
  }, []);

  const handleCreated = useCallback(
    (id: string) => {
      setPostId(id);
      setView('detail');
      void refetch();
    },
    [refetch],
  );

  const handleStarChanged = useCallback(
    (changedId: string, starred: boolean) => {
      const base = overridePosts ?? fetched;
      const next = base.map((p) =>
        String(p.id) === changedId ? { ...p, starred } : p,
      );
      setOverridePosts(next);
    },
    [fetched, overridePosts],
  );

  const handleLikedChange = useCallback(
    (changedId: string, liked: boolean, likesCount: number) => {
      // 내 좋아요 Set 업데이트
      setLikeSet((() => {
        const next = new Set(likeSet);
        if (liked) next.add(changedId);
        else next.delete(changedId);
        return next;
      })());
      // 리스트의 likes_count도 동기화
      const base = overridePosts ?? fetched;
      const updated = base.map((p) =>
        String(p.id) === changedId ? { ...p, likes_count: likesCount } : p,
      );
      setOverridePosts(updated);
    },
    [likeSet, setLikeSet, fetched, overridePosts],
  );

  if (view === 'write') {
    return (
      <SFormPost
        user={{ id: userId, name: userName, company: userCompany, company_id: userCompanyId }}
        canAdmin={canAdmin}
        initialCat={cat}
        onCancel={() => setView('list')}
        onCreated={handleCreated}
      />
    );
  }

  if (view === 'detail') {
    const currentIsLiked = postId ? likeSet.has(postId) : false;
    return (
      <SBoardDetail
        post={post}
        comments={comments}
        loading={detailLoading}
        onBack={handleBackToList}
        onAddComment={addComment}
        onRefetchComments={refetchComments}
        onPatchPost={patchPost}
        currentUserId={userId}
        currentUserName={userName}
        isLiked={currentIsLiked}
        onLikedChange={handleLikedChange}
      />
    );
  }

  return (
    <SBoard
      posts={posts}
      loading={loading}
      cat={cat}
      onCat={setCat}
      onOpen={handleOpen}
      onWrite={handleWrite}
      onBack={view === 'list' ? handleBackToHome : onBack}
      userId={userId}
      onStarChanged={handleStarChanged}
      onRefresh={refetch}
      showHome={view === 'home'}
      onOpenCategory={handleOpenCategory}
    />
  );
}
