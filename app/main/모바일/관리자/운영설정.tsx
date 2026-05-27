'use client';

/**
 * SAdminOps — 운영 설정 (4 segment)
 *
 * 일반 / 메시지 12 / 팝업 / 외부연동 6
 *  - 메시지 12종: supabase message_templates → 실패시 PC fallback
 *    · admin/mso는 활성 ↔ 보류 토글 가능 (단순 mutation)
 *  - 외부연동 6: supabase external_integrations → 실패시 PC fallback (read-only)
 *  - 일반/팝업은 read-only (편집은 데스크톱)
 *
 * JM:  500줄 이내, 단일 책임
 * JM2: 진입 시 1회 fetch (PC IntegrationsTab/MessageTemplatesTab 패턴과 동일)
 * JM3: 토글 mutation은 try/catch + 낙관적 업데이트 + 롤백 + toast
 * JM4: OpsTab union, supabase row 안전 좁히기, status union 검증
 * JM5: 회사 컨텍스트는 전사 설정에 비적용. 토글은 admin/mso 가드
 * JM6: 칩바 role=tablist, 토글 button + aria-pressed + aria-busy + label
 */

import { memo, useCallback, useEffect, useState } from 'react';
import type { ErpUser } from '@/types';
import { supabase } from '@/lib/supabase';
import { isAdminUser, isMsoUser } from '@/lib/access-control';
import { toast } from '@/lib/toast';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';
import MListRow from '../공통/MListRow';
import { DesktopHint } from './공용UI';
import {
  toggleMessageTemplateStatus,
  type MChipTone,
  type MessageTemplateStatus,
} from './data-hooks';

type OpsTab = 'general' | 'msg' | 'popup' | 'int';

const TABS: { id: OpsTab; label: string }[] = [
  { id: 'general', label: '일반' },
  { id: 'msg', label: '메시지 12' },
  { id: 'popup', label: '팝업' },
  { id: 'int', label: '외부연동 6' },
];

export interface 운영설정Props {
  user: ErpUser;
  onBack: () => void;
}

