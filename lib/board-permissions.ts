/**
 * 게시글 수정/삭제 판정 SSOT.
 *
 * 왜 이 파일이 생겼는가 — 같은 이름의 판정이 PC(`app/main/기능부품/게시판.tsx` 의
 * `canEditPost`/`canDeletePost`)와 모바일(`app/main/모바일/게시판/권한읽음.ts` 의
 * `canEditMobilePost`/`canDeleteMobilePost`)에 **import 가 아니라 '미러 구현'** 으로
 * 두 벌 있었고, 그 사이가 실제로 벌어져 있었다(8차 D09-016):
 *
 *   ① 관리자 판정이 달랐다. PC 수정은 `isDepartmentHead`(직위 팀장·과장·실장·부장·이사·
 *      원장·병원장 또는 mso 또는 role='admin')를 통과시키는데, 모바일 호출부는
 *      `isAdminUser(user) || isPrivilegedUser(user)` 만 넘겨줬다. 그래서 **부서장은
 *      PC 에서는 팀원 글을 수정할 수 있고 모바일에서는 못 했다.**
 *   ② 익명 글 처리가 달랐다. 모바일만 `is_anonymous` 면 작성자 본인도 막았다.
 *      작성자는 자기 글임을 알고 PC 에서는 수정할 수 있으므로 기기에 따라 결과가 갈렸다.
 *   ③ 삭제의 관리자 범위가 달랐다. PC 는 `isPrivilegedUser`(시스템 마스터)만,
 *      모바일은 `isAdminUser || isPrivilegedUser` 로 더 넓었다.
 *
 * 판정 자체는 PC 를 정본으로 삼는다(원본이고 운영 기준이다).
 *
 * ── 2차 정리(D09-016 잔여) ──────────────────────────────────────────────
 * 위 ①③ 은 판정 함수를 합쳐도 사라지지 않았다. **호출부가 넘기는 `isAdmin` 값 자체가
 * 갈라져 있었기 때문**이다. 모바일은 `isAdminUser(user) || isPrivilegedUser(user)` 하나를
 * 수정·삭제·댓글삭제에 전부 돌려썼고, PC 는 수정에 `isDepartmentHead`, 삭제에
 * `isPrivilegedUser` 를 따로 썼다. 합치기 전에 권한 조합별로 실제 결과를 재 봤다
 * (게시판 write 권한 보유 + 타인 글 기준. O=가능, .=불가):
 *
 *   사용자                     | PC수정 PC삭제 | 모바일수정 모바일삭제
 *   일반직원                    |   .     .    |    .        .
 *   부서장(팀장/과장…)           |   O     .    |    .        .     ← 수정 불일치
 *   role='admin'               |   O     .    |    O        O     ← 삭제 불일치
 *   permissions.admin=true     |   .     .    |    O        O     ← 수정·삭제 불일치
 *   permissions.mso=true       |   O     .    |    .        .     ← 수정 불일치
 *   시스템마스터(9999)           |   .     O    |    O        O     ← 수정 불일치
 *   (본인 글은 전 조합에서 양쪽 O O 로 동일했다)
 *
 * 여기서 두 가지를 정했다.
 *
 *  (가) **삭제 관리자 = `isPrivilegedUser` (시스템 마스터)만.** PC 그대로다.
 *       모바일이 `role='admin'`·`permissions.admin` 까지 삭제를 열어 두고 있었는데,
 *       삭제는 댓글·읽음까지 함께 날아가고 되돌릴 수 없다. **좁히는 방향**이라 안전하다.
 *       댓글 삭제도 PC(`게시판.tsx` handleDeleteComment)가 `isPrivilegedUser` 만
 *       허용하므로 같은 기준으로 맞춘다.
 *
 *  (나) **수정 권한 = 오직 작성자 본인(`isBoardPostAuthor`)만 가능.**
 *       - 과거에는 부서장 또는 시스템 마스터에게 타인 글 수정 권한이 열려 있었으나,
 *         타인이 작성한 글을 임의로 수정/위조할 수 있는 심각한 보안 및 신뢰성 문제가
 *         발생하여 **오직 작성자 본인만 수정 가능**하도록 전면 제한하였다.
 *       - 관리자나 부서장이라 하더라도 타인의 글을 임의로 수정할 수 없으며,
 *         오직 삭제(유해 게시글 조치 등)만 관리자 권한으로 가능하다.
 *
 * 두 계열을 내보낸다.
 *  - `canEditBoardPost` / `canDeleteBoardPost` : user 객체로 직접 판정하는 **정본**.
 *    PC·모바일 모두 최종적으로 이쪽을 써야 한다.
 *  - `...ByAdminFlag` : 관리자 여부를 이미 bool 로 들고 있는 기존 호출부용 어댑터.
 *    수정은 이제 관리자 플래그와 무관하게 작성자 본인만 통과한다.
 */
