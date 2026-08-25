'use client';

/**
 * 모바일 채팅 — 대화방 상세 시트.
 *
 * 채팅방.tsx 가 1971줄이라 500줄 규칙을 한참 넘겼다. 이 시트는 상태를 갖지
 * 않는 표시 전용 블록이라 같은 폴더의 분리 관행(채팅방.tsx → 버블리스트.tsx)을
 * 따라 통째로 떼어낸다. 로직은 그대로 두고 위치만 옮긴 변경이다.
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM4(any 금지), JM6(button/aria).
 */

import type { ChatMessage, ChatRoom } from '@/types';
import MSheet from '../공통/MSheet';
import MAvatar from '../공통/MAvatar';
import MIcon from '../공통/MIcon';
import type { MAvatarTone } from '../공통/MAvatar';
import { getGroupChatRoomBadgeText } from '@/app/main/기능부품/메신저유틸';
import { buildStorageInlineUrl, buildStorageDownloadUrl, triggerManagedBrowserDownload } from '@/lib/object-storage-url';
import { toast } from '@/lib/toast';
import { pickAvatarTone, type StaffDirectoryEntry } from './data-hooks';
import type { RoomNotice } from './공지훅';

export type RoomInfoSheetProps = {
  open: boolean;
  onClose: () => void;
  room: ChatRoom;
  userId: string | null;
  title: string;
  headerTone: MAvatarTone;
  isGroup: boolean;
  isNotice: boolean;
  peerName: string;
  peerPhotoUrl: string | null | undefined;
  memberProfiles: StaffDirectoryEntry[];
  notice: RoomNotice | null;
  onJumpToMessage: (messageId: string) => void;
  /** 사진·파일 그리드 펼침 상태 (퀵액션이 토글) */
  filesOpen: boolean;
  onToggleFiles: () => void;
  attachments: ChatMessage[];
  attachmentsLoading: boolean;
  roomNotifyOn: boolean;
  onToggleRoomNotify: () => void;
  canRenameRoom: boolean;
  onRenameStart: () => void;
  canManageMembers: boolean;
  onAddMember: () => void;
  onRemoveMember: (member: StaffDirectoryEntry) => void;
  memberMutating: boolean;
  canLeaveRoom: boolean;
  onLeave: () => void;
  onOpenPollComposer: () => void;
};

