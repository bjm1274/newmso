'use client';

/**
 * 상세메뉴 — 게시글 상세 ⋯ 더보기 바텀시트(수정/읽음현황/삭제).
 * 게시판상세.tsx에서 분리 (JM 500줄 이내 유지). 권한 게이트는 호출 측에서 계산해 전달.
 * JM: 단일 책임(메뉴 표시), JM6(button 시맨틱)
 */

import MSheet from '../공통/MSheet';
import MIcon from '../공통/MIcon';

export type PostMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
  canSeeReadStatus: boolean;
  deleting: boolean;
  onEdit: () => void;
  onReadStatus: () => void;
  onDelete: () => void;
};

export default function PostMenuSheet({
  open,
  onClose,
  canEdit,
  canDelete,
  canSeeReadStatus,
  deleting,
  onEdit,
  onReadStatus,
  onDelete }: PostMenuSheetProps) {
  return (
    <MSheet open={open} onClose={onClose} title="게시글 메뉴">
      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {canEdit && (
          <button type="button" onClick={onEdit} className="m-list-row" style={{ width: '100%', textAlign: 'left' }}>
            <div className="ico-tile tone-accent"><MIcon name="edit" size={18} /></div>
            <div><div className="lbl">게시글 수정</div><div className="sub">제목·본문·첨부·투표 수정</div></div>
          </button>
        )}
        {canSeeReadStatus && (
          <button type="button" onClick={onReadStatus} className="m-list-row" style={{ width: '100%', textAlign: 'left' }}>
            <div className="ico-tile tone-success"><MIcon name="eye" size={18} /></div>
            <div><div className="lbl">읽음 현황</div><div className="sub">읽은/미확인 직원 보기</div></div>
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="m-list-row"
            style={{ width: '100%', textAlign: 'left', opacity: deleting ? 0.5 : 1 }}
          >
            <div className="ico-tile tone-danger"><MIcon name="trash" size={18} /></div>
            <div>
              <div className="lbl" style={{ color: 'var(--m-danger, #ef4444)' }}>게시글 삭제</div>
              <div className="sub">되돌릴 수 없습니다</div>
            </div>
          </button>
        )}
        {!canEdit && !canDelete && !canSeeReadStatus && (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 600 }}>
            사용 가능한 메뉴가 없습니다.
          </div>
        )}
      </div>
    </MSheet>
  );
}
