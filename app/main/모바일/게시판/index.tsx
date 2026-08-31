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
import { canAccessBoard, isAdminUser, isPrivilegedUser } from '@/lib/access-control';
import { isBoardDeleteAdmin, isBoardEditAdmin } from '@/lib/board-permissions';
import SBoard from './게시판목록';
import SBoardDetail from './게시판상세';
import SFormPost from './글작성';
import {
  BOARD_CATS,
  type BoardCatId,
  type BoardListPost,
  boardTypeToCat,
  resolveBoardSubView,
  useBoardDetail,
  useBoardPosts } from './data-hooks';
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

  // 메인은 항상 게시글 리스트(전체 또는 카테고리). 카테고리 홈은 비사용.
  const [view, setView] = useState<View>(() => {
    if (initialPostId) return 'detail';
    return 'list';
  });
  const [cat, setCat] = useState<BoardCatId>(() => resolveBoardSubView(subView).cat);

  // Synchronize category when global subView changes (재조회 없음 — 칩 숫자 유지)
  useEffect(() => {
    const resolved = resolveBoardSubView(subView);
    setCat(resolved.cat);
    if (!initialPostId) {
      setView((v) => (v === 'detail' || v === 'write' ? v : 'list'));
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

  // 알림 딥링크: 알림탭이 sessionStorage에 저장한 postId 오픈
  useEffect(() => {
    try {
      const id = sessionStorage.getItem('mso_open_board_post');
      if (id) {
        sessionStorage.removeItem('mso_open_board_post');
        setPostId(id);
        setView('detail');
      }
    } catch {
      /* sessionStorage 불가 환경 무시 */
    }
  }, []);

  const [overridePosts, setOverridePosts] = useState<BoardListPost[] | null>(null);
  // 수정 모드 대상 게시글 (write 뷰에서 editPost로 전달)
  const [editPost, setEditPost] = useState<BoardListPost | null>(null);

  // 권한: 관리자 또는 시스템 마스터 → 고정·예약 옵션 노출.
  // 이 bool 은 '글 작성 옵션(고정/예약 발행)' 전용이다. 예전에는 이걸 수정·삭제 판정에도
  // 그대로 돌려썼고, 그래서 PC(수정=부서장 / 삭제=시스템마스터)와 결과가 갈라졌다(D09-016).
  // 수정·삭제는 아래 두 bool 을 쓴다 — 판정 기준은 lib/board-permissions 헤더 참고.
  const canAdmin = useMemo(() => isAdminUser(user) || isPrivilegedUser(user), [user]);
  /** 남의 글 수정 관리자 — 부서장 또는 시스템 마스터 (PC canEditPost 와 동일 기준) */
  const canAdminEditPost = useMemo(() => isBoardEditAdmin(user), [user]);
  /** 남의 글·댓글 삭제 관리자 — 시스템 마스터만 (PC canDeletePost 와 동일 기준) */
  const canAdminDeletePost = useMemo(() => isBoardDeleteAdmin(user), [user]);

  // 보드별 읽기 권한 — PC canAccessBoard 패리티
  const readableBoardTypes = useMemo(() => {
    return BOARD_CATS
      .map((c) => c.boardType)
      .filter((bt): bt is string => {
        if (!bt) return false;
        return canAccessBoard(user, bt, 'read');
      });
  }, [user]);

  const canReadCat = useCallback(
    (catId: BoardCatId) => {
      if (catId === 'all') return readableBoardTypes.length > 0;
      const def = BOARD_CATS.find((c) => c.id === catId);
      if (!def?.boardType) return false;
      return canAccessBoard(user, def.boardType, 'read');
    },
    [user, readableBoardTypes],
  );

  // 현재 카테고리 쓰기 권한 (전체면 하나라도 write 가능하면 작성 버튼 노출)
  const canWrite = useMemo(() => {
    if (cat === 'all') {
      return BOARD_CATS.some(
        (c) => c.boardType && canAccessBoard(user, c.boardType, 'write'),
      );
    }
    const def = BOARD_CATS.find((c) => c.id === cat);
    return Boolean(def?.boardType && canAccessBoard(user, def.boardType, 'write'));
  }, [user, cat]);

  // 항상 전체 보드 로드 → 칩 카운트 안정. 카테고리 전환은 클라이언트 필터.
  // company 필터로 타사 게시글 차단.
  const { posts: fetched, loading, refetch: refetchPosts, loadMore, hasMore } = useBoardPosts(userId, userCompany);
  const posts = useMemo(() => {
    const base = overridePosts ?? fetched;
    // 읽기 권한 없는 보드 타입 제거
    return base.filter((p) => {
      const bt = String(p.board_type ?? '').trim();
      if (!bt) return false;
      return canAccessBoard(user, bt, 'read');
    });
  }, [overridePosts, fetched, user]);

  // 현재 cat에 읽기 권한이 없으면 접근 가능한 첫 보드로 폴백
  useEffect(() => {
    if (!canReadCat(cat)) {
      const fallback =
        BOARD_CATS.find((c) => c.id !== 'all' && c.boardType && canAccessBoard(user, c.boardType, 'read'))?.id
        ?? 'notice';
      setCat(fallback as BoardCatId);
    }
  }, [cat, canReadCat, user]);

  const refetch = useCallback(async () => {
    setOverridePosts(null);
    await refetchPosts();
  }, [refetchPosts]);

  const { likeSet, setLikeSet } = useMyLikes(userId);

  const detailUser = { id: userId, name: userName };
  const { post, comments, loading: detailLoading, addComment, refetchComments, patchPost } = useBoardDetail(
    view === 'detail' ? postId : null,
    detailUser,
  );

  const handleOpenCategory = useCallback((catId: BoardCatId) => {
    setCat(catId);
    // override 유지 불필요 — 카테고리 전환은 서버 재조회 없이 필터만
    setView('list');
  }, []);

  const handleOpen = useCallback((id: string) => {
    setPostId(id);
    setView('detail');
  }, []);

  const handleWrite = useCallback(() => {
    if (!canWrite) return;
    setEditPost(null);
    setView('write');
  }, [canWrite]);

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

  const handleBackToList = useCallback(() => {
    setView('list');
    setPostId(null);
    setCat((c) => c || 'notice');
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

  // 읽기 권한 보드가 하나도 없으면 차단
  if (readableBoardTypes.length === 0) {
    contentElement = (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 8,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--z-900)' }}>
          게시판 접근 권한이 없습니다
        </div>
        <div style={{ fontSize: 13, color: 'var(--z-500)', fontWeight: 600 }}>
          메인 메뉴 권한과 게시판 읽기 권한을 확인해 주세요.
        </div>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: 12,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.08)',
            background: 'rgba(255,255,255,0.8)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          돌아가기
        </button>
      </div>
    );
  } else if (view === 'write') {
    const editBoardType = editPost ? String(editPost.board_type ?? '') : '';
    // 수정 화면 진입 게이트. 예전에는 `|| canAdmin`(=isAdminUser||isPrivilegedUser)이라
    // 게시판 write 권한이 없는 범용 admin 도 수정 화면을 열 수 있었다. 상세의 canEdit 은
    // 이제 write 권한을 요구하므로 여기만 더 넓으면 무의미하게 어긋난다(D09-016).
    const canWriteEdit = editPost
      ? canAccessBoard(user, editBoardType || '자유게시판', 'write') || canAdminEditPost
      : canWrite;
    if (canWriteEdit) {
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
    } else {
      // write 권한 없으면 목록으로 폴백
      contentElement = (
        <SBoard
          posts={posts}
          loading={loading}
          cat={cat}
          onCat={setCat}
          onOpen={handleOpen}
          onWrite={handleWrite}
          onBack={onBack}
          userId={userId}
          onStarChanged={handleStarChanged}
          onRefresh={refetch}
        onLoadMore={loadMore}
        hasMore={hasMore}
          showHome={false}
          onOpenCategory={handleOpenCategory}
          company={userCompany ?? ''}
          canWrite={false}
          readableCats={readableBoardTypes.map((bt) => boardTypeToCat(bt))}
        />
      );
    }
  } else if (view === 'detail') {
    const currentIsLiked = postId ? likeSet.has(postId) : false;
    const detailBoardType = post ? String(post.board_type ?? '') : '';
    const canWriteDetail = detailBoardType
      ? canAccessBoard(user, detailBoardType, 'write')
      : false;
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
        canAdminEdit={canAdminEditPost}
        canAdminDelete={canAdminDeletePost}
        canWriteBoard={canWriteDetail}
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
        onBack={onBack}
        userId={userId}
        onStarChanged={handleStarChanged}
        onRefresh={refetch}
        onLoadMore={loadMore}
        hasMore={hasMore}
        showHome={false}
        onOpenCategory={handleOpenCategory}
        company={userCompany ?? ''}
        canWrite={canWrite}
        readableCats={readableBoardTypes.map((bt) => boardTypeToCat(bt))}
      />
    );
  }

  return (
    <div
      data-testid="board-view"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(145deg, #f3ecfc 0%, #f6f0fd 30%, #ecf5fc 70%, #ecfaf4 100%)' }}
    >
      {contentElement}
    </div>
  );
}

export default MobileBoard;
