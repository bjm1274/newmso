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
 *  (나) **수정 관리자 = 부서장(`isBoardDepartmentHead`) 또는 시스템 마스터.**
 *       - 부서장을 넣은 건 PC 운영 기준 복원이다. 표의 2·5행처럼 부서장이 PC 에서는
 *         팀원 글을 고칠 수 있는데 모바일에서만 못 했다. 모바일 기준으로는 **넓히는**
 *         변경이지만, 새 권한을 만든 게 아니라 이미 PC 에서 매일 쓰던 권한을 같은
 *         사람에게 기기와 무관하게 준 것이다.
 *       - 시스템 마스터를 넣은 건 PC 쪽 비대칭을 고친 것이라 **PC 기준으로도 넓힌다**.
 *         표 6행을 보면 시스템 마스터는 남의 글을 **삭제는 되는데 수정은 못 했다**.
 *         더 파괴적인 권한이 이미 열려 있는데 덜 파괴적인 권한만 막혀 있는 건 보호가
 *         아니라 사고 유발이다(고칠 수 없으니 지우게 된다). 새로 노출되는 대상은
 *         전권 계정 하나뿐이라 확대 위험도 없다.
 *       - 반대로 `permissions.admin=true` 만 가진 사용자(표 4행)는 **제외**했다.
 *         모바일 기준으로는 좁히는 변경이다. `admin` 은 게시판과 무관한 범용 관리자
 *         플래그이고, PC 는 이 사용자에게 남의 글 수정을 허용한 적이 없다.
 *         (`role='admin'` 은 부서장 판정에 이미 포함되어 그대로 통과한다.)
 *
 * 두 계열을 내보낸다.
 *  - `canEditBoardPost` / `canDeleteBoardPost` : user 객체로 직접 판정하는 **정본**.
 *    PC·모바일 모두 최종적으로 이쪽을 써야 한다.
 *  - `...ByAdminFlag` : 관리자 여부를 이미 bool 로 들고 있는 기존 호출부용 어댑터.
 *    이 bool 은 반드시 `isBoardEditAdmin` / `isBoardDeleteAdmin` 으로 만들어야 한다.
 *    아무 관리자 bool 이나 넣을 수 있게 열어 둔 것이 이번 재발의 원인이었다.
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

/** 게시글 수정 가능 — 작성자 본인 또는 부서장 이상. 관리자 여부를 bool 로 받는 어댑터. */
export function canEditBoardPostByAdminFlag(
  post: BoardPostLike,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (!post) return false;
  // 익명 글이라고 작성자를 막지 않는다 — 작성자는 자기 글임을 알고, PC 도 막지 않는다(위 ②).
  return isBoardPostAuthor(post, userId) || isAdmin;
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
 * 게시판 쓰기 권한이 없으면 무조건 false — 호출부가 게이트를 빠뜨려도 결과가 같도록 여기서도 본다.
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
  return canEditBoardPostByAdminFlag(post, userId, isBoardEditAdmin(user));
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