export default function RoomInfoSheet({
  open,
  onClose,
  room,
  userId,
  title,
  headerTone,
  isGroup,
  isNotice,
  peerName,
  peerPhotoUrl,
  memberProfiles,
  notice,
  onJumpToMessage,
  filesOpen,
  onToggleFiles,
  attachments,
  attachmentsLoading,
  roomNotifyOn,
  onToggleRoomNotify,
  canRenameRoom,
  onRenameStart,
  canManageMembers,
  onAddMember,
  onRemoveMember,
  memberMutating,
  canLeaveRoom,
  onLeave,
  onOpenPollComposer }: RoomInfoSheetProps) {
  return (
    <MSheet open={open} onClose={onClose} title="대화방 상세 정보">
      <div style={{
        padding: '8px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: 'var(--m-card)',
        borderTop: '1px solid var(--m-border)' }}>
        {/*
          아이덴티티 블록 — 예전에는 방 이름이 회색 상자 안 한 줄이라 어느 방의
          설정인지 눈에 들어오지 않았다. 아바타를 세워 방을 먼저 알아보게 한다.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MAvatar tone={headerTone} size="lg">
            {isNotice ? (
              <MIcon name="bell" size={22} color="#fff" />
            ) : peerPhotoUrl ? (
              <img src={peerPhotoUrl} alt={peerName || title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
            ) : isGroup ? (
              <span>{getGroupChatRoomBadgeText(title)}</span>
            ) : (
              <span>{title.charAt(0) || '방'}</span>
            )}
          </MAvatar>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--z-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--z-500)', marginTop: 2, fontWeight: 600 }}>
              {isGroup ? '그룹 대화방' : '1:1 대화방'} · 참여자 {memberProfiles.length}명
            </div>
          </div>
          {canRenameRoom && (
            <button
              type="button"
              aria-label="채팅방 이름 수정"
              onClick={onRenameStart}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                height: 32,
                padding: '0 11px',
                borderRadius: 10,
                background: 'var(--z-100)',
                color: 'var(--z-700)',
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer' }}
            >
              <MIcon name="edit" size={13} />
              이름
            </button>
          )}
        </div>

        {/*
          퀵액션 행. 사진·파일은 아래 그리드를 접었다 편다.
          지시서는 4열(대화 검색/사진·파일/투표/북마크)이지만 모바일에는 대화
          검색·방 단위 북마크 화면이 없어 3열로 줄였다. 알림은 아래 토글 행이
          이미 켜짐/꺼짐을 보여주므로 여기 넣지 않았다.
        */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {([
            { key: 'files', icon: 'image', label: '사진·파일', onPress: onToggleFiles, disabled: false },
            { key: 'poll', icon: 'list', label: '투표', onPress: onOpenPollComposer, disabled: false },
            { key: 'member', icon: 'users', label: '참여자 추가', onPress: onAddMember, disabled: !canManageMembers },
          ] as const).map((action) => (
            <button
              key={action.key}
              type="button"
              aria-label={action.label}
              disabled={action.disabled}
              onClick={action.onPress}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '12px 4px',
                borderRadius: 12,
                background: 'var(--z-100)',
                color: action.disabled ? 'var(--z-400)' : 'var(--z-700)',
                border: 'none',
                fontSize: 11,
                fontWeight: 700,
                cursor: action.disabled ? 'not-allowed' : 'pointer',
                opacity: action.disabled ? 0.55 : 1 }}
            >
              <MIcon name={action.icon} size={20} color={action.disabled ? 'var(--z-400)' : 'var(--m-accent)'} />
              {action.label}
            </button>
          ))}
        </div>

        {/* Section 2: 알림 설정 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>대화방 알림 수신</div>
            <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 2 }}>새 메시지 알림을 받습니다.</div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={roomNotifyOn}
              onChange={onToggleRoomNotify}
              aria-label="대화방 알림 수신"
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: 24,
              background: roomNotifyOn ? 'var(--m-accent)' : 'rgba(0, 0, 0, 0.15)', transition: '0.2s' }}>
              <span style={{
                position: 'absolute', left: 4, bottom: 4, width: 16, height: 16,
                borderRadius: '50%', background: '#fff', transition: '0.2s',
                transform: roomNotifyOn ? 'translateX(20px)' : 'translateX(0)' }} />
            </span>
          </label>
        </div>

        <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

        {/* Section 3: 상단 공지 — pinned_messages 를 실제로 읽는다 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <MIcon name="pin" size={13} color="var(--z-600)" />
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)' }}>상단 공지</div>
          </div>
          {notice ? (
            <button
              type="button"
              onClick={() => onJumpToMessage(notice.messageId)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'var(--m-accent-soft)',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer' }}
            >
              <div style={{ fontSize: 12.5, color: 'var(--z-900)', fontWeight: 700, lineHeight: 1.5 }}>{notice.text}</div>
              {notice.senderName && (
                <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 3, fontWeight: 600 }}>{notice.senderName}</div>
              )}
            </button>
          ) : (
            <div style={{ padding: '10px 12px', background: 'var(--z-100)', borderRadius: 10, fontSize: 12, color: 'var(--z-500)', fontWeight: 600 }}>
              등록된 대화방 공지가 없습니다.
            </div>
          )}
        </div>

        <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

        {/* Section 4: 참여자 목록 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>참여자 ({memberProfiles.length}명)</div>
            {canManageMembers && (
              <button
                type="button"
                aria-label="참여자 추가"
                onClick={onAddMember}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '5px 10px',
                  borderRadius: 8,
                  background: 'var(--m-accent-soft)',
                  color: 'var(--m-accent)',
                  fontSize: 11,
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer' }}
              >
                <MIcon name="plus" size={13} />
                추가
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto' }} className="custom-scrollbar">
            {memberProfiles.map((member) => {
              const tone = pickAvatarTone(String(member.id) + member.name);
              const isMe = String(member.id) === String(userId);
              const photoUrl = member.photo_url || member.avatar_url;
              return (
                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MAvatar tone={tone} size="sm">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={member.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                      />
                    ) : (
                      <span>{member.name.charAt(0)}</span>
                    )}
                  </MAvatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>
                      {member.name}
                      {isMe && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--m-accent-soft)', color: 'var(--m-accent)', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>나</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 2 }}>
                      {member.department || '부서 없음'} · {member.position || '직급 없음'}
                    </div>
                  </div>
                  {canManageMembers && !isMe && (
                    <button
                      type="button"
                      aria-label={`${member.name} 참여자 제외`}
                      onClick={() => onRemoveMember(member)}
                      disabled={memberMutating}
                      style={{
                        flexShrink: 0,
                        width: 30,
                        height: 30,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 8,
                        background: 'transparent',
                        color: 'var(--m-danger, #ef4444)',
                        border: 'none',
                        cursor: memberMutating ? 'not-allowed' : 'pointer' }}
                    >
                      <MIcon name="trash" size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.05)' }} />

        {/* Section 5: 공유된 사진 및 파일 — 기본은 접어 두고 퀵액션으로 편다 */}
        {filesOpen && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--z-600)', marginBottom: 10 }}>공유된 사진 및 파일 ({attachments.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {attachments.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--z-400)', fontWeight: 600 }}>
                {/* 아직 불러오는 중인데 "없다" 고 단정하지 않는다 — 예전에는 로드된
                    메시지 20개만 보고 없다고 말해서 있는 파일도 없는 것처럼 보였다. */}
                {attachmentsLoading ? '불러오는 중…' : '첨부된 항목이 없습니다.'}
              </div>
            )}
            {attachments.slice(0, 9).map((att) => (
              <div key={att.id} style={{ aspectRatio: 1, borderRadius: 8, background: 'var(--z-100)', border: '1px solid var(--m-border)', overflow: 'hidden', position: 'relative' }}>
                {/* file_url 은 공개 R2 도메인이라 401 이 난다 — 인증 프록시 URL 로 변환해서 쓴다. */}
                {/\.(png|jpg|jpeg|gif|webp|bmp|heic|heif|avif)(\?|$)/i.test(att.file_url!) ? (
                  <img src={buildStorageInlineUrl(att.file_url!, att.file_name || '첨부')} alt="첨부" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => window.open(buildStorageInlineUrl(att.file_url!, att.file_name || '첨부'), '_blank')} />
                ) : (
                  <div
                    onClick={async () => {
                      const name = att.file_name || '파일';
                      const dlUrl = buildStorageDownloadUrl(att.file_url!, name);
                      try {
                        await triggerManagedBrowserDownload(dlUrl, name);
                      } catch {
                        window.open(dlUrl, '_blank');
                      }
                    }}
                    style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--m-accent)', cursor: 'pointer' }}
                  >
                    <MIcon name="file" size={24} />
                    <span style={{ fontSize: 9, marginTop: 4, width: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{att.file_name || '파일'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        <div style={{ height: 1, background: 'var(--m-border)' }} />

        {/* Section 6: 방 나가기 — 되돌릴 수 없는 동작이라 위험 톤으로 */}
        <button
          type="button"
          onClick={onLeave}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 10,
            background: canLeaveRoom ? 'var(--m-danger-soft)' : 'var(--z-100)',
            color: canLeaveRoom ? 'var(--m-danger)' : 'var(--z-700)',
            fontSize: 13,
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            textAlign: 'center' }}
        >
          {canLeaveRoom ? '채팅방 나가기' : '목록으로'}
        </button>
      </div>
    </MSheet>
  );
}