import { canAccessBoard, isPrivilegedUser } from '@/lib/access-control';

type UserLike = Parameters<typeof isPrivilegedUser>[0];

/** 부서장으로 간주하는 직위 — PC `게시판.tsx` 의 목록 그대로. */
const DEPARTMENT_HEAD_POSITIONS = ['팀장', '과장', '실장', '부장', '이사', '원장', '병원장'];

export type BoardPostLike =
  | {
      author_id?: unknown;
      board_type?: unknown;
    }
  | null
  | undefined;

/** 수정 권한의 '관리자' — 부서장 직위 또는 mso 또는 role='admin'. */
export function isBoardDepartmentHead(user: UserLike): boolean {
  if (!user) return false;
  const u = user as {
    position?: unknown;
    role?: unknown;
    permissions?: Record<string, unknown> | null;
  };
  const position = String(u.position ?? '');
  return (
    DEPARTMENT_HEAD_POSITIONS.some((p) => position.includes(p)) ||
    Boolean(u.permissions?.mso) ||
    u.role === 'admin'
  );
}

/**
 * 게시글 **수정** 판정에 넣을 관리자 bool (정본).
 * 부서장 또는 시스템 마스터. 호출부는 이 함수 결과만 `...ByAdminFlag` 에 넘겨야 한다.
 */
export function isBoardEditAdmin(user: UserLike): boolean {
  return isBoardDepartmentHead(user) || isPrivilegedUser(user);
}

/**
 * 게시글·댓글 **삭제** 판정에 넣을 관리자 bool (정본).
 * 시스템 마스터만 — 삭제는 댓글·읽음까지 함께 사라지고 되돌릴 수 없어 수정보다 좁게 둔다.
 */
export function isBoardDeleteAdmin(user: UserLike): boolean {
  return isPrivilegedUser(user);
}

/**
 * 작성자 본인 여부.
 * 게시판은 세션 id 와 다른 id(effectiveBoardUserId)를 쓰는 화면이 있어 user 객체가 아니라
 * 비교 대상 id 를 명시적으로 받는다.
 */
export function isBoardPostAuthor(post: BoardPostLike, userId: string | null | undefined): boolean {
  const authorId = String(post?.author_id ?? '').trim();
  const uid = String(userId ?? '').trim();
  return authorId !== '' && uid !== '' && authorId === uid;
}

/**
 * 게시글 수정 가능 — 오직 작성자 본인만 수정 가능.
 * 타인이 작성한 게시글을 관리자/부서장이 임의로 수정할 수 없도록 관리자 플래그 우회를 차단한다.
 */
export function canEditBoardPostByAdminFlag(
  post: BoardPostLike,
  userId: string | null | undefined,
  _isAdmin?: boolean,
): boolean {
  if (!post) return false;
  // 익명 글이라고 작성자를 막지 않는다 — 작성자는 자기 글임을 알고, PC 도 막지 않는다(위 ②).
  return isBoardPostAuthor(post, userId);
}

/** 게시글 삭제 가능 — 작성자 본인 또는 관리자. 수정보다 좁게 운용해야 한다(되돌릴 수 없다). */
export function canDeleteBoardPostByAdminFlag(
  post: BoardPostLike,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (!post) return false;
  return isBoardPostAuthor(post, userId) || isAdmin;
}

/** 댓글 삭제 가능 — 댓글 작성자 본인 또는 관리자. */
export function canDeleteBoardCommentByAdminFlag(
  commentAuthorId: string | null | undefined,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const a = String(commentAuthorId ?? '').trim();
  const uid = String(userId ?? '').trim();
  return a !== '' && uid !== '' && a === uid;
}

/**
 * 게시글 수정 가능 여부 (정본).
 * 게시판 쓰기 권한이 있더라도 타인이 작성한 글은 수정할 수 없으며,
 * 오직 작성자 본인만 수정할 수 있다.
 */
export function canEditBoardPost(
  user: UserLike,
  post: BoardPostLike,
  userId: string | null | undefined,
  boardType?: string | null,
): boolean {
  if (!user || !post) return false;
  const board = String(post?.board_type ?? '') || String(boardType ?? '');
  if (!canAccessBoard(user, board, 'write')) return false;
  return isBoardPostAuthor(post, userId);
}

/** 게시글 삭제 가능 여부 (정본). 삭제 관리자는 시스템 마스터로 좁다. */
export function canDeleteBoardPost(
  user: UserLike,
  post: BoardPostLike,
  userId: string | null | undefined,
  boardType?: string | null,
): boolean {
  if (!user || !post) return false;
  const board = String(post?.board_type ?? '') || String(boardType ?? '');
  if (!canAccessBoard(user, board, 'write')) return false;
  return canDeleteBoardPostByAdminFlag(post, userId, isBoardDeleteAdmin(user));
}
