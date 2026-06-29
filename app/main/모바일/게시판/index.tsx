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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ErpUser } from '@/types';
import { isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import SBoard from './게시판목록';
import SBoardDetail from './게시판상세';
import SFormPost from './글작성';
import {
  type BoardCatId,
  type BoardListPost,
  BOARD_CATS,
  boardTypeToCat,
  useBoardDetail,
  useBoardPosts,
} from './data-hooks';
import { useMyLikes } from './좋아요훅';

export type 게시판Props = {
  user: ErpUser;
  onBack: () => void;
  subView?: string | null;
  setSubView?: (v: string | null) => void;
  initialPostId?: string | null;
  onConsumePostId?: () => void;
};

type View = 'home' | 'list' | 'detail' | 'write';

function MobileBoard({ user, onBack, subView, setSubView, initialPostId, onConsumePostId }: 게시판Props) {
  const userId = typeof user.id === 'string' ? user.id : null;
  const userName = typeof user.name === 'string' ? user.name : null;
  const userCompany = typeof user.company === 'string' ? user.company : null;
  const userCompanyId = typeof user.company_id === 'string' ? user.company_id : null;

  const [view, setView] = useState<View>(() => {
    if (initialPostId) return 'detail';
    if (subView) return 'list';
    return 'home';
  });
  const [cat, setCat] = useState<BoardCatId>(() => {
    if (subView) {
      const isCatId = BOARD_CATS.some((c) => c.id === subView);
      return isCatId ? (subView as BoardCatId) : boardTypeToCat(subView);
    }
    return 'all';
  });

  // Synchronize category and view when global subView changes
  useEffect(() => {
    if (subView) {
      const isCatId = BOARD_CATS.some((c) => c.id === subView);
      setCat(isCatId ? (subView as BoardCatId) : boardTypeToCat(subView));
      if (!initialPostId) {
        setView('list');
      }
    }
  }, [subView, initialPostId]);
  const [postId, setPostId] = useState<string | null>(initialPostId || null);

  // Synchronize postId when initialPostId changes (e.g. push notification click while already on the board tab)
  useEffect(() => {
    if (initialPostId) {
      setPostId(initialPostId);
      setView('detail');
      onConsumePostId?.();
    }
  }, [initialPostId, onConsumePostId]);

  const [overridePosts, setOverridePosts] = useState<BoardListPost[] | null>(null);
  // 수정 모드 대상 게시글 (write 뷰에서 editPost로 전달)
  const [editPost, setEditPost] = useState<BoardListPost | null>(null);

  // 권한: 관리자 또는 시스템 마스터 → 고정·예약 옵션 노출
  const canAdmin = useMemo(() => isAdminUser(user) || isPrivilegedUser(user), [user]);

  const { posts: fetched, loading, refetch } = useBoardPosts(userId, userCompany);
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
    setEditPost(null);
    setView('write');
  }, []);

  // 상세 ⋯ → 수정 모드 (글작성 EDIT)
  const handleEdit = useCallback((p: BoardListPost) => {
    setEditPost(p);
    setView('write');
  }, []);

  // 상세 삭제 완료 → 목록 복귀 + refetch (낙관적 제거 포함)
  const handleDeleted = useCallback(
    (deletedId: string) => {
      setOverridePosts((prev) => {
        const base = prev ?? fetched;
        return base.filter((p) => String(p.id) !== deletedId);
      });
      setPostId(null);
      setView('list');
      void refetch();
    },
    [fetched, refetch],
  );

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
      setEditPost(null);
      if (id && id !== 'queued') {
        setPostId(id);
        setView('detail');
      } else {
        setView('list');
      }
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

  let contentElement: React.ReactNode;

  if (view === 'write') {
    contentElement = (
      <SFormPost
        user={{ id: userId, name: userName, company: userCompany, company_id: userCompanyId }}
        canAdmin={canAdmin}
        initialCat={cat}
        editPost={editPost}
        onCancel={() => {
          setEditPost(null);
          setView(editPost ? 'detail' : 'list');
        }}
        onCreated={handleCreated}
      />
    );
  } else if (view === 'detail') {
    const currentIsLiked = postId ? likeSet.has(postId) : false;
    contentElement = (
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
        canAdmin={canAdmin}
        isLiked={currentIsLiked}
        onLikedChange={handleLikedChange}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
      />
    );
  } else {
    contentElement = (
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
        company={userCompany ?? ''}
      />
    );
  }

  return (
    <div data-testid="board-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {contentElement}
    </div>
  );
}

export default MobileBoard;
