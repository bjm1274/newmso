'use client';

/**
 * PushSettingCard — 모바일 알림 화면 상단 "푸시 알림 설정" 섹션
 *
 * 책임: 권한 상태 표시 + 구독 토글 + 테스트 발송
 * JM: 단일 책임, ~160줄
 * JM2: 마운트 1회 상태 fetch, 토글 낙관적 업데이트
 * JM3: 케이스별 에러 토스트 (denied / 권한거부 / 네트워크 실패)
 * JM4: any 금지, PushConnectionStatus 타입 사용
 * JM5: 본인 구독만 토글, endpoint 직접 노출 안 함
 * JM6: button + aria-pressed + aria-busy + aria-label
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPushConnectionStatus,
  initNotificationService,
  deletePushSubscriptionOnServer,
  type PushConnectionStatus,
} from '@/app/main/기능부품/알림푸시';
import { toast } from '@/lib/toast';
import MIcon from '../공통/MIcon';

// ─── 타입 ───

type PushSettingState =
  | { phase: 'loading' }
  | { phase: 'unsupported'; reason: string }
  | { phase: 'denied' }
  | { phase: 'idle'; active: boolean }
  | { phase: 'busy' };

// ─── 권한 상태 배지 ───

function PermBadge({ permission }: { permission: PushConnectionStatus['permission'] }) {
  if (permission === 'granted') {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-success, #16a34a)', background: 'var(--success-soft, #dcfce7)', borderRadius: 6, padding: '2px 7px' }}>
        허용됨
      </span>
    );
  }
  if (permission === 'denied') {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-danger, #dc2626)', background: 'var(--danger-soft, #fee2e2)', borderRadius: 6, padding: '2px 7px' }}>
        차단됨
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-600)', background: 'var(--muted)', borderRadius: 6, padding: '2px 7px' }}>
      미설정
    </span>
  );
}

// ─── 토글 스위치 ───

function Toggle({ active, busy, disabled, onToggle, label }: {
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-pressed={active}
      aria-busy={busy}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onToggle}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        border: 'none',
        background: active ? 'var(--m-accent, #2563eb)' : 'var(--z-300, #d1d5db)',
        position: 'relative',
        cursor: disabled || busy ? 'not-allowed' : 'pointer',
        transition: 'background 0.18s',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: active ? 21 : 3,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        transition: 'left 0.18s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {busy && (
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            border: '2px solid var(--z-400)', borderTopColor: 'transparent',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }} />
        )}
      </span>
    </button>
  );
}

// ─── 메인 컴포넌트 ───

export type PushSettingCardProps = {
  staffId: string | null;
};

export default function PushSettingCard({ staffId }: PushSettingCardProps) {
  const [st, setSt] = useState<PushSettingState>({ phase: 'loading' });
  const statusRef = useRef<PushConnectionStatus | null>(null);
  const vapidKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : undefined;

  const loadStatus = useCallback(async () => {
    setSt({ phase: 'loading' });
    try {
      const s = await getPushConnectionStatus(staffId ?? undefined);
      statusRef.current = s;
      if (!s.supported || !s.secureContext) {
        setSt({ phase: 'unsupported', reason: !s.secureContext ? 'HTTPS 환경이 필요합니다.' : '이 브라우저는 푸시 알림을 지원하지 않습니다.' });
        return;
      }
      if (s.permission === 'denied') {
        setSt({ phase: 'denied' });
        return;
      }
      setSt({ phase: 'idle', active: s.active });
    } catch {
      setSt({ phase: 'idle', active: false });
    }
  }, [staffId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const handleToggle = useCallback(async () => {
    if (st.phase !== 'idle') return;
    const wasActive = st.active;
    // 낙관적 업데이트
    setSt({ phase: 'busy' });
    try {
      if (!wasActive) {
        // 활성화: 권한 요청 포함 initNotificationService
        await initNotificationService({ staffId: staffId ?? undefined, requestPermission: true });
        const next = await getPushConnectionStatus(staffId ?? undefined);
        statusRef.current = next;
        if (next.permission === 'denied') {
          setSt({ phase: 'denied' });
          toast('브라우저 설정에서 알림 권한을 허용해 주세요.', 'error');
          return;
        }
        if (!next.active) {
          toast('푸시 구독에 실패했습니다. 다시 시도해 주세요.', 'error');
          setSt({ phase: 'idle', active: false });
          return;
        }
        setSt({ phase: 'idle', active: true });
        toast('푸시 알림이 활성화되었습니다.', 'success');
      } else {
        // 비활성화: SW에서 구독 해제 후 서버 DELETE
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await deletePushSubscriptionOnServer(endpoint);
        }
        setSt({ phase: 'idle', active: false });
        toast('푸시 알림이 비활성화되었습니다.', 'success');
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '알 수 없는 오류';
      toast(`푸시 설정 실패: ${msg}`, 'error');
      setSt({ phase: 'idle', active: wasActive });
    }
  }, [st, staffId]);

  const handleSelfTest = useCallback(async () => {
    setSt(prev => prev.phase === 'idle' ? { phase: 'busy' } : prev);
    try {
      const res = await fetch('/api/notifications/push-self-test', { method: 'POST' });
      const json = await res.json() as { ok: boolean; summary?: string };
      if (json.ok) {
        toast(json.summary ?? '테스트 푸시를 발송했습니다. 알림창을 확인하세요.', 'success');
      } else {
        toast(json.summary ?? '푸시 발송 실패. 구독 상태를 확인하세요.', 'error');
      }
    } catch {
      toast('테스트 발송 중 네트워크 오류가 발생했습니다.', 'error');
    } finally {
      void loadStatus();
    }
  }, [loadStatus]);

  // VAPID 미설정 안내
  if (!vapidKey) {
    return (
      <div className="m-card" style={{ margin: '12px 16px 0', padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <MIcon name="alertTri" size={18} color="var(--z-500)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-700)' }}>푸시 알림 미설정</div>
          <div style={{ fontSize: 12, color: 'var(--z-500)', marginTop: 3 }}>관리자에게 VAPID 키 설정을 요청해 주세요.</div>
        </div>
      </div>
    );
  }

  if (st.phase === 'loading') {
    return (
      <div className="m-card" style={{ margin: '12px 16px 0', padding: '14px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--z-400)' }}>푸시 알림 설정 불러오는 중…</div>
      </div>
    );
  }

  if (st.phase === 'unsupported') {
    return (
      <div className="m-card" style={{ margin: '12px 16px 0', padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <MIcon name="info" size={18} color="var(--z-400)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-700)' }}>푸시 알림 미지원</div>
          <div style={{ fontSize: 12, color: 'var(--z-500)', marginTop: 3 }}>{st.reason}</div>
          <div style={{ fontSize: 11, color: 'var(--z-400)', marginTop: 4 }}>iOS는 홈 화면에 추가 후 지원됩니다 (iOS 16.4+).</div>
        </div>
      </div>
    );
  }

  if (st.phase === 'denied') {
    return (
      <div className="m-card" style={{ margin: '12px 16px 0', padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <MIcon name="alertTri" size={18} color="var(--m-danger, #dc2626)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--z-700)' }}>알림 권한 차단됨</div>
          <div style={{ fontSize: 12, color: 'var(--z-500)', marginTop: 3 }}>브라우저 설정 → 사이트 권한 → 알림에서 허용으로 변경 후 앱을 새로고침하세요.</div>
        </div>
      </div>
    );
  }

  const active = st.phase === 'idle' ? st.active : false;
  const busy = st.phase === 'busy';

  return (
    <div className="m-card" style={{ margin: '12px 16px 0', padding: '14px 16px' }}>
      {/* 헤더 행: 제목 + 권한 배지 + 토글 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MIcon name="bell" size={18} color="var(--m-accent, #2563eb)" />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 800, letterSpacing: '-0.012em' }}>푸시 알림 설정</span>
        {statusRef.current && <PermBadge permission={statusRef.current.permission} />}
        <Toggle
          active={active}
          busy={busy}
          disabled={false}
          onToggle={() => void handleToggle()}
          label={active ? '푸시 알림 끄기' : '푸시 알림 켜기'}
        />
      </div>

      {/* 안내 문구 */}
      <div style={{ fontSize: 12, color: 'var(--z-500)', marginTop: 8, lineHeight: 1.5 }}>
        {active
          ? '이 기기에서 결재·채팅·공지 알림을 수신합니다.'
          : '토글을 켜면 결재·채팅·공지 알림을 받을 수 있습니다.'}
      </div>

      {/* 테스트 버튼 (활성 상태에서만) */}
      {active && !busy && (
        <button
          type="button"
          aria-label="테스트 푸시 발송"
          onClick={() => void handleSelfTest()}
          style={{
            marginTop: 12,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--m-accent, #2563eb)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <MIcon name="zap" size={13} />
          테스트 알림 보내기
        </button>
      )}
    </div>
  );
}
