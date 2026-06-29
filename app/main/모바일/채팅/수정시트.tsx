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
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--z-500)', fontWeight: 500, lineHeight: 1.5, textAlign: 'center' }}>
          전송한 메시지를 수정하면 모든 참여자에게 바로 반영됩니다.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          aria-label="수정할 메시지"
          placeholder="수정할 메시지를 입력해 주세요"
          disabled={saving}
          className="macos-squircle-sm"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: 14,
            fontFamily: 'inherit',
            background: 'rgba(120, 120, 128, 0.08)',
            border: '1px solid rgba(120, 120, 128, 0.15)',
            outline: 'none',
            resize: 'none',
            color: 'var(--z-900)',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#007AFF';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'rgba(120, 120, 128, 0.15)';
          }}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="macos-squircle-sm"
            style={{
              flex: 1,
              padding: '13px',
              background: 'rgba(120, 120, 128, 0.16)',
              color: 'var(--z-800)',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => message && onSave(message, draft)}
            disabled={saving || !draft.trim()}
            className="macos-squircle-sm"
            style={{
              flex: 1,
              padding: '13px',
              background: draft.trim() ? 'linear-gradient(135deg, #007AFF, #0A55E1)' : 'rgba(120, 120, 128, 0.08)',
              color: draft.trim() ? '#fff' : 'rgba(120, 120, 128, 0.35)',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: draft.trim() ? '0 4px 12px rgba(0, 122, 255, 0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </MSheet>
  );
}
