'use client';

/**
 * 모바일 채팅 — 메시지 수정 + 메시지 액션(수정/스레드/반응상세/읽음상세) 바텀시트.
 * PC 메신저수정모달.MessageEditModal 미러(messages.content + edited_at).
 *
 * 제약: JM(단일 책임 + 500줄 이내), JM4(any 금지), JM6(button/label + aria).
 */

import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/types';
import MSheet from '../공통/MSheet';

export type MessageEditSheetProps = {
  message: ChatMessage | null;
  saving: boolean;
  onClose: () => void;
  onSave: (message: ChatMessage, content: string) => void;
};

export function MessageEditSheet({ message, saving, onClose, onSave }: MessageEditSheetProps) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (message) {
      setDraft(typeof message.content === 'string' ? message.content : '');
    }
  }, [message]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <MSheet open={!!message} onClose={handleClose} title="메시지 수정">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 600, lineHeight: 1.5 }}>
          전송한 메시지를 수정하면 모든 참여자에게 바로 반영됩니다.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          aria-label="수정할 메시지"
          placeholder="수정할 메시지를 입력해 주세요"
          disabled={saving}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: 14,
            fontFamily: 'inherit',
            background: 'var(--m-bg)',
            border: '1px solid var(--m-border)',
            borderRadius: 10,
            outline: 'none',
            resize: 'none',
            color: 'var(--z-900)',
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 10,
              background: 'var(--m-bg)',
              color: 'var(--z-700)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => message && onSave(message, draft)}
            disabled={saving || !draft.trim()}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 10,
              background: draft.trim() ? 'var(--m-accent)' : 'var(--z-300)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </MSheet>
  );
}
