'use client';

/**
 * OP체크 상세 — 빠른 메시지 시트.
 * 같은 수술방 담당자 그룹(부서)에게 notifications 알림으로 빠른 메시지 발송.
 *
 * 채팅 라우팅 통합은 P4. 현재 단계에서는 notifications insert 만 수행.
 *
 * 입력:
 *  - quick chip ("환자 입실", "마취 시작", "수술 종료") 또는 직접 입력
 *  - 대상은 같은 회사·같은 부서(없으면 동일 회사) 재직자
 *
 * JM:  단일 책임 (시트 + 발송), ~180줄.
 * JM3: try/catch + toast, 발송 실패 시 sheet 닫지 않음.
 * JM4: any 금지. NotificationInsert / OpMessageKind union.
 * JM5: target user_id는 회사 일치 + 본인 제외. body는 trim, 길이 제한.
 * JM6: role="dialog" 내장(MSheet), chip은 button, textarea label 연결.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ErpUser, StaffMember } from '@/types';
import { db, d1 } from '@/lib/db-client';
import { isActiveStaff } from '@/lib/active-staff';
import { toast } from '@/lib/toast';
import MSheet from '../공통/MSheet';
import MBtn from '../공통/MBtn';
import type { OpCheckCard } from './data-hooks';

const QUICK_CHIPS = [
  '환자 입실',
  '마취 시작',
  '수술 시작',
  '수술 종료',
  '회복실 이송',
  '병동 인계 가능',
] as const;

const MAX_BODY = 300;

type NotificationInsert = {
  user_id: string;
  type: 'op_message';
  title: string;
  body: string;
  metadata: {
    schedule_id: string;
    room: string;
    patient: string;
    sender_id: string;
    sender_name: string;
  };
  read_at: null;
  created_at: string;
};

export default function OP메시지시트({
  open,
  card,
  user,
  onClose,
  onSent,
}: {
  open: boolean;
  card: OpCheckCard | null;
  user: ErpUser;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [targets, setTargets] = useState<StaffMember[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // 시트 열릴 때만 대상 조회 (JM2: 닫혀 있으면 fetch 안 함)
  useEffect(() => {
    if (!open) {
      setText('');
      setTargets([]);
      return;
    }
    let cancelled = false;
    setLoadingTargets(true);
    void (async () => {
      try {
        const company = typeof user.company === 'string' ? user.company : '';
        const dept = typeof user.department === 'string' ? user.department : '';
        let q = db
          .from('staff_members')
          .select('id, name, company, department, status')
          .limit(200);
        if (company) q = q.eq('company', company);
        if (dept) q = q.eq('department', dept);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const list = ((data ?? []) as StaffMember[])
          .filter(isActiveStaff)
          .filter((s) => s.id !== user.id);
        setTargets(list);
      } catch (err) {
        console.warn('[mobile-addon] op msg targets load', err);
        if (!cancelled) setTargets([]);
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user.id, user.company, user.department]);

  const normalized = useMemo(() => text.trim().slice(0, MAX_BODY), [text]);

  const send = useCallback(async () => {
    if (!card) return;
    if (!normalized) {
      toast('메시지를 입력해 주세요.', 'warning');
      return;
    }
    if (targets.length === 0) {
      toast('전송 대상이 없습니다.', 'warning');
      return;
    }
    setSending(true);
    try {
      const now = new Date().toISOString();
      const rows: NotificationInsert[] = targets.map((t) => ({
        user_id: t.id,
        type: 'op_message',
        title: `[수술방 ${card.room}] OP 메시지`,
        body: `${card.patient} · ${card.procedure}\n${normalized}`,
        metadata: {
          schedule_id: card.scheduleId,
          room: card.room,
          patient: card.patient,
          sender_id: user.id,
          sender_name: user.name ?? '',
        },
        read_at: null,
        created_at: now,
      }));
      const { error } = await d1.from('notifications').insert(rows);
      if (error) throw error;
      toast(`${targets.length}명에게 전송했습니다.`, 'success');
      onSent?.();
      onClose();
    } catch (err) {
      console.warn('[mobile-addon] op msg send', err);
      toast('메시지 전송에 실패했습니다.', 'error');
    } finally {
      setSending(false);
    }
  }, [card, normalized, targets, user.id, user.name, onClose, onSent]);

  if (!card) return null;

  return (
    <MSheet open={open} onClose={onClose} title={`OP 메시지 · 수술방 ${card.room}`}>
      <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700, lineHeight: 1.5 }}>
          {card.patient} · {card.procedure}
          <br />
          대상: {loadingTargets ? '불러오는 중…' : `같은 부서 담당자 ${targets.length}명`}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="빠른 메시지">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setText(chip)}
              disabled={sending}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 12px',
                borderRadius: 999,
                border: '1px solid var(--m-border)',
                background: 'var(--m-card)',
                color: 'var(--z-700)',
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-700)' }}>메시지 내용</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))}
            rows={4}
            placeholder="예) 환자 입실했습니다."
            disabled={sending}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 'var(--m-radius-md)',
              border: '1px solid var(--m-border)',
              background: 'var(--m-card)',
              color: 'var(--z-900)',
              resize: 'vertical',
              minHeight: 80,
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--z-500)', textAlign: 'right' }}>
            {normalized.length}/{MAX_BODY}
          </span>
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <MBtn block onClick={onClose} disabled={sending}>
            취소
          </MBtn>
          <MBtn
            block
            variant="primary"
            icon="send"
            onClick={() => void send()}
            disabled={sending || !normalized || targets.length === 0}
          >
            {sending ? '전송 중…' : '전송'}
          </MBtn>
        </div>
      </div>
    </MSheet>
  );
}