export default function 운영설정({ user, onBack }: 운영설정Props) {
  const [tab, setTab] = useState<OpsTab>('general');
  const company = typeof user.company === 'string' ? user.company : '';
  const canToggle = isAdminUser(user) || isMsoUser(user);
  return (
    <div className="m-screen">
      <MobileHeader title="운영 설정" sub={company || '운영 콘솔'} back={onBack} />
      <div className="m-chip-bar" role="tablist" aria-label="운영 설정 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <DesktopHint>
        {tab === 'msg'
          ? '템플릿 내용 편집은 데스크톱 — 모바일은 활성/보류 토글만'
          : '편집은 데스크톱에서 — 모바일은 조회만'}
      </DesktopHint>
      <div className="m-scroll">
        {tab === 'general' && <GeneralTab />}
        {tab === 'msg' && (
          <MessageTab
            canToggle={canToggle}
            actor={{ userId: user.id, userName: user.name }}
          />
        )}
        {tab === 'popup' && <PopupTab />}
        {tab === 'int' && <IntegrationTab />}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 일반 탭
// ─────────────────────────────────────────────────────────────

const GENERAL_ROWS = [
  { label: '기본 언어', value: '한국어' },
  { label: '시간대', value: 'Asia/Seoul (KST)' },
  { label: '주 시작일', value: '월요일' },
  { label: '화폐 단위', value: 'KRW · 원' },
  { label: '세션 만료', value: '30분' },
  { label: 'PWA 푸시 알림', value: '활성' },
];

const GeneralTab = memo(function GeneralTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {GENERAL_ROWS.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr auto',
              padding: '13px 16px',
              borderBottom: i < GENERAL_ROWS.length - 1 ? '1px solid var(--m-border)' : 'none',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--z-500)', fontWeight: 700 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.value}</div>
            <MIcon name="chevR" size={16} color="var(--z-400)" />
          </div>
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 메시지 12종
// ─────────────────────────────────────────────────────────────

interface MsgItem {
  id: string;
  name: string;
  group: 'a' | 'b' | 'c';
  channel: string;
  usage: number;
  tone: MChipTone;
  status: MessageTemplateStatus;
  /** supabase row인 경우만 true — fallback은 토글 불가 */
  isRemote: boolean;
}

const FALLBACK_MSG: MsgItem[] = [
  { id: 'm1', name: '결재 알림', group: 'a', channel: '이메일·푸시', usage: 124, tone: 'accent', status: '활성', isRemote: false },
  { id: 'm2', name: '결재 24h 초과 알림', group: 'a', channel: '슬랙', usage: 8, tone: 'accent', status: '활성', isRemote: false },
  { id: 'm3', name: '근태 이상 알림', group: 'b', channel: '이메일', usage: 18, tone: 'warning', status: '활성', isRemote: false },
  { id: 'm4', name: '급여 명세 발송', group: 'b', channel: '이메일', usage: 27, tone: '', status: '활성', isRemote: false },
  { id: 'm5', name: '증명서 발급 완료', group: 'b', channel: '카카오톡', usage: 86, tone: '', status: '활성', isRemote: false },
  { id: 'm6', name: '재고 부족 경고', group: 'b', channel: '슬랙', usage: 42, tone: 'danger', status: '활성', isRemote: false },
  { id: 'm7', name: '생일 축하 메시지', group: 'c', channel: '카카오톡', usage: 22, tone: 'success', status: '활성', isRemote: false },
  { id: 'm8', name: '분기 환자 안내', group: 'c', channel: '카카오톡', usage: 412, tone: '', status: '활성', isRemote: false },
  { id: 'm9', name: '개원 기념 안내', group: 'c', channel: '카카오톡', usage: 32, tone: '', status: '활성', isRemote: false },
];

function pickMessageStatus(value: unknown): MessageTemplateStatus {
  if (value === '활성' || value === '초안' || value === '보류') return value;
  return '활성';
}

const MSG_GROUPS: { group: 'a' | 'b' | 'c'; label: string; tone: MChipTone }[] = [
  { group: 'a', label: '템플릿 a · 결재', tone: 'accent' },
  { group: 'b', label: '템플릿 b · 알림', tone: 'success' },
  { group: 'c', label: '템플릿 c · 마케팅', tone: 'warning' },
];

function useMessages(): {
  items: MsgItem[];
  loading: boolean;
  setLocal: (updater: (prev: MsgItem[]) => MsgItem[]) => void;
} {
  const [items, setItems] = useState<MsgItem[]>(FALLBACK_MSG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('message_templates')
          .select('id, name, channel, send_count, status, template_group')
          .order('name');
        if (!alive) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          // 폴백 유지
        } else {
          const parsed = data.map<MsgItem | null>((row) => {
            if (!row || typeof row !== 'object') return null;
            const r = row as Record<string, unknown>;
            const id = typeof r.id === 'string' ? r.id : typeof r.id === 'number' ? String(r.id) : null;
            const name = typeof r.name === 'string' ? r.name : null;
            const channel = typeof r.channel === 'string' ? r.channel : '시스템';
            if (!id || !name) return null;
            const usage =
              typeof r.send_count === 'number'
                ? r.send_count
                : Number.isFinite(Number(r.send_count))
                  ? Number(r.send_count)
                  : 0;
            const group: 'a' | 'b' | 'c' =
              r.template_group === 'a' || r.template_group === 'b' || r.template_group === 'c'
                ? r.template_group
                : 'b';
            const status = pickMessageStatus(r.status);
            return { id, name, group, channel, usage, tone: '', status, isRemote: true };
          }).filter((i): i is MsgItem => i !== null);
          if (parsed.length > 0) setItems(parsed);
        }
      } catch {
        // 폴백 유지
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return {
    items,
    loading,
    setLocal: (updater) => setItems((prev) => updater(prev)),
  };
}

interface MessageTabProps {
  canToggle: boolean;
  actor: { userId?: string; userName?: string };
}

const MessageTab = memo(function MessageTab({ canToggle, actor }: MessageTabProps) {
  const { items, setLocal } = useMessages();
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginBottom: 12,
        }}
      >
        {MSG_GROUPS.map((g) => {
          const count = items.filter((m) => m.group === g.group).length;
          const color =
            g.tone === 'accent'
              ? 'var(--m-accent)'
              : g.tone === 'success'
                ? 'var(--m-success)'
                : 'var(--m-warning)';
          return (
            <div key={g.group} className="m-card" style={{ padding: '10px 10px' }}>
              <div
                style={{ fontSize: 10, color: 'var(--z-500)', fontWeight: 700, lineHeight: 1.4 }}
              >
                {g.label}
              </div>
              <div
                className="m-tnum"
                style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}
              >
                {count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="m-card flush">
        {items.map((m) => (
          <MessageRow
            key={m.id}
            item={m}
            canToggle={canToggle}
            actor={actor}
            setLocal={setLocal}
          />
        ))}
      </div>
    </div>
  );
});

interface MessageRowProps {
  item: MsgItem;
  canToggle: boolean;
  actor: { userId?: string; userName?: string };
  setLocal: (updater: (prev: MsgItem[]) => MsgItem[]) => void;
}

const MessageRow = memo(function MessageRow({ item, canToggle, actor, setLocal }: MessageRowProps) {
  const [busy, setBusy] = useState(false);
  const groupTone: MChipTone =
    item.group === 'a' ? 'accent' : item.group === 'b' ? 'success' : 'warning';
  // 초안 상태는 데스크톱 전용 — 모바일에서는 토글 비활성화
  const toggleEnabled = canToggle && item.isRemote && item.status !== '초안';
  const isActive = item.status === '활성';

  const handleToggle = useCallback(async () => {
    if (!toggleEnabled || busy) return;
    const before = item.status;
    const optimisticNext: MessageTemplateStatus = before === '활성' ? '보류' : '활성';
    setLocal((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, status: optimisticNext } : m)),
    );
    setBusy(true);
    const { error, next } = await toggleMessageTemplateStatus(
      item.id,
      item.name,
      before,
      actor,
    );
    setBusy(false);
    if (error) {
      // 롤백
      setLocal((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, status: before } : m)),
      );
      toast('메시지 상태 변경 실패: ' + error, 'error');
      return;
    }
    // 서버 결과와 동기화 (낙관적 값과 동일하지만 안전 차원)
    setLocal((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, status: next } : m)),
    );
    toast(`${item.name} ${next === '활성' ? '활성' : '보류'}로 변경됨`, 'success');
  }, [actor, busy, item, setLocal, toggleEnabled]);

  return (
    <div className="m-list-row" style={{ opacity: isActive ? 1 : 0.6 }}>
      <MChip tone={groupTone}>{item.group}</MChip>
      <div>
        <div className="lbl">{item.name}</div>
        <div className="sub">
          {item.channel} · 사용 {item.usage.toLocaleString('ko-KR')}
          {item.status !== '활성' && (
            <>
              {' · '}
              <span style={{ color: 'var(--m-warning)', fontWeight: 700 }}>{item.status}</span>
            </>
          )}
        </div>
      </div>
      {toggleEnabled ? (
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          aria-pressed={isActive}
          aria-busy={busy}
          aria-label={`${item.name} ${isActive ? '보류' : '활성'}으로 토글`}
          title={isActive ? '보류로 전환' : '활성으로 전환'}
          style={{
            width: 40,
            height: 24,
            borderRadius: 999,
            border: 'none',
            background: isActive ? 'var(--m-success)' : 'var(--z-300)',
            position: 'relative',
            cursor: busy ? 'wait' : 'pointer',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: isActive ? 19 : 3,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              transition: 'left 0.15s',
            }}
          />
        </button>
      ) : (
        <MIcon name="chevR" size={18} color="var(--z-400)" />
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 팝업
// ─────────────────────────────────────────────────────────────

const POPUP_ROWS = [
  { name: '5월 운영 시간 변경 안내', status: '활성', tone: 'success' as MChipTone, expires: '5/31까지' },
  { name: '개원 기념일 휴무', status: '예약', tone: 'warning' as MChipTone, expires: '5/20 시작' },
  { name: '2026 신년 인사', status: '완료', tone: '' as MChipTone, expires: '1/15 종료' },
];

const PopupTab = memo(function PopupTab() {
  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div className="m-card flush">
        {POPUP_ROWS.map((r) => (
          <MListRow
            key={r.name}
            icon="info"
            iconTone={r.tone}
            label={r.name}
            sub={r.expires}
            rightSlot={<MChip tone={r.tone}>{r.status}</MChip>}
          />
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// 외부연동 6
// ─────────────────────────────────────────────────────────────

interface IntegrationItem {
  id: string;
  name: string;
  desc: string;
  status: '연결' | '대기' | '끊김';
  tone: MChipTone;
  icon: string;
}

const FALLBACK_INT: IntegrationItem[] = [
  { id: 'i1', name: '카카오톡', desc: '알림톡 발송', status: '연결', tone: 'success', icon: 'chat' },
  { id: 'i2', name: '네이버웍스', desc: '캘린더 동기화', status: '연결', tone: 'success', icon: 'chat' },
  { id: 'i3', name: '슬랙', desc: '관리자 채널', status: '연결', tone: 'success', icon: 'chat' },
  { id: 'i4', name: '홈택스', desc: '전자세금계산서', status: '연결', tone: 'success', icon: 'won' },
  { id: 'i5', name: 'EDI', desc: '발주 EDI 4사', status: '대기', tone: 'warning', icon: 'fileText' },
  { id: 'i6', name: '국민은행', desc: '펌뱅킹', status: '끊김', tone: 'danger', icon: 'won' },
];

function useIntegrationData(): { items: IntegrationItem[]; loading: boolean } {
  const [items, setItems] = useState<IntegrationItem[]>(FALLBACK_INT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('external_integrations')
          .select('id, vendor, name, sub, status, last_synced_label')
          .order('vendor');
        if (!alive) return;
        if (!error && Array.isArray(data) && data.length > 0) {
          const parsed = data.map<IntegrationItem | null>((row) => {
            if (!row || typeof row !== 'object') return null;
            const r = row as Record<string, unknown>;
            const id = typeof r.id === 'string' ? r.id : typeof r.id === 'number' ? String(r.id) : null;
            const name = typeof r.name === 'string' ? r.name : null;
            const desc = typeof r.sub === 'string' ? r.sub : '';
            if (!id || !name) return null;
            const rawStatus = typeof r.status === 'string' ? r.status : 'connected';
            const status =
              rawStatus === 'connected' ? '연결' : rawStatus === 'pending' ? '대기' : '끊김';
            const tone: MChipTone =
              status === '연결' ? 'success' : status === '대기' ? 'warning' : 'danger';
            const vendor = typeof r.vendor === 'string' ? r.vendor : '';
            const icon =
              vendor === 'hometax' || vendor === 'bank'
                ? 'won'
                : vendor === 'edi'
                  ? 'fileText'
                  : 'chat';
            return { id, name, desc, status, tone, icon };
          }).filter((i): i is IntegrationItem => i !== null);
          if (parsed.length > 0) setItems(parsed);
        }
      } catch {
        // 폴백 유지
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { items, loading };
}

const IntegrationTab = memo(function IntegrationTab() {
  const { items } = useIntegrationData();
  return (
    <div
      style={{
        padding: '14px 16px 0',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}
    >
      {items.map((it) => (
        <div key={it.id} className="m-card" style={{ padding: '14px 14px' }}>
          <div className={'ico-tile tone-' + (it.tone || '')} style={{ width: 36, height: 36 }}>
            <MIcon name={it.icon} size={18} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 10 }}>{it.name}</div>
          <div
            style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}
          >
            {it.desc}
          </div>
          <div style={{ marginTop: 8 }}>
            <MChip tone={it.tone} dot>
              {it.status}
            </MChip>
          </div>
        </div>
      ))}
    </div>
  );
});
